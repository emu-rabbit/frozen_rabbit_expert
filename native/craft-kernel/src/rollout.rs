use std::fmt;
use std::str::FromStr;
use std::time::Instant;

use crate::{
    CraftActionId, CraftBuffs, CraftFailureReason, CraftState, CraftTerminal, CrafterProfile,
    EpisodeRandomStream, ExplanationCode, MATERIAL_CONDITION_COUNT, MaterialCondition,
    RandomDrawCursor, RecipeProfile, TransitionResult, apply_observed_outcome,
    draw_simulated_action_outcome, legal_actions, preview_action,
};

pub const ROLLOUT_BATCH_PROTOCOL_VERSION: &str = "native-rollout-batch-v2";
pub const ROLLOUT_MAX_STEPS: u32 = 1_000;

pub type ConditionTransitionWeights = [[f64; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];

#[derive(Clone, Debug, PartialEq)]
pub struct RolloutCase {
    pub case_id: String,
    pub recipe: RecipeProfile,
    pub crafter: CrafterProfile,
    pub initial_state: CraftState,
    pub seed: u32,
    pub initial_cursor: RandomDrawCursor,
    pub max_steps: u32,
    pub condition_transition_weights: ConditionTransitionWeights,
    pub actions: Vec<CraftActionId>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RolloutRequest {
    pub case: RolloutCase,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RolloutStopReason {
    Completed,
    Failed,
    PolicyNull,
    NoLegalAction,
    IllegalAction,
    ActionLimit,
}

impl RolloutStopReason {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::PolicyNull => "policy-null",
            Self::NoLegalAction => "no-legal-action",
            Self::IllegalAction => "illegal-action",
            Self::ActionLimit => "action-limit",
        }
    }
}

impl fmt::Display for RolloutStopReason {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RolloutTraceStep {
    pub before_state: CraftState,
    pub action: CraftActionId,
    pub success: bool,
    pub next_condition: MaterialCondition,
    pub after_state: CraftState,
    pub cursor_before: RandomDrawCursor,
    pub cursor_after: RandomDrawCursor,
    pub explanation_codes: Vec<ExplanationCode>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RolloutResult {
    pub case_id: String,
    pub terminal: CraftTerminal,
    pub stop_reason: RolloutStopReason,
    pub actions: Vec<CraftActionId>,
    pub final_state: CraftState,
    pub initial_cursor: RandomDrawCursor,
    pub final_cursor: RandomDrawCursor,
    pub steps: Vec<RolloutTraceStep>,
}

impl RolloutResult {
    pub fn transition_count(&self) -> usize {
        self.steps.len()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RolloutResponse {
    Rollout(RolloutResult),
    Error { case_id: String, message: String },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RolloutBenchmarkResult {
    pub repetitions: u64,
    pub cases: usize,
    pub operations: u64,
    pub transitions: u64,
    pub kernel_ns: u128,
    pub hash: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RolloutParseError {
    pub case_id: String,
    pub message: String,
}

impl fmt::Display for RolloutParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for RolloutParseError {}

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
            return Err(format!("missing field {name} at column {}", self.index + 1));
        };
        self.index += 1;
        Ok(value)
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
            value => Err(format!(
                "invalid {name} at column {}: expected 0 or 1, got {value}",
                self.index
            )),
        }
    }

    fn optional<T>(&mut self, name: &str) -> Result<Option<T>, String>
    where
        T: FromStr,
        T::Err: fmt::Display,
    {
        let value = self.next(name)?;
        if value == "-" {
            Ok(None)
        } else {
            value
                .parse::<T>()
                .map(Some)
                .map_err(|error| format!("invalid {name} at column {}: {error}", self.index))
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
        combo_from: cells.optional("comboFrom")?,
        trained_perfection_available: cells.boolean("trainedPerfectionAvailable")?,
        trained_perfection_active: cells.boolean("trainedPerfectionActive")?,
        careful_observation_uses_left: cells.parse("carefulObservationUsesLeft")?,
        heart_and_soul_available: cells.boolean("heartAndSoulAvailable")?,
        heart_and_soul_active: cells.boolean("heartAndSoulActive")?,
        quick_innovation_available: cells.boolean("quickInnovationAvailable")?,
        terminal: cells.parse("terminal")?,
        failure_reason: cells.optional("failureReason")?,
    })
}

fn validate_recipe(recipe: &RecipeProfile) -> Result<(), String> {
    if recipe.canonical_recipe_id == 0 {
        return Err("canonicalRecipeId must be positive".to_owned());
    }
    if recipe.recipe_level == 0 {
        return Err("recipeLevel must be positive".to_owned());
    }
    if recipe.progress_required <= 0 {
        return Err("progressRequired must be positive".to_owned());
    }
    if recipe.quality_max < 0 {
        return Err("qualityMax must be non-negative".to_owned());
    }
    if !(0..=recipe.quality_max).contains(&recipe.required_quality) {
        return Err("requiredQuality must be between zero and qualityMax".to_owned());
    }
    if recipe.durability_max <= 0 {
        return Err("durabilityMax must be positive".to_owned());
    }
    for (name, value) in [
        ("progressDivider", recipe.progress_divider),
        ("qualityDivider", recipe.quality_divider),
        ("progressModifier", recipe.progress_modifier),
        ("qualityModifier", recipe.quality_modifier),
    ] {
        if !value.is_finite() || value <= 0.0 {
            return Err(format!("{name} must be finite and positive"));
        }
    }
    Ok(())
}

fn validate_crafter(crafter: &CrafterProfile) -> Result<(), String> {
    if crafter.level == 0 {
        return Err("crafterLevel must be positive".to_owned());
    }
    if crafter.craftsmanship == 0 {
        return Err("craftsmanship must be positive".to_owned());
    }
    if crafter.control == 0 {
        return Err("control must be positive".to_owned());
    }
    if crafter.max_cp < 0 {
        return Err("maxCp must be non-negative".to_owned());
    }
    Ok(())
}

fn validate_non_negative_durations(state: &CraftState) -> Result<(), String> {
    for (name, value) in [
        ("buffs.wasteNot", state.buffs.waste_not),
        ("buffs.veneration", state.buffs.veneration),
        ("buffs.greatStrides", state.buffs.great_strides),
        ("buffs.innovation", state.buffs.innovation),
        ("buffs.finalAppraisal", state.buffs.final_appraisal),
        ("buffs.manipulation", state.buffs.manipulation),
        ("buffs.muscleMemory", state.buffs.muscle_memory),
        ("buffs.expedience", state.buffs.expedience),
    ] {
        if value < 0 {
            return Err(format!("{name} must be non-negative"));
        }
    }
    Ok(())
}

fn validate_state(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
) -> Result<(), String> {
    if state.step == 0 {
        return Err("step must be positive".to_owned());
    }
    if !(0..=recipe.progress_required).contains(&state.progress) {
        return Err("progress must be between zero and progressRequired".to_owned());
    }
    if !(0..=recipe.quality_max).contains(&state.quality) {
        return Err("quality must be between zero and qualityMax".to_owned());
    }
    if state.durability > recipe.durability_max {
        return Err("durability must not exceed durabilityMax".to_owned());
    }
    if !(0..=crafter.max_cp).contains(&state.cp) {
        return Err("cp must be between zero and maxCp".to_owned());
    }
    if !(0..=10).contains(&state.inner_quiet) {
        return Err("innerQuiet must be between zero and ten".to_owned());
    }
    validate_non_negative_durations(state)?;
    if !(0..=3).contains(&state.careful_observation_uses_left) {
        return Err("carefulObservationUsesLeft must be between zero and three".to_owned());
    }
    if state.trained_perfection_active && state.trained_perfection_available {
        return Err("trainedPerfection cannot be active and available together".to_owned());
    }
    if state.heart_and_soul_active && state.heart_and_soul_available {
        return Err("heartAndSoul cannot be active and available together".to_owned());
    }
    if !crafter.specialist
        && (state.careful_observation_uses_left != 0
            || state.heart_and_soul_available
            || state.heart_and_soul_active
            || state.quick_innovation_available)
    {
        return Err("non-specialist state contains specialist resources".to_owned());
    }

    match (state.terminal, state.failure_reason) {
        (CraftTerminal::None, None) => {
            if state.progress >= recipe.progress_required || state.durability <= 0 {
                return Err("non-terminal state is already at a terminal boundary".to_owned());
            }
        }
        (CraftTerminal::Completed, None) => {
            if state.progress < recipe.progress_required || state.quality < recipe.required_quality
            {
                return Err("completed state does not satisfy recipe requirements".to_owned());
            }
        }
        (CraftTerminal::Failed, Some(CraftFailureReason::RequiredQuality)) => {
            if state.progress < recipe.progress_required || state.quality >= recipe.required_quality
            {
                return Err("required-quality failure is inconsistent with state".to_owned());
            }
        }
        (CraftTerminal::Failed, Some(CraftFailureReason::Durability)) => {
            if state.progress >= recipe.progress_required || state.durability > 0 {
                return Err("durability failure is inconsistent with state".to_owned());
            }
        }
        _ => return Err("terminal and failureReason are inconsistent".to_owned()),
    }
    Ok(())
}

fn parse_actions(value: &str) -> Result<Vec<CraftActionId>, String> {
    if value.is_empty() || value == "-" {
        return Err("actions must contain at least one action".to_owned());
    }
    let actions = value
        .split(',')
        .map(|action| {
            if action.is_empty() {
                Err("actions must not contain an empty element".to_owned())
            } else {
                action.parse::<CraftActionId>()
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    if actions.len() > ROLLOUT_MAX_STEPS as usize {
        return Err(format!(
            "actions must contain at most {ROLLOUT_MAX_STEPS} elements"
        ));
    }
    Ok(actions)
}

fn parse_transition_weights(cells: &mut Cells<'_>) -> Result<ConditionTransitionWeights, String> {
    let mut weights = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for previous in MaterialCondition::ALL {
        let mut total = 0.0;
        for next in MaterialCondition::ALL {
            let name = format!(
                "conditionTransitionWeight.{}.{}",
                previous.as_str(),
                next.as_str()
            );
            let weight = parse_finite(cells, &name)?;
            if weight < 0.0 {
                return Err(format!("{name} must be non-negative"));
            }
            weights[previous.index()][next.index()] = weight;
            total += weight;
        }
        if !total.is_finite() || total <= 0.0 {
            return Err(format!(
                "condition transition row {} must have finite positive total weight",
                previous.as_str()
            ));
        }
    }
    Ok(weights)
}

fn validate_transition_weights(weights: &ConditionTransitionWeights) -> Result<(), String> {
    for previous in MaterialCondition::ALL {
        let mut total = 0.0;
        for next in MaterialCondition::ALL {
            let weight = weights[previous.index()][next.index()];
            if !weight.is_finite() || weight < 0.0 {
                return Err(format!(
                    "conditionTransitionWeight.{}.{} must be finite and non-negative",
                    previous.as_str(),
                    next.as_str()
                ));
            }
            total += weight;
        }
        if !total.is_finite() || total <= 0.0 {
            return Err(format!(
                "condition transition row {} must have finite positive total weight",
                previous.as_str()
            ));
        }
    }
    Ok(())
}

fn validate_rollout_case(case: &RolloutCase) -> Result<(), String> {
    if case.case_id.is_empty() || case.case_id.contains(['\t', '\r', '\n']) {
        return Err("caseId must be a non-empty single TSV cell".to_owned());
    }
    validate_recipe(&case.recipe)?;
    validate_crafter(&case.crafter)?;
    validate_state(&case.recipe, &case.crafter, &case.initial_state)?;
    if case.initial_cursor.condition_draws > u64::from(u32::MAX)
        || case.initial_cursor.success_draws > u64::from(u32::MAX)
    {
        return Err("RNG cursor offsets must fit uint32".to_owned());
    }
    if !(1..=ROLLOUT_MAX_STEPS).contains(&case.max_steps) {
        return Err(format!(
            "maxSteps must be between 1 and {ROLLOUT_MAX_STEPS}"
        ));
    }
    if case.actions.is_empty() {
        return Err("actions must contain at least one action".to_owned());
    }
    if case.actions.len() > ROLLOUT_MAX_STEPS as usize {
        return Err(format!(
            "actions must contain at most {ROLLOUT_MAX_STEPS} elements"
        ));
    }
    validate_transition_weights(&case.condition_transition_weights)
}

pub fn parse_rollout_request(line: &str) -> Result<RolloutRequest, RolloutParseError> {
    let mut cells = Cells::new(line);
    let version = cells.next("version").unwrap_or("").to_owned();
    let case_id = cells.next("caseId").unwrap_or("-").to_owned();
    let command = cells.next("command").unwrap_or("unknown").to_owned();
    let parse = || -> Result<RolloutRequest, String> {
        if version != ROLLOUT_BATCH_PROTOCOL_VERSION {
            return Err(format!(
                "unsupported protocol version: expected {ROLLOUT_BATCH_PROTOCOL_VERSION}, got {version}"
            ));
        }
        if case_id.is_empty() || case_id.contains(['\t', '\r', '\n']) {
            return Err("caseId must be a non-empty single TSV cell".to_owned());
        }
        if command != "rollout" {
            return Err(format!("unknown command: {command}"));
        }

        let recipe = parse_recipe(&mut cells)?;
        let crafter = parse_crafter(&mut cells)?;
        let initial_state = parse_state(&mut cells)?;
        let seed = cells.parse("seed")?;
        let initial_cursor = RandomDrawCursor {
            condition_draws: u64::from(cells.parse::<u32>("conditionDrawOffset")?),
            success_draws: u64::from(cells.parse::<u32>("successDrawOffset")?),
        };
        let max_steps = cells.parse::<u32>("maxSteps")?;
        if !(1..=ROLLOUT_MAX_STEPS).contains(&max_steps) {
            return Err(format!(
                "maxSteps must be between 1 and {ROLLOUT_MAX_STEPS}"
            ));
        }
        let condition_transition_weights = parse_transition_weights(&mut cells)?;
        let actions = parse_actions(cells.next("actions")?)?;
        cells.finish()?;

        let case = RolloutCase {
            case_id: case_id.clone(),
            recipe,
            crafter,
            initial_state,
            seed,
            initial_cursor,
            max_steps,
            condition_transition_weights,
            actions,
        };
        validate_rollout_case(&case)?;
        Ok(RolloutRequest { case })
    }();

    parse.map_err(|message| RolloutParseError { case_id, message })
}

fn advance_random_to_cursor(random: &mut EpisodeRandomStream, cursor: RandomDrawCursor) {
    random.advance_condition_draws(cursor.condition_draws);
    random.advance_success_draws(cursor.success_draws);
}

fn terminal_stop_reason(terminal: CraftTerminal) -> Option<RolloutStopReason> {
    match terminal {
        CraftTerminal::None => None,
        CraftTerminal::Completed => Some(RolloutStopReason::Completed),
        CraftTerminal::Failed => Some(RolloutStopReason::Failed),
    }
}

pub fn execute_rollout(case: &RolloutCase) -> Result<RolloutResult, String> {
    validate_rollout_case(case)?;
    let mut random = EpisodeRandomStream::new(case.seed);
    advance_random_to_cursor(&mut random, case.initial_cursor);
    let mut cursor = case.initial_cursor;
    let mut state = case.initial_state.clone();
    let mut executed_actions = Vec::with_capacity(
        usize::try_from(case.max_steps)
            .unwrap_or(usize::MAX)
            .min(case.actions.len()),
    );
    let mut steps = Vec::with_capacity(executed_actions.capacity());
    let mut stop_reason = terminal_stop_reason(state.terminal);

    while stop_reason.is_none() && executed_actions.len() < case.max_steps as usize {
        let Some(action) = case.actions.get(executed_actions.len()).copied() else {
            stop_reason = Some(
                if legal_actions(&case.recipe, &case.crafter, &state).is_empty() {
                    RolloutStopReason::NoLegalAction
                } else {
                    RolloutStopReason::PolicyNull
                },
            );
            break;
        };
        let preview = preview_action(&case.recipe, &case.crafter, &state, action);
        if !preview.legal {
            stop_reason = Some(RolloutStopReason::IllegalAction);
            break;
        }

        let before_state = state.clone();
        let condition_weights = &case.condition_transition_weights[state.condition.index()];
        let simulated =
            draw_simulated_action_outcome(&preview, &state, condition_weights, &mut random, cursor);
        let TransitionResult {
            next_state,
            explanation_codes,
        } = apply_observed_outcome(
            &case.recipe,
            &case.crafter,
            &state,
            action,
            simulated.observed,
        )
        .map_err(|error| error.to_string())?;

        cursor = simulated.cursor_after;
        state = next_state;
        executed_actions.push(action);
        steps.push(RolloutTraceStep {
            before_state,
            action,
            success: simulated.observed.success,
            next_condition: simulated.observed.next_condition,
            after_state: state.clone(),
            cursor_before: simulated.cursor_before,
            cursor_after: simulated.cursor_after,
            explanation_codes,
        });

        stop_reason = terminal_stop_reason(state.terminal);
        if stop_reason.is_none() && executed_actions.len() >= case.max_steps as usize {
            stop_reason = Some(RolloutStopReason::ActionLimit);
        }
    }

    let stop_reason = stop_reason.unwrap_or_else(|| {
        terminal_stop_reason(state.terminal).unwrap_or_else(|| {
            if executed_actions.len() >= case.max_steps as usize {
                RolloutStopReason::ActionLimit
            } else if legal_actions(&case.recipe, &case.crafter, &state).is_empty() {
                RolloutStopReason::NoLegalAction
            } else {
                RolloutStopReason::PolicyNull
            }
        })
    });

    Ok(RolloutResult {
        case_id: case.case_id.clone(),
        terminal: state.terminal,
        stop_reason,
        actions: executed_actions,
        final_state: state,
        initial_cursor: case.initial_cursor,
        final_cursor: cursor,
        steps,
    })
}

pub fn process_rollout_request(request: RolloutRequest) -> RolloutResponse {
    match execute_rollout(&request.case) {
        Ok(result) => RolloutResponse::Rollout(result),
        Err(message) => RolloutResponse::Error {
            case_id: request.case.case_id,
            message,
        },
    }
}

const BENCHMARK_FNV_OFFSET_BASIS: u32 = 0x811c_9dc5;
const BENCHMARK_FNV_PRIME: u32 = 0x0100_0193;

fn benchmark_hash_bytes(mut hash: u32, bytes: &[u8]) -> u32 {
    for byte in bytes {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(BENCHMARK_FNV_PRIME);
    }
    hash
}

fn benchmark_hash_u8(hash: u32, value: u8) -> u32 {
    benchmark_hash_bytes(hash, &[value])
}

fn benchmark_hash_u32(hash: u32, value: u32) -> u32 {
    benchmark_hash_bytes(hash, &value.to_le_bytes())
}

fn benchmark_hash_i32(hash: u32, value: i32) -> u32 {
    benchmark_hash_bytes(hash, &value.to_le_bytes())
}

fn benchmark_hash_u64(hash: u32, value: u64) -> u32 {
    benchmark_hash_bytes(hash, &value.to_le_bytes())
}

fn benchmark_hash_text(hash: u32, value: &str) -> u32 {
    let hash = benchmark_hash_u32(hash, value.len() as u32);
    benchmark_hash_bytes(hash, value.as_bytes())
}

fn benchmark_hash_optional_text(hash: u32, value: Option<&str>) -> u32 {
    match value {
        Some(value) => benchmark_hash_text(benchmark_hash_u8(hash, 1), value),
        None => benchmark_hash_u8(hash, 0),
    }
}

fn benchmark_hash_cursor(mut hash: u32, cursor: RandomDrawCursor) -> u32 {
    hash = benchmark_hash_u64(hash, cursor.condition_draws);
    benchmark_hash_u64(hash, cursor.success_draws)
}

fn benchmark_hash_state(mut hash: u32, state: &CraftState) -> u32 {
    hash = benchmark_hash_u32(hash, state.step);
    hash = benchmark_hash_i32(hash, state.progress);
    hash = benchmark_hash_i32(hash, state.quality);
    hash = benchmark_hash_i32(hash, state.durability);
    hash = benchmark_hash_i32(hash, state.cp);
    hash = benchmark_hash_text(hash, state.condition.as_str());
    hash = benchmark_hash_i32(hash, state.inner_quiet);
    for duration in [
        state.buffs.waste_not,
        state.buffs.veneration,
        state.buffs.great_strides,
        state.buffs.innovation,
        state.buffs.final_appraisal,
        state.buffs.manipulation,
        state.buffs.muscle_memory,
        state.buffs.expedience,
    ] {
        hash = benchmark_hash_i32(hash, duration);
    }
    hash = benchmark_hash_optional_text(hash, state.combo_from.map(CraftActionId::as_str));
    hash = benchmark_hash_u8(hash, u8::from(state.trained_perfection_available));
    hash = benchmark_hash_u8(hash, u8::from(state.trained_perfection_active));
    hash = benchmark_hash_i32(hash, state.careful_observation_uses_left);
    hash = benchmark_hash_u8(hash, u8::from(state.heart_and_soul_available));
    hash = benchmark_hash_u8(hash, u8::from(state.heart_and_soul_active));
    hash = benchmark_hash_u8(hash, u8::from(state.quick_innovation_available));
    hash = benchmark_hash_text(hash, state.terminal.as_str());
    benchmark_hash_optional_text(hash, state.failure_reason.map(CraftFailureReason::as_str))
}

pub(crate) fn benchmark_hash_rollout_result(mut hash: u32, result: &RolloutResult) -> u32 {
    hash = benchmark_hash_text(hash, result.terminal.as_str());
    hash = benchmark_hash_text(hash, result.stop_reason.as_str());
    hash = benchmark_hash_u32(hash, result.actions.len() as u32);
    for action in &result.actions {
        hash = benchmark_hash_text(hash, action.as_str());
    }
    hash = benchmark_hash_u32(hash, result.steps.len() as u32);
    hash = benchmark_hash_cursor(hash, result.final_cursor);
    hash = benchmark_hash_state(hash, &result.final_state);
    hash = benchmark_hash_u32(hash, result.steps.len() as u32);
    for step in &result.steps {
        hash = benchmark_hash_text(hash, step.action.as_str());
        hash = benchmark_hash_u8(hash, u8::from(step.success));
        hash = benchmark_hash_text(hash, step.next_condition.as_str());
        hash = benchmark_hash_cursor(hash, step.cursor_before);
        hash = benchmark_hash_cursor(hash, step.cursor_after);
        hash = benchmark_hash_u32(hash, step.explanation_codes.len() as u32);
        for code in &step.explanation_codes {
            hash = benchmark_hash_text(hash, code.as_str());
        }
        hash = benchmark_hash_state(hash, &step.before_state);
        hash = benchmark_hash_state(hash, &step.after_state);
    }
    hash
}

/// Runs each input as one whole-rollout benchmark operation. Parsing and TSV
/// formatting remain outside the timed section; `transitions` counts every
/// successfully applied action across all operations.
pub fn benchmark_rollout_requests(
    requests: &[RolloutRequest],
    repetitions: u64,
) -> Result<RolloutBenchmarkResult, String> {
    if requests.is_empty() {
        return Err("benchmark requires at least one case".to_owned());
    }
    if repetitions == 0 {
        return Err("benchmark repetitions must be positive".to_owned());
    }
    let operations = repetitions
        .checked_mul(requests.len() as u64)
        .ok_or_else(|| "benchmark operation count overflow".to_owned())?;
    let started = Instant::now();
    let mut transitions = 0_u64;
    let mut hash = BENCHMARK_FNV_OFFSET_BASIS;
    for _ in 0..repetitions {
        for request in requests {
            let result = execute_rollout(&request.case)?;
            transitions = transitions
                .checked_add(result.steps.len() as u64)
                .ok_or_else(|| "benchmark transition count overflow".to_owned())?;
            hash = benchmark_hash_rollout_result(hash, &result);
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    Ok(RolloutBenchmarkResult {
        repetitions,
        cases: requests.len(),
        operations,
        transitions,
        kernel_ns,
        hash,
    })
}

fn push_bool(cells: &mut Vec<String>, value: bool) {
    cells.push(if value { "1" } else { "0" }.to_owned());
}

fn push_state(cells: &mut Vec<String>, state: &CraftState) {
    cells.extend([
        state.step.to_string(),
        state.progress.to_string(),
        state.quality.to_string(),
        state.durability.to_string(),
        state.cp.to_string(),
        state.condition.to_string(),
        state.inner_quiet.to_string(),
        state.buffs.waste_not.to_string(),
        state.buffs.veneration.to_string(),
        state.buffs.great_strides.to_string(),
        state.buffs.innovation.to_string(),
        state.buffs.final_appraisal.to_string(),
        state.buffs.manipulation.to_string(),
        state.buffs.muscle_memory.to_string(),
        state.buffs.expedience.to_string(),
        state
            .combo_from
            .map_or_else(|| "-".to_owned(), |value| value.to_string()),
    ]);
    push_bool(cells, state.trained_perfection_available);
    push_bool(cells, state.trained_perfection_active);
    cells.push(state.careful_observation_uses_left.to_string());
    push_bool(cells, state.heart_and_soul_available);
    push_bool(cells, state.heart_and_soul_active);
    push_bool(cells, state.quick_innovation_available);
    cells.push(state.terminal.to_string());
    cells.push(
        state
            .failure_reason
            .map_or_else(|| "-".to_owned(), |value| value.to_string()),
    );
}

fn format_trace_step(step: &RolloutTraceStep) -> String {
    let mut cells = vec![
        step.action.to_string(),
        if step.success { "1" } else { "0" }.to_owned(),
        step.next_condition.to_string(),
        step.cursor_before.condition_draws.to_string(),
        step.cursor_before.success_draws.to_string(),
        step.cursor_after.condition_draws.to_string(),
        step.cursor_after.success_draws.to_string(),
        if step.explanation_codes.is_empty() {
            "-".to_owned()
        } else {
            step.explanation_codes
                .iter()
                .map(|code| code.as_str())
                .collect::<Vec<_>>()
                .join(",")
        },
    ];
    push_state(&mut cells, &step.after_state);
    debug_assert_eq!(cells.len(), 32);
    cells.join("|")
}

fn sanitized(message: &str) -> String {
    message.replace(['\t', '\r', '\n'], " ")
}

pub fn format_rollout_response(response: &RolloutResponse) -> String {
    match response {
        RolloutResponse::Error { case_id, message } => [
            ROLLOUT_BATCH_PROTOCOL_VERSION.to_owned(),
            case_id.clone(),
            "rollout".to_owned(),
            "error".to_owned(),
            sanitized(message),
        ]
        .join("\t"),
        RolloutResponse::Rollout(result) => {
            let mut cells = vec![
                ROLLOUT_BATCH_PROTOCOL_VERSION.to_owned(),
                result.case_id.clone(),
                "rollout".to_owned(),
                "ok".to_owned(),
                result.terminal.to_string(),
                result.stop_reason.to_string(),
                if result.actions.is_empty() {
                    "-".to_owned()
                } else {
                    result
                        .actions
                        .iter()
                        .map(|action| action.as_str())
                        .collect::<Vec<_>>()
                        .join(",")
                },
                result.transition_count().to_string(),
                result.final_cursor.condition_draws.to_string(),
                result.final_cursor.success_draws.to_string(),
            ];
            push_state(&mut cells, &result.final_state);
            cells.push(if result.steps.is_empty() {
                "-".to_owned()
            } else {
                result
                    .steps
                    .iter()
                    .map(format_trace_step)
                    .collect::<Vec<_>>()
                    .join(";")
            });
            debug_assert_eq!(cells.len(), 35);
            cells.join("\t")
        }
    }
}
