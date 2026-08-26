use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fmt;
use std::str::FromStr;

use crate::rollout::ConditionTransitionWeights;
use crate::{
    ActionPreview, CraftActionId, CraftBuffs, CraftFailureReason, CraftState, CraftTerminal,
    CrafterProfile, EpisodeRandomStream, ExplanationCode, MATERIAL_CONDITION_COUNT,
    MaterialCondition, ObservedActionOutcome, RandomDrawCursor, RecipeProfile,
    apply_observed_outcome, draw_simulated_action_outcome, preview_action,
};

pub const ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION: &str = "native-adaptive-policy-matrix-v1";
pub const ADAPTIVE_POLICY_PROGRAM_VERSION: &str = "craft-adaptive-policy-program-v2";
pub const ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION: &str = "craft-adaptive-policy-features-v2";
pub const ADAPTIVE_POLICY_SAFETY_VERSION: &str = "solver-policy-safety-v1";
pub const ADAPTIVE_POLICY_SCENARIO_IDENTITY_VERSION: &str = "craft-scenario-model-identity-v1";
pub const ADAPTIVE_POLICY_MAX_NODES: usize = 256;
pub const ADAPTIVE_POLICY_MAX_CASES: usize = 64;
pub const ADAPTIVE_POLICY_MAX_STEPS_PER_CASE: u32 = 64;
pub const ADAPTIVE_POLICY_MAX_PROJECTED_TRANSITIONS: u64 = 4_096;
pub const ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES: usize = 1_024;
pub const ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS: u64 = 25_000_000;
pub const ADAPTIVE_POLICY_MAX_OUTPUT_BYTES: u64 = 64 * 1024 * 1024;

const EMPTY: &str = "-";
const ACTION_COUNT: usize = 35;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
const ADAPTIVE_POLICY_OUTPUT_BASE_BYTES_PER_STEP: u64 = 16 * 1_024;
const ADAPTIVE_POLICY_OUTPUT_BASE_BYTES_PER_OUTCOME: u64 = 8 * 1_024;
const ADAPTIVE_POLICY_OUTPUT_SUMMARY_BYTES: u64 = 4 * 1_024;
// The formatter materializes each flag value as a String cell before joining rows.
const ADAPTIVE_POLICY_PROJECTED_BYTES_PER_FLAG_CELL: u64 = 32;
const FNV32_OFFSET_BASIS: u32 = 0x811c_9dc5;
const FNV32_PRIME: u32 = 0x0100_0193;

// This protocol is a frozen historical artifact for the five-recipe adaptive
// checkpoint. Keep its eight-condition wire stable. The live v2 transition,
// rollout, and root-plan protocols own Robust support; adaptive v1 fails closed
// if a caller attempts to start from Robust.
const ADAPTIVE_POLICY_V1_WIRE_CONDITIONS: &[MaterialCondition] = &[
    MaterialCondition::Normal,
    MaterialCondition::Good,
    MaterialCondition::GoodOmen,
    MaterialCondition::Centered,
    MaterialCondition::Sturdy,
    MaterialCondition::Pliant,
    MaterialCondition::Malleable,
    MaterialCondition::Primed,
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyIdentity {
    pub program_id: String,
    pub program_content_hash: String,
    pub scenario_id: String,
    pub recipe_profile_id: String,
    pub scenario_model_identity_version: String,
    pub scenario_model_content_hash: String,
    pub objective_id: String,
    pub objective_mode: String,
    pub quality_maximum: i32,
    pub feature_schema_version: String,
    pub safety_version: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum GuardValue {
    Integer(i64),
    Boolean(bool),
    Enumeration(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Guard {
    feature: String,
    operator: String,
    value: GuardValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ResumeMutation {
    ActiveNode,
    Clear,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FlagMutation {
    flag: String,
    value: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum RouteTarget {
    Node(String),
    Resume,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum RouteEffect {
    Goto {
        target: RouteTarget,
        set_resume: Option<ResumeMutation>,
        set_flag: Option<FlagMutation>,
    },
    Terminate(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AdaptiveTransition {
    id: String,
    guards: Vec<Guard>,
    effect: RouteEffect,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AdaptiveDecision {
    id: String,
    guards: Vec<Guard>,
    actions: Vec<CraftActionId>,
    allow_below_objective_completion: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AdaptiveNode {
    ordinal: u32,
    id: String,
    action_budget: u32,
    transitions: Vec<AdaptiveTransition>,
    decisions: Vec<AdaptiveDecision>,
    on_budget_exhausted: RouteEffect,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyProgram {
    pub identity: AdaptivePolicyIdentity,
    pub entry_node: String,
    pub max_actions: u32,
    pub max_settle_hops: u32,
    nodes: Vec<AdaptiveNode>,
    node_indexes: HashMap<String, usize>,
    pub flag_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AdaptivePolicyCase {
    pub case_id: String,
    pub crafter_case_id: String,
    pub world_id: String,
    pub identity: AdaptivePolicyIdentity,
    pub recipe: RecipeProfile,
    pub crafter: CrafterProfile,
    pub initial_state: CraftState,
    pub seed: u32,
    pub initial_cursor: RandomDrawCursor,
    pub max_steps: u32,
    pub condition_transition_weights: ConditionTransitionWeights,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AdaptivePolicyMatrixRequest {
    pub program: AdaptivePolicyProgram,
    pub cases: Vec<AdaptivePolicyCase>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyMemory {
    pub active_node_id: String,
    pub resume_node_id: Option<String>,
    pub total_action_uses: u32,
    pub total_no_step_uses: u32,
    pub node_action_uses: u32,
    pub node_no_step_uses: u32,
    pub total_observed_transitions: u32,
    pub action_uses: [u32; ACTION_COUNT],
    pub flags: BTreeMap<String, bool>,
    pub last_action: Option<CraftActionId>,
    pub last_action_success: Option<bool>,
    pub terminated: bool,
    pub termination_reason: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyDecisionResult {
    pub action: Option<CraftActionId>,
    pub node_id: String,
    pub decision_id: Option<String>,
    pub memory: AdaptivePolicyMemory,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyTraceStep {
    pub index: u32,
    pub decision: AdaptivePolicyDecisionResult,
    pub success: bool,
    pub next_condition: MaterialCondition,
    pub cursor_before: RandomDrawCursor,
    pub cursor_after: RandomDrawCursor,
    pub before: CraftState,
    pub after: CraftState,
    pub memory_after: AdaptivePolicyMemory,
    pub explanation_codes: Vec<ExplanationCode>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdaptivePolicyStopReason {
    Completed,
    Failed,
    PolicyNull,
    ActionLimit,
}

impl AdaptivePolicyStopReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::PolicyNull => "policy-null",
            Self::ActionLimit => "action-limit",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyFinalStatus {
    pub node_id: String,
    pub decision_id: Option<String>,
    pub status: &'static str,
    pub termination_reason: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyOutcome {
    pub case_id: String,
    pub crafter_case_id: String,
    pub world_id: String,
    pub identity: AdaptivePolicyIdentity,
    pub seed: u32,
    pub stop_reason: AdaptivePolicyStopReason,
    pub initial_cursor: RandomDrawCursor,
    pub final_cursor: RandomDrawCursor,
    pub final_status: AdaptivePolicyFinalStatus,
    pub final_state: CraftState,
    pub final_memory: AdaptivePolicyMemory,
    pub steps: Vec<AdaptivePolicyTraceStep>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptivePolicyParseError {
    pub case_id: String,
    pub message: String,
}

impl fmt::Display for AdaptivePolicyParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for AdaptivePolicyParseError {}

struct Cells<'a> {
    values: Vec<&'a str>,
    index: usize,
}

impl<'a> Cells<'a> {
    fn new(line: &'a str) -> Self {
        Self {
            values: line.trim_end_matches(['\r', '\n']).split('\t').collect(),
            index: 0,
        }
    }

    fn next(&mut self, name: &str) -> Result<&'a str, String> {
        let Some(value) = self.values.get(self.index).copied() else {
            return Err(format!("missing {name} at column {}", self.index + 1));
        };
        self.index += 1;
        Ok(value)
    }

    fn expect(&mut self, expected: &str, name: &str) -> Result<(), String> {
        let actual = self.next(name)?;
        if actual == expected {
            Ok(())
        } else {
            Err(format!("expected {name} {expected}, got {actual}"))
        }
    }

    fn parse<T>(&mut self, name: &str) -> Result<T, String>
    where
        T: FromStr,
        T::Err: fmt::Display,
    {
        let value = self.next(name)?;
        value
            .parse::<T>()
            .map_err(|error| format!("invalid {name} at column {}: {error}", self.index))
    }

    fn boolean(&mut self, name: &str) -> Result<bool, String> {
        match self.next(name)? {
            "0" => Ok(false),
            "1" => Ok(true),
            value => Err(format!("{name} must be 0 or 1, got {value}")),
        }
    }

    fn optional(&mut self, name: &str) -> Result<Option<String>, String> {
        let value = self.next(name)?;
        if value == EMPTY {
            Ok(None)
        } else {
            safe_cell(value, name)?;
            Ok(Some(value.to_owned()))
        }
    }

    fn finish(self) -> Result<(), String> {
        if self.index == self.values.len() {
            Ok(())
        } else {
            Err(format!(
                "unexpected extra field at column {}",
                self.index + 1
            ))
        }
    }
}

fn safe_cell(value: &str, name: &str) -> Result<(), String> {
    if value.is_empty() || value.contains(['\t', '\r', '\n']) {
        return Err(format!("{name} must be a non-empty safe TSV cell"));
    }
    if value.len() > ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES {
        return Err(format!(
            "{name} exceeds the adaptive-policy protocol cell cap of {ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES} bytes"
        ));
    }
    Ok(())
}

fn versioned_identifier(value: &str, name: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let starts_valid = bytes
        .first()
        .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
    let all_valid = bytes.iter().all(|byte| {
        byte.is_ascii_lowercase()
            || byte.is_ascii_digit()
            || matches!(*byte, b'.' | b'_' | b':' | b'-')
    });
    if starts_valid && bytes.len() <= 128 && all_valid {
        Ok(())
    } else {
        Err(format!(
            "{name} must be a lowercase versioned identifier of at most 128 characters"
        ))
    }
}

fn content_hash(value: &str, name: &str) -> Result<(), String> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return Err(format!("{name} must start with sha256:"));
    };
    if hex.len() != 64
        || !hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(format!(
            "{name} must contain 64 lowercase hexadecimal digits"
        ));
    }
    Ok(())
}

fn parse_finite(cells: &mut Cells<'_>, name: &str) -> Result<f64, String> {
    let value = cells.parse::<f64>(name)?;
    if value.is_finite() {
        Ok(value)
    } else {
        Err(format!("{name} must be finite"))
    }
}

fn parse_recipe(cells: &mut Cells<'_>) -> Result<RecipeProfile, String> {
    Ok(RecipeProfile {
        canonical_recipe_id: cells.parse("canonicalRecipeId")?,
        recipe_level: cells.parse("recipeLevel")?,
        progress_required: cells.parse("progressRequired")?,
        quality_max: cells.parse("qualityMax")?,
        required_quality: cells.parse("requiredQuality")?,
        durability_max: cells.parse("durabilityMax")?,
        progress_divider: parse_finite(cells, "progressDivider")?,
        quality_divider: parse_finite(cells, "qualityDivider")?,
        progress_modifier: parse_finite(cells, "progressModifier")?,
        quality_modifier: parse_finite(cells, "qualityModifier")?,
    })
}

fn parse_crafter(cells: &mut Cells<'_>) -> Result<CrafterProfile, String> {
    Ok(CrafterProfile {
        level: cells.parse("crafterLevel")?,
        craftsmanship: cells.parse("craftsmanship")?,
        control: cells.parse("control")?,
        max_cp: cells.parse("maxCp")?,
        cosmic_tool_good_bonus: cells.boolean("cosmicToolGoodBonus")?,
        specialist: cells.boolean("specialist")?,
    })
}

fn parse_state(cells: &mut Cells<'_>) -> Result<CraftState, String> {
    Ok(CraftState {
        step: cells.parse("step")?,
        progress: cells.parse("progress")?,
        quality: cells.parse("quality")?,
        durability: cells.parse("durability")?,
        cp: cells.parse("cp")?,
        condition: cells.parse("condition")?,
        inner_quiet: cells.parse("innerQuiet")?,
        buffs: CraftBuffs {
            waste_not: cells.parse("buffs.wasteNot")?,
            veneration: cells.parse("buffs.veneration")?,
            great_strides: cells.parse("buffs.greatStrides")?,
            innovation: cells.parse("buffs.innovation")?,
            final_appraisal: cells.parse("buffs.finalAppraisal")?,
            manipulation: cells.parse("buffs.manipulation")?,
            muscle_memory: cells.parse("buffs.muscleMemory")?,
            expedience: cells.parse("buffs.expedience")?,
        },
        combo_from: match cells.next("comboFrom")? {
            EMPTY => None,
            value => Some(value.parse::<CraftActionId>()?),
        },
        trained_perfection_available: cells.boolean("trainedPerfectionAvailable")?,
        trained_perfection_active: cells.boolean("trainedPerfectionActive")?,
        careful_observation_uses_left: cells.parse("carefulObservationUsesLeft")?,
        heart_and_soul_available: cells.boolean("heartAndSoulAvailable")?,
        heart_and_soul_active: cells.boolean("heartAndSoulActive")?,
        quick_innovation_available: cells.boolean("quickInnovationAvailable")?,
        terminal: cells.parse("terminal")?,
        failure_reason: match cells.next("failureReason")? {
            EMPTY => None,
            value => Some(value.parse::<CraftFailureReason>()?),
        },
    })
}

fn validate_recipe(recipe: &RecipeProfile) -> Result<(), String> {
    if recipe.canonical_recipe_id == 0 || recipe.recipe_level == 0 {
        return Err("recipe identity and level must be positive".to_owned());
    }
    if recipe.progress_required <= 0
        || recipe.quality_max < 0
        || !(0..=recipe.quality_max).contains(&recipe.required_quality)
        || recipe.durability_max <= 0
    {
        return Err("recipe bounds are invalid".to_owned());
    }
    for value in [
        recipe.progress_divider,
        recipe.quality_divider,
        recipe.progress_modifier,
        recipe.quality_modifier,
    ] {
        if !value.is_finite() || value <= 0.0 {
            return Err("recipe formula values must be finite and positive".to_owned());
        }
    }
    Ok(())
}

fn validate_crafter(crafter: &CrafterProfile) -> Result<(), String> {
    if crafter.level == 0
        || crafter.craftsmanship == 0
        || crafter.control == 0
        || crafter.max_cp <= 0
    {
        Err("crafter bounds are invalid".to_owned())
    } else {
        Ok(())
    }
}

fn validate_state(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
) -> Result<(), String> {
    if state.step == 0
        || !(0..=recipe.progress_required).contains(&state.progress)
        || !(0..=recipe.quality_max).contains(&state.quality)
        || state.durability > recipe.durability_max
        || state.cp < 0
        || state.cp > crafter.max_cp
        || !(0..=10).contains(&state.inner_quiet)
    {
        return Err("initial state bounds are invalid".to_owned());
    }
    if !(0..=3).contains(&state.careful_observation_uses_left) {
        return Err("Careful Observation uses are out of range".to_owned());
    }
    if [
        state.buffs.waste_not,
        state.buffs.veneration,
        state.buffs.great_strides,
        state.buffs.innovation,
        state.buffs.final_appraisal,
        state.buffs.manipulation,
        state.buffs.muscle_memory,
        state.buffs.expedience,
    ]
    .into_iter()
    .any(|duration| duration < 0)
    {
        return Err("buff duration is out of range".to_owned());
    }
    if state.terminal == CraftTerminal::Completed
        && (state.progress < recipe.progress_required || state.quality < recipe.required_quality)
    {
        return Err("completed state has insufficient progress or quality".to_owned());
    }
    if state.terminal == CraftTerminal::Failed && state.failure_reason.is_none() {
        return Err("failed state needs a reason".to_owned());
    }
    if state.failure_reason == Some(CraftFailureReason::Durability)
        && (state.durability > 0 || state.progress >= recipe.progress_required)
    {
        return Err("durability failure is inconsistent".to_owned());
    }
    if state.failure_reason == Some(CraftFailureReason::RequiredQuality)
        && (state.progress < recipe.progress_required || state.quality >= recipe.required_quality)
    {
        return Err("required-quality failure is inconsistent".to_owned());
    }
    if state.terminal == CraftTerminal::None
        && (state.progress >= recipe.progress_required || state.durability <= 0)
    {
        return Err("non-terminal state is inconsistent".to_owned());
    }
    if state.terminal != CraftTerminal::Failed && state.failure_reason.is_some() {
        return Err("non-failed state has a failure reason".to_owned());
    }
    Ok(())
}

fn parse_identity_from_header(cells: &mut Cells<'_>) -> Result<AdaptivePolicyIdentity, String> {
    cells.expect(ADAPTIVE_POLICY_PROGRAM_VERSION, "programVersion")?;
    let program_id = cells.next("programId")?.to_owned();
    versioned_identifier(&program_id, "programId")?;
    let program_content_hash = cells.next("programContentHash")?.to_owned();
    content_hash(&program_content_hash, "programContentHash")?;
    let scenario_id = cells.next("scenarioId")?.to_owned();
    versioned_identifier(&scenario_id, "scenarioId")?;
    let recipe_profile_id = cells.next("recipeProfileId")?.to_owned();
    versioned_identifier(&recipe_profile_id, "recipeProfileId")?;
    let scenario_model_identity_version = cells.next("scenarioModelIdentityVersion")?.to_owned();
    if scenario_model_identity_version != ADAPTIVE_POLICY_SCENARIO_IDENTITY_VERSION {
        return Err(format!(
            "unsupported scenarioModelIdentityVersion {scenario_model_identity_version}"
        ));
    }
    let scenario_model_content_hash = cells.next("scenarioModelContentHash")?.to_owned();
    content_hash(&scenario_model_content_hash, "scenarioModelContentHash")?;
    let objective_id = cells.next("objectiveId")?.to_owned();
    versioned_identifier(&objective_id, "objectiveId")?;
    let objective_mode = cells.next("objectiveMode")?.to_owned();
    if objective_mode != "required-quality"
        && objective_mode != "maximize-quality-with-safe-completion"
    {
        return Err(format!("unsupported objectiveMode {objective_mode}"));
    }
    let quality_maximum = cells.parse("qualityMaximum")?;
    if quality_maximum <= 0 {
        return Err("qualityMaximum must be positive".to_owned());
    }
    let feature_schema_version = cells.next("featureSchemaVersion")?.to_owned();
    if feature_schema_version != ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION {
        return Err(format!(
            "unsupported featureSchemaVersion {feature_schema_version}"
        ));
    }
    let safety_version = cells.next("safetyVersion")?.to_owned();
    if safety_version != ADAPTIVE_POLICY_SAFETY_VERSION {
        return Err(format!("unsupported safetyVersion {safety_version}"));
    }
    Ok(AdaptivePolicyIdentity {
        program_id,
        program_content_hash,
        scenario_id,
        recipe_profile_id,
        scenario_model_identity_version,
        scenario_model_content_hash,
        objective_id,
        objective_mode,
        quality_maximum,
        feature_schema_version,
        safety_version,
    })
}

fn parse_case_identity(
    cells: &mut Cells<'_>,
    program: &AdaptivePolicyIdentity,
) -> Result<AdaptivePolicyIdentity, String> {
    let program_content_hash = cells.next("programContentHash")?.to_owned();
    let scenario_id = cells.next("scenarioId")?.to_owned();
    let scenario_model_identity_version = cells.next("scenarioModelIdentityVersion")?.to_owned();
    let scenario_model_content_hash = cells.next("scenarioModelContentHash")?.to_owned();
    let feature_schema_version = cells.next("featureSchemaVersion")?.to_owned();
    let safety_version = cells.next("safetyVersion")?.to_owned();
    let recipe_profile_id = cells.next("recipeProfileId")?.to_owned();
    let objective_id = cells.next("objectiveId")?.to_owned();
    let objective_mode = cells.next("objectiveMode")?.to_owned();
    let quality_maximum = cells.parse("qualityMaximum")?;
    let candidate = AdaptivePolicyIdentity {
        program_id: program.program_id.clone(),
        program_content_hash,
        scenario_id,
        recipe_profile_id,
        scenario_model_identity_version,
        scenario_model_content_hash,
        objective_id,
        objective_mode,
        quality_maximum,
        feature_schema_version,
        safety_version,
    };
    if &candidate != program {
        return Err("case identity does not exactly match the prepared program".to_owned());
    }
    Ok(candidate)
}

fn parse_route_effect(
    cells: &mut Cells<'_>,
    kind_name: &str,
    target_name: &str,
) -> Result<RouteEffect, String> {
    let kind = cells.next(kind_name)?;
    let target_or_reason = cells.next(target_name)?;
    let set_resume = match cells.next("setResume")? {
        EMPTY => None,
        "active-node" => Some(ResumeMutation::ActiveNode),
        "clear" => Some(ResumeMutation::Clear),
        value => return Err(format!("unsupported setResume {value}")),
    };
    let set_flag_name = cells.optional("setFlag")?;
    if let Some(flag) = set_flag_name.as_deref() {
        versioned_identifier(flag, "setFlag")?;
    }
    let set_flag_value = match cells.next("setFlagValue")? {
        EMPTY if set_flag_name.is_none() => None,
        "0" if set_flag_name.is_some() => Some(false),
        "1" if set_flag_name.is_some() => Some(true),
        value => return Err(format!("setFlag/setFlagValue mismatch at {value}")),
    };
    match kind {
        "goto" => {
            if target_or_reason == "$resume" {
                if set_resume == Some(ResumeMutation::ActiveNode) {
                    return Err("goto $resume cannot replace resume with active-node".to_owned());
                }
            } else {
                versioned_identifier(target_or_reason, target_name)?;
            }
            Ok(RouteEffect::Goto {
                target: if target_or_reason == "$resume" {
                    RouteTarget::Resume
                } else {
                    RouteTarget::Node(target_or_reason.to_owned())
                },
                set_resume,
                set_flag: set_flag_name
                    .zip(set_flag_value)
                    .map(|(flag, value)| FlagMutation { flag, value }),
            })
        }
        "terminate" => {
            versioned_identifier(target_or_reason, target_name)?;
            if set_resume.is_some() || set_flag_name.is_some() {
                return Err("terminate effect cannot mutate resume or flags".to_owned());
            }
            Ok(RouteEffect::Terminate(target_or_reason.to_owned()))
        }
        value => Err(format!("unsupported route effect kind {value}")),
    }
}

fn parse_guard(cells: &mut Cells<'_>) -> Result<Guard, String> {
    let kind = cells.next("guardKind")?;
    let feature = cells.next("guardFeature")?.to_owned();
    safe_cell(&feature, "guardFeature")?;
    let operator = cells.next("guardOperator")?.to_owned();
    let encoded_value = cells.next("guardValue")?;
    let value = match kind {
        "integer" => {
            if !["eq", "lt", "lte", "gte", "gt"].contains(&operator.as_str()) {
                return Err(format!("unsupported integer operator {operator}"));
            }
            GuardValue::Integer(
                encoded_value
                    .parse::<i64>()
                    .map_err(|error| format!("invalid integer guard value: {error}"))?,
            )
        }
        "boolean" => {
            if operator != "eq" {
                return Err("boolean guard operator must be eq".to_owned());
            }
            GuardValue::Boolean(match encoded_value {
                "0" => false,
                "1" => true,
                value => return Err(format!("boolean guard value must be 0 or 1, got {value}")),
            })
        }
        "enum" => {
            if operator != "eq" {
                return Err("enum guard operator must be eq".to_owned());
            }
            safe_cell(encoded_value, "enumGuardValue")?;
            GuardValue::Enumeration(encoded_value.to_owned())
        }
        value => return Err(format!("unsupported guard kind {value}")),
    };
    Ok(Guard {
        feature,
        operator,
        value,
    })
}

fn parse_program_header(
    line: &str,
) -> Result<(AdaptivePolicyIdentity, String, u32, u32, usize, usize), String> {
    let mut cells = Cells::new(line);
    cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
    cells.expect("__program__", "recordId")?;
    cells.expect("program", "recordKind")?;
    let identity = parse_identity_from_header(&mut cells)?;
    let entry_node = cells.next("entryNode")?.to_owned();
    versioned_identifier(&entry_node, "entryNode")?;
    let max_actions = cells.parse::<u32>("maxActions")?;
    let max_settle_hops = cells.parse::<u32>("maxSettleHops")?;
    let node_count = cells.parse::<usize>("nodeCount")?;
    let case_count = cells.parse::<usize>("caseCount")?;
    cells.finish()?;
    if max_actions == 0 || max_actions > 1_000 {
        return Err("maxActions must be in 1..=1000".to_owned());
    }
    if max_settle_hops == 0 || max_settle_hops > 128 {
        return Err("maxSettleHops must be in 1..=128".to_owned());
    }
    if node_count == 0 || node_count > ADAPTIVE_POLICY_MAX_NODES {
        return Err(format!(
            "nodeCount must be in 1..={ADAPTIVE_POLICY_MAX_NODES}"
        ));
    }
    if case_count == 0 || case_count > ADAPTIVE_POLICY_MAX_CASES {
        return Err(format!(
            "caseCount must be in 1..={ADAPTIVE_POLICY_MAX_CASES}"
        ));
    }
    Ok((
        identity,
        entry_node,
        max_actions,
        max_settle_hops,
        node_count,
        case_count,
    ))
}

fn line_at<'a>(lines: &'a [&'a str], index: usize, description: &str) -> Result<&'a str, String> {
    lines
        .get(index)
        .copied()
        .ok_or_else(|| format!("missing {description} at input row {}", index + 1))
}

fn parse_node(
    lines: &[&str],
    cursor: &mut usize,
    expected_ordinal: usize,
) -> Result<AdaptiveNode, String> {
    let line = line_at(lines, *cursor, "node row")?;
    *cursor += 1;
    let mut cells = Cells::new(line);
    cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
    let node_id = cells.next("nodeId")?.to_owned();
    versioned_identifier(&node_id, "nodeId")?;
    cells.expect("node", "recordKind")?;
    let ordinal = cells.parse::<u32>("nodeOrdinal")?;
    if ordinal as usize != expected_ordinal {
        return Err(format!(
            "node ordinal {ordinal} is not contiguous at {expected_ordinal}"
        ));
    }
    let action_budget = cells.parse::<u32>("actionBudget")?;
    let on_budget_exhausted = parse_route_effect(&mut cells, "fallbackKind", "fallbackTarget")?;
    let transition_count = cells.parse::<usize>("transitionCount")?;
    let decision_count = cells.parse::<usize>("decisionCount")?;
    cells.finish()?;
    if transition_count > 256 || decision_count > 256 {
        return Err("each node supports at most 256 transitions and decisions".to_owned());
    }

    let mut transitions = Vec::with_capacity(transition_count);
    for transition_index in 0..transition_count {
        let line = line_at(lines, *cursor, "transition row")?;
        *cursor += 1;
        let mut cells = Cells::new(line);
        cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
        cells.expect(&node_id, "nodeId")?;
        cells.expect("transition", "recordKind")?;
        let encoded_index = cells.parse::<usize>("transitionIndex")?;
        if encoded_index != transition_index {
            return Err(format!("{node_id} transition indexes are not contiguous"));
        }
        let transition_id = cells.next("transitionId")?.to_owned();
        versioned_identifier(&transition_id, "transitionId")?;
        let effect = parse_route_effect(&mut cells, "effectKind", "effectTarget")?;
        let guard_count = cells.parse::<usize>("guardCount")?;
        cells.finish()?;
        if guard_count > 256 {
            return Err("a transition supports at most 256 guards".to_owned());
        }
        let mut guards = Vec::with_capacity(guard_count);
        for guard_index in 0..guard_count {
            let line = line_at(lines, *cursor, "transition guard row")?;
            *cursor += 1;
            let mut cells = Cells::new(line);
            cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
            cells.expect(&node_id, "nodeId")?;
            cells.expect("transition-guard", "recordKind")?;
            if cells.parse::<usize>("transitionIndex")? != transition_index
                || cells.parse::<usize>("guardIndex")? != guard_index
            {
                return Err(format!(
                    "{node_id} transition guard indexes are not contiguous"
                ));
            }
            guards.push(parse_guard(&mut cells)?);
            cells.finish()?;
        }
        transitions.push(AdaptiveTransition {
            id: transition_id,
            guards,
            effect,
        });
    }

    let mut decisions = Vec::with_capacity(decision_count);
    for decision_index in 0..decision_count {
        let line = line_at(lines, *cursor, "decision row")?;
        *cursor += 1;
        let mut cells = Cells::new(line);
        cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
        cells.expect(&node_id, "nodeId")?;
        cells.expect("decision", "recordKind")?;
        if cells.parse::<usize>("decisionIndex")? != decision_index {
            return Err(format!("{node_id} decision indexes are not contiguous"));
        }
        let decision_id = cells.next("decisionId")?.to_owned();
        versioned_identifier(&decision_id, "decisionId")?;
        let allow_below_objective_completion = cells.boolean("allowBelowObjectiveCompletion")?;
        let action_count = cells.parse::<usize>("actionCount")?;
        let guard_count = cells.parse::<usize>("guardCount")?;
        cells.finish()?;
        if action_count == 0 || action_count > ACTION_COUNT || guard_count > 256 {
            return Err("decision action/guard counts are outside their bounds".to_owned());
        }
        let mut guards = Vec::with_capacity(guard_count);
        for guard_index in 0..guard_count {
            let line = line_at(lines, *cursor, "decision guard row")?;
            *cursor += 1;
            let mut cells = Cells::new(line);
            cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
            cells.expect(&node_id, "nodeId")?;
            cells.expect("decision-guard", "recordKind")?;
            if cells.parse::<usize>("decisionIndex")? != decision_index
                || cells.parse::<usize>("guardIndex")? != guard_index
            {
                return Err(format!(
                    "{node_id} decision guard indexes are not contiguous"
                ));
            }
            guards.push(parse_guard(&mut cells)?);
            cells.finish()?;
        }
        let mut actions = Vec::with_capacity(action_count);
        for action_index in 0..action_count {
            let line = line_at(lines, *cursor, "decision action row")?;
            *cursor += 1;
            let mut cells = Cells::new(line);
            cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
            cells.expect(&node_id, "nodeId")?;
            cells.expect("decision-action", "recordKind")?;
            if cells.parse::<usize>("decisionIndex")? != decision_index
                || cells.parse::<usize>("actionIndex")? != action_index
            {
                return Err(format!(
                    "{node_id} decision action indexes are not contiguous"
                ));
            }
            actions.push(cells.parse::<CraftActionId>("action")?);
            cells.finish()?;
        }
        decisions.push(AdaptiveDecision {
            id: decision_id,
            guards,
            actions,
            allow_below_objective_completion,
        });
    }

    Ok(AdaptiveNode {
        ordinal,
        id: node_id,
        action_budget,
        transitions,
        decisions,
        on_budget_exhausted,
    })
}

fn target_node(effect: &RouteEffect) -> Option<&str> {
    match effect {
        RouteEffect::Goto {
            target: RouteTarget::Node(node),
            ..
        } => Some(node),
        RouteEffect::Goto {
            target: RouteTarget::Resume,
            ..
        }
        | RouteEffect::Terminate(_) => None,
    }
}

fn collect_effect_flag(effect: &RouteEffect, flags: &mut BTreeSet<String>) {
    if let RouteEffect::Goto {
        set_flag: Some(mutation),
        ..
    } = effect
    {
        flags.insert(mutation.flag.clone());
    }
}

fn collect_guard_flag(guard: &Guard, flags: &mut BTreeSet<String>) {
    if let Some(flag) = guard.feature.strip_prefix("memory.flags.") {
        flags.insert(flag.to_owned());
    }
}

fn validate_program(program: &mut AdaptivePolicyProgram) -> Result<(), String> {
    let mut node_ids = HashSet::new();
    let mut flags = BTreeSet::new();
    for (index, node) in program.nodes.iter().enumerate() {
        if node.ordinal as usize != index || !node_ids.insert(node.id.clone()) {
            return Err("node ordinals/ids must be unique and contiguous".to_owned());
        }
    }
    for node in &program.nodes {
        if node.action_budget > program.max_actions {
            return Err(format!("{} actionBudget exceeds maxActions", node.id));
        }
        collect_effect_flag(&node.on_budget_exhausted, &mut flags);
        let mut local_ids = HashSet::new();
        for transition in &node.transitions {
            if !local_ids.insert(transition.id.clone()) {
                return Err(format!(
                    "{} has duplicate transition {}",
                    node.id, transition.id
                ));
            }
            if matches!(transition.effect, RouteEffect::Terminate(_)) {
                return Err(format!(
                    "{} transition {} must route with goto",
                    node.id, transition.id
                ));
            }
            collect_effect_flag(&transition.effect, &mut flags);
            for guard in &transition.guards {
                collect_guard_flag(guard, &mut flags);
                validate_guard_feature(guard, &node_ids)?;
            }
        }
        for decision in &node.decisions {
            if !local_ids.insert(decision.id.clone()) {
                return Err(format!(
                    "{} has duplicate decision {}",
                    node.id, decision.id
                ));
            }
            let mut seen_actions = HashSet::new();
            if !decision
                .actions
                .iter()
                .all(|action| seen_actions.insert(*action))
            {
                return Err(format!(
                    "{} decision {} contains duplicate actions",
                    node.id, decision.id
                ));
            }
            for guard in &decision.guards {
                collect_guard_flag(guard, &mut flags);
                validate_guard_feature(guard, &node_ids)?;
            }
        }
    }
    if !node_ids.contains(&program.entry_node) {
        return Err("entryNode does not exist".to_owned());
    }
    for node in &program.nodes {
        for effect in std::iter::once(&node.on_budget_exhausted)
            .chain(node.transitions.iter().map(|transition| &transition.effect))
        {
            if let Some(target) = target_node(effect)
                && !node_ids.contains(target)
            {
                return Err(format!("{} routes to unknown node {target}", node.id));
            }
        }
    }
    program.node_indexes = program
        .nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node.id.clone(), index))
        .collect();
    program.flag_ids = flags.into_iter().collect();
    Ok(())
}

fn validate_guard_feature(guard: &Guard, node_ids: &HashSet<String>) -> Result<(), String> {
    let supported = match &guard.value {
        GuardValue::Integer(value) => {
            is_integer_feature(&guard.feature)
                && (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(value)
        }
        GuardValue::Boolean(_) => {
            if let Some(flag) = guard.feature.strip_prefix("memory.flags.") {
                versioned_identifier(flag, "memory flag")?;
            }
            is_boolean_feature(&guard.feature)
        }
        GuardValue::Enumeration(value) => {
            is_enum_feature(&guard.feature)
                && valid_enum_guard_value(&guard.feature, value, node_ids)
        }
    };
    if supported {
        Ok(())
    } else {
        Err(format!(
            "unsupported adaptive-policy feature {}",
            guard.feature
        ))
    }
}

fn valid_enum_guard_value(feature: &str, value: &str, node_ids: &HashSet<String>) -> bool {
    match feature {
        "state.condition" => value.parse::<MaterialCondition>().is_ok(),
        "state.terminal" => value.parse::<CraftTerminal>().is_ok(),
        "state.failureReason" => value == "none" || value.parse::<CraftFailureReason>().is_ok(),
        "state.comboFrom" | "memory.lastAction" => {
            value == "none" || value.parse::<CraftActionId>().is_ok()
        }
        "objective.mode" => {
            value == "required-quality" || value == "maximize-quality-with-safe-completion"
        }
        "memory.activeNodeId" | "memory.resumeNodeId" => {
            value == "none" || node_ids.contains(value)
        }
        "memory.lastActionOutcome" => matches!(value, "none" | "success" | "failure"),
        _ => false,
    }
}

fn is_action_name(value: &str) -> bool {
    value.parse::<CraftActionId>().is_ok()
}

fn preview_feature(value: &str, allowed_fields: &[&str]) -> bool {
    let parts: Vec<_> = value.split('.').collect();
    parts.len() == 3
        && parts[0] == "preview"
        && is_action_name(parts[1])
        && allowed_fields.contains(&parts[2])
}

fn is_integer_feature(value: &str) -> bool {
    const FIXED: &[&str] = &[
        "state.step",
        "state.progress",
        "state.progressRemaining",
        "state.progressBps",
        "state.quality",
        "state.qualityRemaining",
        "state.qualityBps",
        "state.durability",
        "state.durabilityBps",
        "state.cp",
        "state.cpBps",
        "state.innerQuiet",
        "state.carefulObservationUsesLeft",
        "state.buffs.wasteNot",
        "state.buffs.veneration",
        "state.buffs.greatStrides",
        "state.buffs.innovation",
        "state.buffs.finalAppraisal",
        "state.buffs.manipulation",
        "state.buffs.muscleMemory",
        "state.buffs.expedience",
        "recipe.progressRequired",
        "recipe.qualityMax",
        "recipe.requiredQuality",
        "recipe.durabilityMax",
        "objective.qualityMaximum",
        "crafter.level",
        "crafter.craftsmanship",
        "crafter.control",
        "crafter.maxCp",
        "memory.totalActionUses",
        "memory.totalNoStepUses",
        "memory.nodeActionUses",
        "memory.nodeNoStepUses",
        "memory.totalObservedTransitions",
    ];
    FIXED.contains(&value)
        || value
            .strip_prefix("memory.actionUses.")
            .is_some_and(is_action_name)
        || preview_feature(
            value,
            &[
                "progressGain",
                "qualityGain",
                "cpCost",
                "durabilityCost",
                "successRateBps",
                "progressAfter",
                "qualityAfter",
                "progressRemainingAfter",
                "qualityRemainingAfter",
            ],
        )
}

fn is_boolean_feature(value: &str) -> bool {
    const FIXED: &[&str] = &[
        "state.trainedPerfectionAvailable",
        "state.trainedPerfectionActive",
        "state.heartAndSoulAvailable",
        "state.heartAndSoulActive",
        "state.quickInnovationAvailable",
        "crafter.cosmicToolGoodBonus",
        "crafter.specialist",
        "memory.terminated",
    ];
    FIXED.contains(&value)
        || value
            .strip_prefix("memory.flags.")
            .is_some_and(|flag| !flag.is_empty())
        || preview_feature(
            value,
            &[
                "legal",
                "policySafe",
                "wouldCompleteProgress",
                "wouldReachRequiredQuality",
                "wouldReachQualityMaximum",
                "wouldCompleteBelowQualityMaximum",
            ],
        )
}

fn is_enum_feature(value: &str) -> bool {
    [
        "state.condition",
        "state.terminal",
        "state.failureReason",
        "state.comboFrom",
        "objective.mode",
        "memory.activeNodeId",
        "memory.resumeNodeId",
        "memory.lastAction",
        "memory.lastActionOutcome",
    ]
    .contains(&value)
}

fn parse_case(
    line: &str,
    program_identity: &AdaptivePolicyIdentity,
) -> Result<AdaptivePolicyCase, String> {
    let mut cells = Cells::new(line);
    cells.expect(ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, "protocolVersion")?;
    let case_id = cells.next("caseId")?.to_owned();
    safe_cell(&case_id, "caseId")?;
    cells.expect("case", "recordKind")?;
    let identity = parse_case_identity(&mut cells, program_identity)?;
    let crafter_case_id = cells.next("crafterCaseId")?.to_owned();
    safe_cell(&crafter_case_id, "crafterCaseId")?;
    let world_id = cells.next("worldId")?.to_owned();
    safe_cell(&world_id, "worldId")?;
    let recipe = parse_recipe(&mut cells)?;
    let crafter = parse_crafter(&mut cells)?;
    let initial_state = parse_state(&mut cells)?;
    if initial_state.condition == MaterialCondition::Robust {
        return Err(
            "native-adaptive-policy-matrix-v1 does not encode Robust condition state".to_owned(),
        );
    }
    let seed = cells.parse::<u32>("seed")?;
    let condition_draws = cells.parse::<u64>("conditionDrawOffset")?;
    let success_draws = cells.parse::<u64>("successDrawOffset")?;
    if condition_draws > u64::from(u32::MAX) || success_draws > u64::from(u32::MAX) {
        return Err("initial RNG cursors must be uint32".to_owned());
    }
    let max_steps = cells.parse::<u32>("maxSteps")?;
    let mut condition_transition_weights =
        [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for previous in ADAPTIVE_POLICY_V1_WIRE_CONDITIONS {
        for next in ADAPTIVE_POLICY_V1_WIRE_CONDITIONS {
            let weight = parse_finite(
                &mut cells,
                &format!("conditionWeight.{}.{}", previous.as_str(), next.as_str()),
            )?;
            if weight < 0.0 {
                return Err("condition weights must be non-negative".to_owned());
            }
            condition_transition_weights[previous.index()][next.index()] = weight;
        }
    }
    cells.finish()?;
    validate_recipe(&recipe)?;
    validate_crafter(&crafter)?;
    validate_state(&recipe, &crafter, &initial_state)?;
    if identity.quality_maximum != recipe.quality_max {
        return Err("objective qualityMaximum must equal recipe.qualityMax".to_owned());
    }
    if identity.objective_mode == "required-quality" && recipe.required_quality <= 0 {
        return Err(
            "required-quality objective requires positive recipe.requiredQuality".to_owned(),
        );
    }
    if max_steps == 0 || max_steps > ADAPTIVE_POLICY_MAX_STEPS_PER_CASE {
        return Err(format!(
            "maxSteps must be in 1..={ADAPTIVE_POLICY_MAX_STEPS_PER_CASE}"
        ));
    }
    Ok(AdaptivePolicyCase {
        case_id,
        crafter_case_id,
        world_id,
        identity,
        recipe,
        crafter,
        initial_state,
        seed,
        initial_cursor: RandomDrawCursor {
            condition_draws,
            success_draws,
        },
        max_steps,
        condition_transition_weights,
    })
}

fn checked_add(left: u64, right: u64, label: &str) -> Result<u64, String> {
    left.checked_add(right)
        .ok_or_else(|| format!("adaptive-policy {label} overflow"))
}

fn checked_mul(left: u64, right: u64, label: &str) -> Result<u64, String> {
    left.checked_mul(right)
        .ok_or_else(|| format!("adaptive-policy {label} overflow"))
}

fn projected_evaluation_units(
    program: &AdaptivePolicyProgram,
    projected_transitions: u64,
) -> Result<u64, String> {
    let mut maximum_transition_units = 1_u64;
    let mut maximum_decision_units = 1_u64;
    for node in &program.nodes {
        let transition_units = node
            .transitions
            .iter()
            .try_fold(0_u64, |total, transition| {
                checked_add(
                    total,
                    1 + transition.guards.len() as u64,
                    "transition evaluation units",
                )
            })?;
        maximum_transition_units = maximum_transition_units.max(transition_units);

        let decision_units = node.decisions.iter().try_fold(0_u64, |total, decision| {
            let action_units = checked_mul(
                decision.actions.len() as u64,
                3,
                "decision action evaluation units",
            )?;
            let member_units = checked_add(
                1 + decision.guards.len() as u64,
                action_units,
                "decision evaluation units",
            )?;
            checked_add(total, member_units, "decision evaluation units")
        })?;
        maximum_decision_units = maximum_decision_units.max(decision_units);
    }
    let settle_units = checked_mul(
        u64::from(program.max_settle_hops) + 1,
        maximum_transition_units,
        "settle evaluation units",
    )?;
    let per_step = checked_add(
        checked_mul(2, settle_units, "per-step settle evaluation units")?,
        maximum_decision_units,
        "per-step evaluation units",
    )?;
    checked_mul(
        projected_transitions,
        per_step,
        "projected evaluation units",
    )
}

fn projected_output_bytes(
    program: &AdaptivePolicyProgram,
    cases: &[AdaptivePolicyCase],
) -> Result<u64, String> {
    let identity_bytes = [
        program.identity.program_content_hash.len(),
        program.identity.scenario_id.len(),
        program.identity.scenario_model_identity_version.len(),
        program.identity.scenario_model_content_hash.len(),
        program.identity.feature_schema_version.len(),
        program.identity.safety_version.len(),
    ]
    .into_iter()
    .try_fold(0_u64, |total, length| {
        checked_add(total, length as u64, "identity output bytes")
    })?;
    let flag_cells_bytes = checked_mul(
        program.flag_ids.len() as u64,
        ADAPTIVE_POLICY_PROJECTED_BYTES_PER_FLAG_CELL,
        "flag output bytes",
    )?;
    let mut total = ADAPTIVE_POLICY_OUTPUT_SUMMARY_BYTES;
    for case in cases {
        let case_id_bytes = case.case_id.len() as u64;
        let step_identity_bytes =
            checked_add(case_id_bytes, identity_bytes, "step identity output bytes")?;
        let step_bytes = checked_add(
            checked_add(
                ADAPTIVE_POLICY_OUTPUT_BASE_BYTES_PER_STEP,
                step_identity_bytes,
                "step output bytes",
            )?,
            checked_mul(2, flag_cells_bytes, "step flag output bytes")?,
            "step output bytes",
        )?;
        let outcome_bytes = [
            ADAPTIVE_POLICY_OUTPUT_BASE_BYTES_PER_OUTCOME,
            case_id_bytes,
            identity_bytes,
            case.crafter_case_id.len() as u64,
            case.world_id.len() as u64,
            flag_cells_bytes,
        ]
        .into_iter()
        .try_fold(0_u64, |subtotal, value| {
            checked_add(subtotal, value, "outcome output bytes")
        })?;
        let case_bytes = checked_add(
            checked_mul(
                u64::from(case.max_steps),
                step_bytes,
                "case step output bytes",
            )?,
            outcome_bytes,
            "case output bytes",
        )?;
        total = checked_add(total, case_bytes, "batch output bytes")?;
    }
    Ok(total)
}

pub fn parse_adaptive_policy_matrix_request(
    input: &str,
) -> Result<AdaptivePolicyMatrixRequest, AdaptivePolicyParseError> {
    if input.len() as u64 > ADAPTIVE_POLICY_MAX_OUTPUT_BYTES {
        return Err(AdaptivePolicyParseError {
            case_id: "__batch__".to_owned(),
            message: "adaptive-policy input exceeds 64 MiB".to_owned(),
        });
    }
    for (row_index, line) in input.lines().enumerate() {
        for (column_index, cell) in line.trim_end_matches(['\r', '\n']).split('\t').enumerate() {
            if cell.len() > ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES {
                return Err(AdaptivePolicyParseError {
                    case_id: "__batch__".to_owned(),
                    message: format!(
                        "adaptive-policy input row {} column {} exceeds the protocol cell cap of {} bytes",
                        row_index + 1,
                        column_index + 1,
                        ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES,
                    ),
                });
            }
        }
    }
    let lines: Vec<_> = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let parse = || -> Result<AdaptivePolicyMatrixRequest, String> {
        let header = line_at(&lines, 0, "program header")?;
        let (identity, entry_node, max_actions, max_settle_hops, node_count, case_count) =
            parse_program_header(header)?;
        let mut cursor = 1;
        let mut nodes = Vec::with_capacity(node_count);
        for ordinal in 0..node_count {
            nodes.push(parse_node(&lines, &mut cursor, ordinal)?);
        }
        let mut program = AdaptivePolicyProgram {
            identity: identity.clone(),
            entry_node,
            max_actions,
            max_settle_hops,
            nodes,
            node_indexes: HashMap::new(),
            flag_ids: Vec::new(),
        };
        validate_program(&mut program)?;

        let mut cases = Vec::with_capacity(case_count);
        let mut case_ids = HashSet::new();
        let mut projected_transitions = 0_u64;
        for _ in 0..case_count {
            let line = line_at(&lines, cursor, "case row")?;
            cursor += 1;
            let case = parse_case(line, &identity)?;
            if !case_ids.insert(case.case_id.clone()) {
                return Err(format!("duplicate caseId {}", case.case_id));
            }
            projected_transitions = projected_transitions
                .checked_add(u64::from(case.max_steps))
                .ok_or("projected transition count overflow")?;
            cases.push(case);
        }
        if cursor != lines.len() {
            return Err(format!("unexpected extra input row {}", cursor + 1));
        }
        if projected_transitions > ADAPTIVE_POLICY_MAX_PROJECTED_TRANSITIONS {
            return Err(format!(
                "projected transitions {projected_transitions} exceed {ADAPTIVE_POLICY_MAX_PROJECTED_TRANSITIONS}"
            ));
        }
        let evaluation_units = projected_evaluation_units(&program, projected_transitions)?;
        if evaluation_units > ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS {
            return Err(format!(
                "projected evaluation units {evaluation_units} exceed {ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS}"
            ));
        }
        let output_bytes = projected_output_bytes(&program, &cases)?;
        if output_bytes > ADAPTIVE_POLICY_MAX_OUTPUT_BYTES {
            return Err(format!(
                "projected output bytes {output_bytes} exceed {ADAPTIVE_POLICY_MAX_OUTPUT_BYTES}"
            ));
        }
        Ok(AdaptivePolicyMatrixRequest { program, cases })
    };
    parse().map_err(|message| AdaptivePolicyParseError {
        case_id: "__batch__".to_owned(),
        message,
    })
}

fn action_index(action: CraftActionId) -> usize {
    CraftActionId::ALL
        .iter()
        .position(|candidate| *candidate == action)
        .expect("CraftActionId::ALL must contain every action")
}

fn basis_points(numerator: i64, denominator: i64) -> Result<i64, String> {
    if denominator == 0 {
        return Err("basis-point feature denominator must not be zero".to_owned());
    }
    Ok(((numerator as f64 * 10_000.0) / denominator as f64).floor() as i64)
}

fn projected_successful_state(
    case: &AdaptivePolicyCase,
    state: &CraftState,
    action: CraftActionId,
    preview: &ActionPreview,
) -> Option<CraftState> {
    if !preview.legal {
        return None;
    }
    Some(
        apply_observed_outcome(
            &case.recipe,
            &case.crafter,
            state,
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: state.condition,
            },
        )
        .ok()?
        .next_state,
    )
}

fn can_spend_observe_on_condition_fishing(
    case: &AdaptivePolicyCase,
    state: &CraftState,
    observe: &ActionPreview,
) -> bool {
    if !observe.legal
        || state.condition == MaterialCondition::Good
        || state.quality >= case.recipe.required_quality
        || state.inner_quiet < 10
        || f64::from(state.progress) / f64::from(case.recipe.progress_required) < 0.8
    {
        return false;
    }

    let mut careful_state = state.clone();
    careful_state.condition = MaterialCondition::Normal;
    let careful = preview_action(
        &case.recipe,
        &case.crafter,
        &careful_state,
        CraftActionId::CarefulSynthesis,
    );
    if !careful.legal || careful.progress_gain <= 0 {
        return false;
    }
    let remaining = case.recipe.progress_required - state.progress;
    let synthesis_steps = (remaining + careful.progress_gain - 1) / careful.progress_gain;
    let progress_durability = synthesis_steps * careful.durability_cost;
    let progress_cp = synthesis_steps * careful.cp_cost;
    if synthesis_steps < 1 || state.durability < progress_durability + 10 {
        return false;
    }
    let great_strides_cp = if state.buffs.great_strides > 2 { 0 } else { 32 };
    let innovation_cp = if state.buffs.innovation > 2 { 0 } else { 18 };
    let reserve_after_observe = progress_cp + great_strides_cp + innovation_cp + 24;
    if state.cp - observe.cp_cost < reserve_after_observe {
        return false;
    }

    let mut good_finisher_state = state.clone();
    good_finisher_state.condition = MaterialCondition::Good;
    good_finisher_state.buffs.great_strides = 2;
    good_finisher_state.buffs.innovation = 2;
    let blessing = preview_action(
        &case.recipe,
        &case.crafter,
        &good_finisher_state,
        CraftActionId::ByregotsBlessing,
    );
    blessing.legal
        && f64::from(state.quality + blessing.quality_gain)
            / f64::from(case.recipe.required_quality)
            >= 0.95
}

fn policy_action_safe(
    case: &AdaptivePolicyCase,
    state: &CraftState,
    action: CraftActionId,
    preview: &ActionPreview,
) -> bool {
    if !preview.legal {
        return false;
    }
    if action == CraftActionId::FinalAppraisal && state.buffs.final_appraisal > 0 {
        return false;
    }
    if action == CraftActionId::Observe
        && state.combo_from == Some(CraftActionId::Observe)
        && !can_spend_observe_on_condition_fishing(case, state, preview)
    {
        return false;
    }
    let completes_progress =
        state.progress + preview.progress_gain >= case.recipe.progress_required;
    let reaches_required_quality =
        state.quality + preview.quality_gain >= case.recipe.required_quality;
    if completes_progress && !reaches_required_quality {
        return false;
    }
    let guaranteed_valid_completion =
        preview.success_rate == 1.0 && completes_progress && reaches_required_quality;
    if preview.durability_cost >= state.durability && !guaranteed_valid_completion {
        return false;
    }
    true
}

fn parse_preview_reference<'a>(feature: &'a str) -> Option<(CraftActionId, &'a str)> {
    let mut parts = feature.split('.');
    if parts.next()? != "preview" {
        return None;
    }
    let action = parts.next()?.parse::<CraftActionId>().ok()?;
    let field = parts.next()?;
    if parts.next().is_some() {
        return None;
    }
    Some((action, field))
}

fn integer_feature_value(
    feature: &str,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<i64, String> {
    if let Some(action) = feature.strip_prefix("memory.actionUses.") {
        let action = action.parse::<CraftActionId>()?;
        return Ok(i64::from(memory.action_uses[action_index(action)]));
    }
    if let Some((action, field)) = parse_preview_reference(feature) {
        let preview = preview_action(&case.recipe, &case.crafter, state, action);
        let projected = projected_successful_state(case, state, action, &preview);
        return Ok(match field {
            "progressGain" => i64::from(preview.progress_gain),
            "qualityGain" => i64::from(preview.quality_gain),
            "cpCost" => i64::from(preview.cp_cost),
            "durabilityCost" => i64::from(preview.durability_cost),
            "successRateBps" => (preview.success_rate * 10_000.0).round() as i64,
            "progressAfter" => i64::from(
                projected
                    .as_ref()
                    .map_or(state.progress, |value| value.progress),
            ),
            "qualityAfter" => i64::from(
                projected
                    .as_ref()
                    .map_or(state.quality, |value| value.quality),
            ),
            "progressRemainingAfter" => i64::from(
                case.recipe.progress_required
                    - projected
                        .as_ref()
                        .map_or(state.progress, |value| value.progress),
            ),
            "qualityRemainingAfter" => i64::from(
                case.identity.quality_maximum
                    - projected
                        .as_ref()
                        .map_or(state.quality, |value| value.quality),
            ),
            _ => return Err(format!("unsupported preview integer field {field}")),
        });
    }
    Ok(match feature {
        "state.step" => i64::from(state.step),
        "state.progress" => i64::from(state.progress),
        "state.progressRemaining" => i64::from(case.recipe.progress_required - state.progress),
        "state.progressBps" => basis_points(
            i64::from(state.progress),
            i64::from(case.recipe.progress_required),
        )?,
        "state.quality" => i64::from(state.quality),
        "state.qualityRemaining" => i64::from(case.identity.quality_maximum - state.quality),
        "state.qualityBps" => basis_points(
            i64::from(state.quality),
            i64::from(case.identity.quality_maximum),
        )?,
        "state.durability" => i64::from(state.durability),
        "state.durabilityBps" => basis_points(
            i64::from(state.durability),
            i64::from(case.recipe.durability_max),
        )?,
        "state.cp" => i64::from(state.cp),
        "state.cpBps" => basis_points(i64::from(state.cp), i64::from(case.crafter.max_cp))?,
        "state.innerQuiet" => i64::from(state.inner_quiet),
        "state.carefulObservationUsesLeft" => i64::from(state.careful_observation_uses_left),
        "state.buffs.wasteNot" => i64::from(state.buffs.waste_not),
        "state.buffs.veneration" => i64::from(state.buffs.veneration),
        "state.buffs.greatStrides" => i64::from(state.buffs.great_strides),
        "state.buffs.innovation" => i64::from(state.buffs.innovation),
        "state.buffs.finalAppraisal" => i64::from(state.buffs.final_appraisal),
        "state.buffs.manipulation" => i64::from(state.buffs.manipulation),
        "state.buffs.muscleMemory" => i64::from(state.buffs.muscle_memory),
        "state.buffs.expedience" => i64::from(state.buffs.expedience),
        "recipe.progressRequired" => i64::from(case.recipe.progress_required),
        "recipe.qualityMax" => i64::from(case.recipe.quality_max),
        "recipe.requiredQuality" => i64::from(case.recipe.required_quality),
        "recipe.durabilityMax" => i64::from(case.recipe.durability_max),
        "objective.qualityMaximum" => i64::from(case.identity.quality_maximum),
        "crafter.level" => i64::from(case.crafter.level),
        "crafter.craftsmanship" => i64::from(case.crafter.craftsmanship),
        "crafter.control" => i64::from(case.crafter.control),
        "crafter.maxCp" => i64::from(case.crafter.max_cp),
        "memory.totalActionUses" => i64::from(memory.total_action_uses),
        "memory.totalNoStepUses" => i64::from(memory.total_no_step_uses),
        "memory.nodeActionUses" => i64::from(memory.node_action_uses),
        "memory.nodeNoStepUses" => i64::from(memory.node_no_step_uses),
        "memory.totalObservedTransitions" => i64::from(memory.total_observed_transitions),
        _ => return Err(format!("unsupported integer feature {feature}")),
    })
}

fn boolean_feature_value(
    feature: &str,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<bool, String> {
    if let Some(flag) = feature.strip_prefix("memory.flags.") {
        return Ok(memory.flags.get(flag).copied().unwrap_or(false));
    }
    if let Some((action, field)) = parse_preview_reference(feature) {
        let preview = preview_action(&case.recipe, &case.crafter, state, action);
        let projected = projected_successful_state(case, state, action, &preview);
        let completes_progress = projected.as_ref().is_some_and(|value| {
            value.progress == case.recipe.progress_required
                && value.terminal == CraftTerminal::Completed
        });
        let projected_quality = projected
            .as_ref()
            .map_or(state.quality, |value| value.quality);
        let reaches_required_quality = projected_quality >= case.recipe.required_quality;
        let reaches_quality_maximum = projected_quality >= case.identity.quality_maximum;
        return Ok(match field {
            "legal" => preview.legal,
            "policySafe" => policy_action_safe(case, state, action, &preview),
            "wouldCompleteProgress" => completes_progress,
            "wouldReachRequiredQuality" => reaches_required_quality,
            "wouldReachQualityMaximum" => reaches_quality_maximum,
            "wouldCompleteBelowQualityMaximum" => completes_progress && !reaches_quality_maximum,
            _ => return Err(format!("unsupported preview boolean field {field}")),
        });
    }
    Ok(match feature {
        "state.trainedPerfectionAvailable" => state.trained_perfection_available,
        "state.trainedPerfectionActive" => state.trained_perfection_active,
        "state.heartAndSoulAvailable" => state.heart_and_soul_available,
        "state.heartAndSoulActive" => state.heart_and_soul_active,
        "state.quickInnovationAvailable" => state.quick_innovation_available,
        "crafter.cosmicToolGoodBonus" => case.crafter.cosmic_tool_good_bonus,
        "crafter.specialist" => case.crafter.specialist,
        "memory.terminated" => memory.terminated,
        _ => return Err(format!("unsupported boolean feature {feature}")),
    })
}

fn enum_feature_value(
    feature: &str,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<String, String> {
    Ok(match feature {
        "state.condition" => state.condition.as_str().to_owned(),
        "state.terminal" => state.terminal.as_str().to_owned(),
        "state.failureReason" => state
            .failure_reason
            .map_or_else(|| "none".to_owned(), |value| value.as_str().to_owned()),
        "state.comboFrom" => state
            .combo_from
            .map_or_else(|| "none".to_owned(), |value| value.as_str().to_owned()),
        "objective.mode" => case.identity.objective_mode.clone(),
        "memory.activeNodeId" => memory.active_node_id.clone(),
        "memory.resumeNodeId" => memory
            .resume_node_id
            .clone()
            .unwrap_or_else(|| "none".to_owned()),
        "memory.lastAction" => memory
            .last_action
            .map_or_else(|| "none".to_owned(), |value| value.as_str().to_owned()),
        "memory.lastActionOutcome" => match memory.last_action_success {
            None => "none".to_owned(),
            Some(true) => "success".to_owned(),
            Some(false) => "failure".to_owned(),
        },
        _ => return Err(format!("unsupported enum feature {feature}")),
    })
}

fn guard_matches(
    guard: &Guard,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<bool, String> {
    match &guard.value {
        GuardValue::Boolean(expected) => {
            Ok(boolean_feature_value(&guard.feature, case, state, memory)? == *expected)
        }
        GuardValue::Enumeration(expected) => {
            Ok(enum_feature_value(&guard.feature, case, state, memory)? == *expected)
        }
        GuardValue::Integer(expected) => {
            let actual = integer_feature_value(&guard.feature, case, state, memory)?;
            Ok(match guard.operator.as_str() {
                "eq" => actual == *expected,
                "lt" => actual < *expected,
                "lte" => actual <= *expected,
                "gte" => actual >= *expected,
                "gt" => actual > *expected,
                _ => return Err(format!("unsupported integer operator {}", guard.operator)),
            })
        }
    }
}

fn all_guards_match(
    guards: &[Guard],
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<bool, String> {
    for guard in guards {
        if !guard_matches(guard, case, state, memory)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn initial_memory(program: &AdaptivePolicyProgram) -> AdaptivePolicyMemory {
    AdaptivePolicyMemory {
        active_node_id: program.entry_node.clone(),
        resume_node_id: None,
        total_action_uses: 0,
        total_no_step_uses: 0,
        node_action_uses: 0,
        node_no_step_uses: 0,
        total_observed_transitions: 0,
        action_uses: [0; ACTION_COUNT],
        flags: BTreeMap::new(),
        last_action: None,
        last_action_success: None,
        terminated: false,
        termination_reason: None,
    }
}

fn terminate_memory(
    memory: &AdaptivePolicyMemory,
    reason: impl Into<String>,
) -> AdaptivePolicyMemory {
    let mut terminated = memory.clone();
    terminated.terminated = true;
    terminated.termination_reason = Some(reason.into());
    terminated
}

fn apply_route_effect(
    program: &AdaptivePolicyProgram,
    effect: &RouteEffect,
    memory: &AdaptivePolicyMemory,
) -> AdaptivePolicyMemory {
    let RouteEffect::Goto {
        target,
        set_resume,
        set_flag,
    } = effect
    else {
        if let RouteEffect::Terminate(reason) = effect {
            return terminate_memory(memory, format!("program:{reason}"));
        }
        unreachable!();
    };
    let target_node = match target {
        RouteTarget::Node(node) => Some(node.clone()),
        RouteTarget::Resume => memory.resume_node_id.clone(),
    };
    let Some(target_node) = target_node.filter(|node| program.node_indexes.contains_key(node))
    else {
        return terminate_memory(memory, "missing-resume-node");
    };
    let previous_active = memory.active_node_id.clone();
    let mut routed = memory.clone();
    routed.active_node_id = target_node;
    routed.resume_node_id = match set_resume {
        Some(ResumeMutation::ActiveNode) => Some(previous_active),
        Some(ResumeMutation::Clear) => None,
        None => routed.resume_node_id,
    };
    routed.node_action_uses = 0;
    routed.node_no_step_uses = 0;
    if let Some(mutation) = set_flag {
        routed.flags.insert(mutation.flag.clone(), mutation.value);
    }
    routed
}

fn node<'a>(program: &'a AdaptivePolicyProgram, node_id: &str) -> &'a AdaptiveNode {
    &program.nodes[*program
        .node_indexes
        .get(node_id)
        .expect("validated adaptive program node")]
}

fn settle_memory(
    program: &AdaptivePolicyProgram,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    current: &AdaptivePolicyMemory,
) -> Result<AdaptivePolicyMemory, String> {
    let mut settled = current.clone();
    if settled.terminated {
        return Ok(settled);
    }
    if state.terminal == CraftTerminal::Completed {
        return Ok(terminate_memory(&settled, "craft-completed"));
    }
    if state.terminal == CraftTerminal::Failed {
        return Ok(terminate_memory(&settled, "craft-failed"));
    }
    if settled.total_action_uses >= program.max_actions {
        return Ok(terminate_memory(&settled, "max-actions-exhausted"));
    }

    let mut hops = 0_u32;
    while !settled.terminated {
        let active = node(program, &settled.active_node_id);
        let mut matched = None;
        for transition in &active.transitions {
            if all_guards_match(&transition.guards, case, state, &settled)? {
                matched = Some(transition);
                break;
            }
        }
        if let Some(transition) = matched {
            if hops >= program.max_settle_hops {
                return Ok(terminate_memory(&settled, "settle-hop-limit"));
            }
            hops += 1;
            settled = apply_route_effect(program, &transition.effect, &settled);
            continue;
        }
        if settled.node_action_uses < active.action_budget {
            return Ok(settled);
        }
        if let RouteEffect::Terminate(reason) = &active.on_budget_exhausted {
            return Ok(terminate_memory(&settled, format!("program:{reason}")));
        }
        if hops >= program.max_settle_hops {
            return Ok(terminate_memory(&settled, "settle-hop-limit"));
        }
        hops += 1;
        settled = apply_route_effect(program, &active.on_budget_exhausted, &settled);
    }
    Ok(settled)
}

fn decide(
    program: &AdaptivePolicyProgram,
    case: &AdaptivePolicyCase,
    state: &CraftState,
    memory: &AdaptivePolicyMemory,
) -> Result<AdaptivePolicyDecisionResult, String> {
    let settled = settle_memory(program, case, state, memory)?;
    if settled.terminated {
        return Ok(AdaptivePolicyDecisionResult {
            action: None,
            node_id: settled.active_node_id.clone(),
            decision_id: None,
            memory: settled,
        });
    }
    let active = node(program, &settled.active_node_id);
    for decision in &active.decisions {
        if !all_guards_match(&decision.guards, case, state, &settled)? {
            continue;
        }
        for action in &decision.actions {
            let preview = preview_action(&case.recipe, &case.crafter, state, *action);
            let projected = projected_successful_state(case, state, *action, &preview);
            let would_complete_below_objective = projected.as_ref().is_some_and(|value| {
                value.terminal == CraftTerminal::Completed
                    && value.quality < case.identity.quality_maximum
            });
            if preview.legal
                && policy_action_safe(case, state, *action, &preview)
                && (!would_complete_below_objective || decision.allow_below_objective_completion)
            {
                return Ok(AdaptivePolicyDecisionResult {
                    action: Some(*action),
                    node_id: active.id.clone(),
                    decision_id: Some(decision.id.clone()),
                    memory: settled,
                });
            }
        }
    }
    let terminated = terminate_memory(&settled, "no-safe-action");
    Ok(AdaptivePolicyDecisionResult {
        action: None,
        node_id: active.id.clone(),
        decision_id: None,
        memory: terminated,
    })
}

fn advance_memory(
    program: &AdaptivePolicyProgram,
    case: &AdaptivePolicyCase,
    before: &CraftState,
    action: CraftActionId,
    success: bool,
    after: &CraftState,
    settled_before: &AdaptivePolicyMemory,
) -> Result<AdaptivePolicyMemory, String> {
    if settled_before.terminated {
        return Err("cannot advance a terminated adaptive policy".to_owned());
    }
    let preview = preview_action(&case.recipe, &case.crafter, before, action);
    let no_step = preview.action.no_step;
    let mut advanced = settled_before.clone();
    advanced.total_action_uses += 1;
    advanced.total_no_step_uses += u32::from(no_step);
    advanced.node_action_uses += 1;
    advanced.node_no_step_uses += u32::from(no_step);
    advanced.total_observed_transitions += 1;
    advanced.action_uses[action_index(action)] += 1;
    advanced.last_action = Some(action);
    advanced.last_action_success = Some(success);
    settle_memory(program, case, after, &advanced)
}

pub fn execute_adaptive_policy_case(
    program: &AdaptivePolicyProgram,
    case: &AdaptivePolicyCase,
) -> Result<AdaptivePolicyOutcome, String> {
    if case.identity != program.identity {
        return Err("case/program identity mismatch before execution".to_owned());
    }
    let mut random = EpisodeRandomStream::new(case.seed);
    random.advance_condition_draws(case.initial_cursor.condition_draws);
    random.advance_success_draws(case.initial_cursor.success_draws);
    let mut cursor = case.initial_cursor;
    let mut state = case.initial_state.clone();
    let mut memory = initial_memory(program);
    let mut final_status = AdaptivePolicyFinalStatus {
        node_id: program.entry_node.clone(),
        decision_id: None,
        status: "active",
        termination_reason: None,
    };
    let mut stop_reason = None;
    let mut steps = Vec::new();

    while state.terminal == CraftTerminal::None && steps.len() < case.max_steps as usize {
        let decision = decide(program, case, &state, &memory)?;
        let Some(action) = decision.action else {
            memory = decision.memory.clone();
            final_status = AdaptivePolicyFinalStatus {
                node_id: decision.node_id,
                decision_id: None,
                status: if memory.terminated {
                    "terminated"
                } else {
                    "active"
                },
                termination_reason: memory.termination_reason.clone(),
            };
            stop_reason = Some(AdaptivePolicyStopReason::PolicyNull);
            break;
        };
        let preview = preview_action(&case.recipe, &case.crafter, &state, action);
        if !preview.legal {
            return Err(format!("policy returned illegal action {action}"));
        }
        let weights = &case.condition_transition_weights[state.condition.index()];
        let simulated =
            draw_simulated_action_outcome(&preview, &state, weights, &mut random, cursor);
        cursor = simulated.cursor_after;
        let before = state;
        let transition = apply_observed_outcome(
            &case.recipe,
            &case.crafter,
            &before,
            action,
            simulated.observed,
        )
        .map_err(|error| error.to_string())?;
        state = transition.next_state;
        let memory_after = advance_memory(
            program,
            case,
            &before,
            action,
            simulated.observed.success,
            &state,
            &decision.memory,
        )?;
        let step = AdaptivePolicyTraceStep {
            index: steps.len() as u32,
            decision,
            success: simulated.observed.success,
            next_condition: simulated.observed.next_condition,
            cursor_before: simulated.cursor_before,
            cursor_after: simulated.cursor_after,
            before,
            after: state.clone(),
            memory_after: memory_after.clone(),
            explanation_codes: transition.explanation_codes,
        };
        steps.push(step);
        memory = memory_after;
        final_status = AdaptivePolicyFinalStatus {
            node_id: memory.active_node_id.clone(),
            decision_id: None,
            status: if memory.terminated {
                "terminated"
            } else {
                "active"
            },
            termination_reason: memory.termination_reason.clone(),
        };
        match state.terminal {
            CraftTerminal::Completed => {
                stop_reason = Some(AdaptivePolicyStopReason::Completed);
                break;
            }
            CraftTerminal::Failed => {
                stop_reason = Some(AdaptivePolicyStopReason::Failed);
                break;
            }
            CraftTerminal::None if steps.len() >= case.max_steps as usize => {
                stop_reason = Some(AdaptivePolicyStopReason::ActionLimit);
                break;
            }
            CraftTerminal::None => {}
        }
    }

    let stop_reason = stop_reason.unwrap_or(match state.terminal {
        CraftTerminal::Completed => AdaptivePolicyStopReason::Completed,
        CraftTerminal::Failed => AdaptivePolicyStopReason::Failed,
        CraftTerminal::None if steps.len() >= case.max_steps as usize => {
            AdaptivePolicyStopReason::ActionLimit
        }
        CraftTerminal::None => AdaptivePolicyStopReason::PolicyNull,
    });
    Ok(AdaptivePolicyOutcome {
        case_id: case.case_id.clone(),
        crafter_case_id: case.crafter_case_id.clone(),
        world_id: case.world_id.clone(),
        identity: case.identity.clone(),
        seed: case.seed,
        stop_reason,
        initial_cursor: case.initial_cursor,
        final_cursor: cursor,
        final_status,
        final_state: state,
        final_memory: memory,
        steps,
    })
}

pub fn execute_adaptive_policy_matrix(
    request: &AdaptivePolicyMatrixRequest,
) -> Result<Vec<AdaptivePolicyOutcome>, String> {
    request
        .cases
        .iter()
        .map(|case| execute_adaptive_policy_case(&request.program, case))
        .collect()
}

fn boolean_cell(value: bool) -> String {
    if value { "1" } else { "0" }.to_owned()
}

fn optional_text(value: Option<&str>) -> String {
    value.unwrap_or(EMPTY).to_owned()
}

fn state_cells(state: &CraftState) -> Vec<String> {
    vec![
        state.step.to_string(),
        state.progress.to_string(),
        state.quality.to_string(),
        state.durability.to_string(),
        state.cp.to_string(),
        state.condition.as_str().to_owned(),
        state.inner_quiet.to_string(),
        state.buffs.waste_not.to_string(),
        state.buffs.veneration.to_string(),
        state.buffs.great_strides.to_string(),
        state.buffs.innovation.to_string(),
        state.buffs.final_appraisal.to_string(),
        state.buffs.manipulation.to_string(),
        state.buffs.muscle_memory.to_string(),
        state.buffs.expedience.to_string(),
        optional_text(state.combo_from.map(CraftActionId::as_str)),
        boolean_cell(state.trained_perfection_available),
        boolean_cell(state.trained_perfection_active),
        state.careful_observation_uses_left.to_string(),
        boolean_cell(state.heart_and_soul_available),
        boolean_cell(state.heart_and_soul_active),
        boolean_cell(state.quick_innovation_available),
        state.terminal.as_str().to_owned(),
        optional_text(state.failure_reason.map(CraftFailureReason::as_str)),
    ]
}

fn memory_cells(memory: &AdaptivePolicyMemory, flag_ids: &[String]) -> Vec<String> {
    let mut cells = vec![
        memory.active_node_id.clone(),
        optional_text(memory.resume_node_id.as_deref()),
        memory.total_action_uses.to_string(),
        memory.total_no_step_uses.to_string(),
        memory.node_action_uses.to_string(),
        memory.node_no_step_uses.to_string(),
        memory.total_observed_transitions.to_string(),
    ];
    cells.extend(memory.action_uses.iter().map(ToString::to_string));
    cells.extend(
        flag_ids
            .iter()
            .map(|flag| boolean_cell(memory.flags.get(flag).copied().unwrap_or(false))),
    );
    cells.push(optional_text(memory.last_action.map(CraftActionId::as_str)));
    cells.push(match memory.last_action_success {
        None => EMPTY.to_owned(),
        Some(true) => "success".to_owned(),
        Some(false) => "failure".to_owned(),
    });
    cells.push(boolean_cell(memory.terminated));
    cells.push(optional_text(memory.termination_reason.as_deref()));
    cells
}

fn identity_cells(identity: &AdaptivePolicyIdentity) -> Vec<String> {
    vec![
        identity.program_content_hash.clone(),
        identity.scenario_id.clone(),
        identity.scenario_model_identity_version.clone(),
        identity.scenario_model_content_hash.clone(),
        identity.feature_schema_version.clone(),
        identity.safety_version.clone(),
    ]
}

fn step_output_cells(
    program: &AdaptivePolicyProgram,
    outcome: &AdaptivePolicyOutcome,
    step: &AdaptivePolicyTraceStep,
) -> Vec<String> {
    let mut cells = vec![
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION.to_owned(),
        outcome.case_id.clone(),
        "step".to_owned(),
        "ok".to_owned(),
    ];
    cells.extend(identity_cells(&outcome.identity));
    cells.extend([
        step.index.to_string(),
        step.decision.node_id.clone(),
        step.decision
            .decision_id
            .clone()
            .unwrap_or_else(|| EMPTY.to_owned()),
        step.decision
            .action
            .expect("trace decision must contain action")
            .as_str()
            .to_owned(),
        boolean_cell(step.success),
        step.next_condition.as_str().to_owned(),
        step.cursor_before.condition_draws.to_string(),
        step.cursor_before.success_draws.to_string(),
        step.cursor_after.condition_draws.to_string(),
        step.cursor_after.success_draws.to_string(),
    ]);
    cells.extend(state_cells(&step.before));
    cells.extend(state_cells(&step.after));
    cells.extend(memory_cells(&step.decision.memory, &program.flag_ids));
    cells.extend(memory_cells(&step.memory_after, &program.flag_ids));
    cells.push(step.explanation_codes.len().to_string());
    cells.extend(
        step.explanation_codes
            .iter()
            .map(|code| code.as_str().to_owned()),
    );
    cells
}

fn outcome_output_cells(
    program: &AdaptivePolicyProgram,
    outcome: &AdaptivePolicyOutcome,
) -> Vec<String> {
    let mut cells = vec![
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION.to_owned(),
        outcome.case_id.clone(),
        "outcome".to_owned(),
        "ok".to_owned(),
    ];
    cells.extend(identity_cells(&outcome.identity));
    cells.extend([
        outcome.crafter_case_id.clone(),
        outcome.world_id.clone(),
        outcome.seed.to_string(),
        outcome.stop_reason.as_str().to_owned(),
        outcome.initial_cursor.condition_draws.to_string(),
        outcome.initial_cursor.success_draws.to_string(),
        outcome.final_cursor.condition_draws.to_string(),
        outcome.final_cursor.success_draws.to_string(),
        outcome.final_status.node_id.clone(),
        outcome
            .final_status
            .decision_id
            .clone()
            .unwrap_or_else(|| EMPTY.to_owned()),
        outcome.final_status.status.to_owned(),
        outcome
            .final_status
            .termination_reason
            .clone()
            .unwrap_or_else(|| EMPTY.to_owned()),
    ]);
    cells.extend(state_cells(&outcome.final_state));
    cells.extend(memory_cells(&outcome.final_memory, &program.flag_ids));
    cells.push(outcome.steps.len().to_string());
    cells
}

pub fn adaptive_policy_output_rows(
    program: &AdaptivePolicyProgram,
    outcomes: &[AdaptivePolicyOutcome],
) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    for outcome in outcomes {
        rows.extend(
            outcome
                .steps
                .iter()
                .map(|step| step_output_cells(program, outcome, step)),
        );
        rows.push(outcome_output_cells(program, outcome));
    }
    rows
}

fn fnv1a32(mut hash: u32, bytes: &[u8]) -> u32 {
    for byte in bytes {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(FNV32_PRIME);
    }
    hash
}

pub fn adaptive_policy_rows_fnv1a32(rows: &[Vec<String>]) -> u32 {
    let mut hash = FNV32_OFFSET_BASIS;
    for row in rows {
        hash = fnv1a32(hash, &(row.len() as u32).to_le_bytes());
        for cell in row {
            hash = fnv1a32(hash, &(cell.len() as u32).to_le_bytes());
            hash = fnv1a32(hash, cell.as_bytes());
        }
    }
    hash
}

fn fnv1a64(mut hash: u64, bytes: &[u8]) -> u64 {
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

pub fn format_adaptive_policy_matrix_output(
    program: &AdaptivePolicyProgram,
    outcomes: &[AdaptivePolicyOutcome],
    kernel_ns: u128,
) -> Result<String, String> {
    let rows = adaptive_policy_output_rows(program, outcomes);
    let lines: Vec<_> = rows.iter().map(|row| row.join("\t")).collect();
    let mut raw_hash = 0xcbf2_9ce4_8422_2325_u64;
    for line in &lines {
        raw_hash = fnv1a64(raw_hash, line.as_bytes());
        raw_hash = fnv1a64(raw_hash, b"\n");
    }
    let transitions: usize = outcomes.iter().map(|outcome| outcome.steps.len()).sum();
    let summary = format!(
        "{ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION}\t__batch__\tsummary\tok\t{}\t{transitions}\t{kernel_ns}\t{raw_hash:016x}\t{:08x}",
        outcomes.len(),
        adaptive_policy_rows_fnv1a32(&rows),
    );
    let output_bytes = lines
        .iter()
        .try_fold((summary.len() + 1) as u64, |total, line| {
            total.checked_add((line.len() + 1) as u64)
        })
        .ok_or("adaptive-policy output byte count overflow")?;
    if output_bytes > ADAPTIVE_POLICY_MAX_OUTPUT_BYTES {
        return Err(format!(
            "adaptive-policy output bytes {output_bytes} exceed {ADAPTIVE_POLICY_MAX_OUTPUT_BYTES}"
        ));
    }
    Ok(format!(
        "{}{}{}\n",
        lines.join("\n"),
        if lines.is_empty() { "" } else { "\n" },
        summary
    ))
}
