use std::fmt;
use std::str::FromStr;
use std::time::Instant;

use crate::{
    ActionPreview, ConditionWeights, CraftActionId, CraftBuffs, CraftState, CrafterProfile,
    EpisodeRandomStream, MATERIAL_CONDITION_COUNT, MaterialCondition, ObservedActionOutcome,
    RandomDrawCursor, RecipeProfile, TransitionResult, apply_observed_outcome,
    draw_simulated_action_outcome, preview_action,
};

pub const BATCH_PROTOCOL_VERSION: &str = "native-transition-batch-v2";

#[derive(Clone, Debug, PartialEq)]
pub struct BatchCase {
    pub case_id: String,
    pub recipe: RecipeProfile,
    pub crafter: CrafterProfile,
    pub state: CraftState,
    pub action: CraftActionId,
}

#[derive(Clone, Debug, PartialEq)]
pub enum BatchRequest {
    Ping {
        case_id: String,
    },
    Preview(BatchCase),
    Apply {
        case: BatchCase,
        observed: ObservedActionOutcome,
    },
    Simulate {
        case: BatchCase,
        seed: u32,
        cursor: RandomDrawCursor,
        condition_weights: ConditionWeights,
    },
}

impl BatchRequest {
    pub fn case_id(&self) -> &str {
        match self {
            Self::Ping { case_id } => case_id,
            Self::Preview(case) | Self::Apply { case, .. } | Self::Simulate { case, .. } => {
                &case.case_id
            }
        }
    }

    pub const fn command(&self) -> &'static str {
        match self {
            Self::Ping { .. } => "ping",
            Self::Preview(_) => "preview",
            Self::Apply { .. } => "apply",
            Self::Simulate { .. } => "simulate",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct BatchTransitionResponse {
    pub case_id: String,
    pub command: &'static str,
    pub preview: ActionPreview,
    pub observed: Option<ObservedActionOutcome>,
    pub transition: Option<TransitionResult>,
    pub cursor_before: Option<RandomDrawCursor>,
    pub cursor_after: Option<RandomDrawCursor>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum BatchResponse {
    Pong {
        case_id: String,
    },
    Transition(BatchTransitionResponse),
    Error {
        case_id: String,
        command: String,
        message: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BatchBenchmarkResult {
    pub repetitions: u64,
    pub cases: usize,
    pub operations: u64,
    pub kernel_ns: u128,
    pub hash: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchParseError {
    pub case_id: String,
    pub command: String,
    pub message: String,
}

impl fmt::Display for BatchParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for BatchParseError {}

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

fn parse_common(cells: &mut Cells<'_>, case_id: String) -> Result<BatchCase, String> {
    let recipe = RecipeProfile {
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
    };
    let crafter = CrafterProfile {
        level: cells.parse("crafterLevel")?,
        craftsmanship: cells.parse("craftsmanship")?,
        control: cells.parse("control")?,
        max_cp: cells.parse("maxCp")?,
        cosmic_tool_good_bonus: cells.boolean("cosmicToolGoodBonus")?,
        specialist: cells.boolean("specialist")?,
    };
    let state = CraftState {
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
    };
    let action = cells.parse("action")?;
    Ok(BatchCase {
        case_id,
        recipe,
        crafter,
        state,
        action,
    })
}

pub fn parse_batch_request(line: &str) -> Result<BatchRequest, BatchParseError> {
    let mut cells = Cells::new(line);
    let version = cells.next("version").unwrap_or("").to_owned();
    let case_id = cells.next("caseId").unwrap_or("-").to_owned();
    let command = cells.next("command").unwrap_or("unknown").to_owned();
    let parse = || -> Result<BatchRequest, String> {
        if version != BATCH_PROTOCOL_VERSION {
            return Err(format!(
                "unsupported protocol version: expected {BATCH_PROTOCOL_VERSION}, got {version}"
            ));
        }
        if case_id.is_empty() || case_id.contains(['\t', '\r', '\n']) {
            return Err("caseId must be a non-empty single TSV cell".to_owned());
        }
        if command == "ping" {
            cells.finish()?;
            return Ok(BatchRequest::Ping {
                case_id: case_id.clone(),
            });
        }

        let case = parse_common(&mut cells, case_id.clone())?;
        match command.as_str() {
            "preview" => {
                cells.finish()?;
                Ok(BatchRequest::Preview(case))
            }
            "apply" => {
                let observed = ObservedActionOutcome {
                    success: cells.boolean("success")?,
                    next_condition: cells.parse("nextCondition")?,
                };
                cells.finish()?;
                Ok(BatchRequest::Apply { case, observed })
            }
            "simulate" => {
                let seed = cells.parse("seed")?;
                let cursor = RandomDrawCursor {
                    condition_draws: cells.parse("conditionDrawOffset")?,
                    success_draws: cells.parse("successDrawOffset")?,
                };
                let mut condition_weights = [0.0; MATERIAL_CONDITION_COUNT];
                for condition in MaterialCondition::ALL {
                    let weight = parse_finite(
                        &mut cells,
                        &format!("conditionWeight.{}", condition.as_str()),
                    )?;
                    if weight < 0.0 {
                        return Err(format!(
                            "conditionWeight.{} must be non-negative",
                            condition.as_str()
                        ));
                    }
                    condition_weights[condition.index()] = weight;
                }
                cells.finish()?;
                Ok(BatchRequest::Simulate {
                    case,
                    seed,
                    cursor,
                    condition_weights,
                })
            }
            _ => Err(format!("unknown command: {command}")),
        }
    }();

    parse.map_err(|message| BatchParseError {
        case_id,
        command,
        message,
    })
}

fn advance_random_to_cursor(random: &mut EpisodeRandomStream, cursor: RandomDrawCursor) {
    for _ in 0..cursor.condition_draws {
        random.next_condition_u32();
    }
    for _ in 0..cursor.success_draws {
        random.next_success_u32();
    }
}

pub fn process_batch_request(request: BatchRequest) -> BatchResponse {
    match request {
        BatchRequest::Ping { case_id } => BatchResponse::Pong { case_id },
        BatchRequest::Preview(case) => {
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            BatchResponse::Transition(BatchTransitionResponse {
                case_id: case.case_id,
                command: "preview",
                preview,
                observed: None,
                transition: None,
                cursor_before: None,
                cursor_after: None,
            })
        }
        BatchRequest::Apply { case, observed } => {
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            match apply_observed_outcome(
                &case.recipe,
                &case.crafter,
                &case.state,
                case.action,
                observed,
            ) {
                Ok(transition) => BatchResponse::Transition(BatchTransitionResponse {
                    case_id: case.case_id,
                    command: "apply",
                    preview,
                    observed: Some(observed),
                    transition: Some(transition),
                    cursor_before: None,
                    cursor_after: None,
                }),
                Err(error) => BatchResponse::Error {
                    case_id: case.case_id,
                    command: "apply".to_owned(),
                    message: error.to_string(),
                },
            }
        }
        BatchRequest::Simulate {
            case,
            seed,
            cursor,
            condition_weights,
        } => {
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            if !preview.legal {
                return BatchResponse::Error {
                    case_id: case.case_id,
                    command: "simulate".to_owned(),
                    message: format!(
                        "Illegal action {}: {}",
                        case.action,
                        preview.reason.expect("illegal preview has a reason")
                    ),
                };
            }
            let mut random = EpisodeRandomStream::new(seed);
            advance_random_to_cursor(&mut random, cursor);
            let simulated = draw_simulated_action_outcome(
                &preview,
                &case.state,
                &condition_weights,
                &mut random,
                cursor,
            );
            match apply_observed_outcome(
                &case.recipe,
                &case.crafter,
                &case.state,
                case.action,
                simulated.observed,
            ) {
                Ok(transition) => BatchResponse::Transition(BatchTransitionResponse {
                    case_id: case.case_id,
                    command: "simulate",
                    preview,
                    observed: Some(simulated.observed),
                    transition: Some(transition),
                    cursor_before: Some(simulated.cursor_before),
                    cursor_after: Some(simulated.cursor_after),
                }),
                Err(error) => BatchResponse::Error {
                    case_id: case.case_id,
                    command: "simulate".to_owned(),
                    message: error.to_string(),
                },
            }
        }
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

fn benchmark_hash_f64(hash: u32, value: f64) -> u32 {
    benchmark_hash_bytes(hash, &value.to_bits().to_le_bytes())
}

fn benchmark_hash_text(hash: u32, value: &str) -> u32 {
    let hash = benchmark_hash_u32(hash, value.len() as u32);
    benchmark_hash_bytes(hash, value.as_bytes())
}

fn benchmark_hash_preview(mut hash: u32, preview: &ActionPreview) -> u32 {
    hash = benchmark_hash_u8(hash, u8::from(preview.legal));
    hash = match preview.reason {
        Some(reason) => benchmark_hash_text(benchmark_hash_u8(hash, 1), reason.as_str()),
        None => benchmark_hash_u8(hash, 0),
    };
    hash = benchmark_hash_i32(hash, preview.cp_cost);
    hash = benchmark_hash_i32(hash, preview.durability_cost);
    hash = benchmark_hash_f64(hash, preview.success_rate);
    hash = benchmark_hash_i32(hash, preview.progress_gain);
    benchmark_hash_i32(hash, preview.quality_gain)
}

fn benchmark_hash_observed(mut hash: u32, observed: ObservedActionOutcome) -> u32 {
    hash = benchmark_hash_u8(hash, u8::from(observed.success));
    benchmark_hash_text(hash, observed.next_condition.as_str())
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
    hash = match state.combo_from {
        Some(action) => benchmark_hash_text(benchmark_hash_u8(hash, 1), action.as_str()),
        None => benchmark_hash_u8(hash, 0),
    };
    hash = benchmark_hash_u8(hash, u8::from(state.trained_perfection_available));
    hash = benchmark_hash_u8(hash, u8::from(state.trained_perfection_active));
    hash = benchmark_hash_i32(hash, state.careful_observation_uses_left);
    hash = benchmark_hash_u8(hash, u8::from(state.heart_and_soul_available));
    hash = benchmark_hash_u8(hash, u8::from(state.heart_and_soul_active));
    hash = benchmark_hash_u8(hash, u8::from(state.quick_innovation_available));
    hash = benchmark_hash_text(hash, state.terminal.as_str());
    match state.failure_reason {
        Some(reason) => benchmark_hash_text(benchmark_hash_u8(hash, 1), reason.as_str()),
        None => benchmark_hash_u8(hash, 0),
    }
}

fn benchmark_hash_transition(mut hash: u32, transition: &TransitionResult) -> u32 {
    hash = benchmark_hash_state(hash, &transition.next_state);
    hash = benchmark_hash_u32(hash, transition.explanation_codes.len() as u32);
    for code in &transition.explanation_codes {
        hash = benchmark_hash_text(hash, code.as_str());
    }
    hash
}

fn benchmark_one_request(
    mut hash: u32,
    case_index: usize,
    request: &BatchRequest,
) -> Result<u32, String> {
    hash = benchmark_hash_u32(hash, case_index as u32);
    match request {
        BatchRequest::Ping { .. } => Err("ping is not a benchmark operation".to_owned()),
        BatchRequest::Preview(case) => {
            hash = benchmark_hash_u8(hash, 1);
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            Ok(benchmark_hash_preview(hash, &preview))
        }
        BatchRequest::Apply { case, observed } => {
            hash = benchmark_hash_u8(hash, 2);
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            hash = benchmark_hash_preview(hash, &preview);
            hash = benchmark_hash_observed(hash, *observed);
            let transition = apply_observed_outcome(
                &case.recipe,
                &case.crafter,
                &case.state,
                case.action,
                *observed,
            )
            .map_err(|error| error.to_string())?;
            Ok(benchmark_hash_transition(hash, &transition))
        }
        BatchRequest::Simulate {
            case,
            seed,
            cursor,
            condition_weights,
        } => {
            hash = benchmark_hash_u8(hash, 3);
            let preview = preview_action(&case.recipe, &case.crafter, &case.state, case.action);
            if !preview.legal {
                return Err(format!(
                    "Illegal action {}: {}",
                    case.action,
                    preview.reason.expect("illegal preview has a reason")
                ));
            }
            hash = benchmark_hash_preview(hash, &preview);
            let mut random = EpisodeRandomStream::new(*seed);
            advance_random_to_cursor(&mut random, *cursor);
            let simulated = draw_simulated_action_outcome(
                &preview,
                &case.state,
                condition_weights,
                &mut random,
                *cursor,
            );
            hash = benchmark_hash_observed(hash, simulated.observed);
            let transition = apply_observed_outcome(
                &case.recipe,
                &case.crafter,
                &case.state,
                case.action,
                simulated.observed,
            )
            .map_err(|error| error.to_string())?;
            hash = benchmark_hash_transition(hash, &transition);
            hash = benchmark_hash_u64(hash, simulated.cursor_before.condition_draws);
            hash = benchmark_hash_u64(hash, simulated.cursor_before.success_draws);
            hash = benchmark_hash_u64(hash, simulated.cursor_after.condition_draws);
            Ok(benchmark_hash_u64(
                hash,
                simulated.cursor_after.success_draws,
            ))
        }
    }
}

/// Parses no text and formats no per-case output inside the timed section.
/// The FNV-1a checksum covers every field that the parity protocol exposes,
/// using fixed little-endian primitives and length-prefixed UTF-8 enum names.
pub fn benchmark_batch_requests(
    requests: &[BatchRequest],
    repetitions: u64,
) -> Result<BatchBenchmarkResult, String> {
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
    let mut hash = BENCHMARK_FNV_OFFSET_BASIS;
    for _ in 0..repetitions {
        for (case_index, request) in requests.iter().enumerate() {
            hash = benchmark_one_request(hash, case_index, request)?;
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    Ok(BatchBenchmarkResult {
        repetitions,
        cases: requests.len(),
        operations,
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

fn sanitized(message: &str) -> String {
    message.replace(['\t', '\r', '\n'], " ")
}

pub fn format_batch_response(response: &BatchResponse) -> String {
    match response {
        BatchResponse::Pong { case_id } => [
            BATCH_PROTOCOL_VERSION.to_owned(),
            case_id.clone(),
            "ping".to_owned(),
            "ok".to_owned(),
        ]
        .join("\t"),
        BatchResponse::Error {
            case_id,
            command,
            message,
        } => [
            BATCH_PROTOCOL_VERSION.to_owned(),
            case_id.clone(),
            command.clone(),
            "error".to_owned(),
            sanitized(message),
        ]
        .join("\t"),
        BatchResponse::Transition(result) => {
            let mut cells = vec![
                BATCH_PROTOCOL_VERSION.to_owned(),
                result.case_id.clone(),
                result.command.to_owned(),
                "ok".to_owned(),
            ];
            push_bool(&mut cells, result.preview.legal);
            cells.extend([
                result
                    .preview
                    .reason
                    .map_or_else(|| "-".to_owned(), |value| value.to_string()),
                result.preview.cp_cost.to_string(),
                result.preview.durability_cost.to_string(),
                result.preview.success_rate.to_string(),
                result.preview.progress_gain.to_string(),
                result.preview.quality_gain.to_string(),
            ]);
            if let Some(transition) = &result.transition {
                let observed = result
                    .observed
                    .expect("transition response includes an observed outcome");
                push_bool(&mut cells, observed.success);
                cells.push(observed.next_condition.to_string());
                push_state(&mut cells, &transition.next_state);
                cells.push(if transition.explanation_codes.is_empty() {
                    "-".to_owned()
                } else {
                    transition
                        .explanation_codes
                        .iter()
                        .map(|code| code.as_str())
                        .collect::<Vec<_>>()
                        .join(",")
                });
                match (result.cursor_before, result.cursor_after) {
                    (Some(before), Some(after)) => cells.extend([
                        before.condition_draws.to_string(),
                        before.success_draws.to_string(),
                        after.condition_draws.to_string(),
                        after.success_draws.to_string(),
                    ]),
                    _ => cells.extend([
                        "-".to_owned(),
                        "-".to_owned(),
                        "-".to_owned(),
                        "-".to_owned(),
                    ]),
                }
            }
            cells.join("\t")
        }
    }
}
