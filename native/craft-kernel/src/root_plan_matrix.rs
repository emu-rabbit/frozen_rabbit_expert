use std::collections::HashSet;
use std::fmt;
use std::str::FromStr;
use std::time::Instant;

use crate::rollout::benchmark_hash_rollout_result;
use crate::{
    CraftActionId, CraftState, ROLLOUT_BATCH_PROTOCOL_VERSION, RolloutCase, RolloutResult,
    execute_rollout, parse_rollout_request,
};

pub const ROOT_PLAN_MATRIX_PROTOCOL_VERSION: &str = "native-root-plan-matrix-v1";
pub const FIXED_CONTINUATION_PLAN_VERSION: &str = "native-fixed-continuation-plan-v1";
pub const SCENARIO_MODEL_IDENTITY_VERSION: &str = "craft-scenario-model-identity-v1";
pub const ROOT_PLAN_MATRIX_MAX_CANDIDATES: usize = 35;
pub const ROOT_PLAN_MATRIX_MAX_SAMPLES: usize = 65_536;
pub const ROOT_PLAN_MATRIX_MAX_OPERATIONS: u64 = 1_000_000;
pub const ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS: u64 = 100_000_000;
pub const ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS: u64 = 2_000_000;
pub const ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS: u64 = 100_000_000;
pub const ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES: u64 = 240 * 1024 * 1024;
pub const ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS: u64 = 10_000_000;
pub const ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS: u64 = 100_000_000;

const ROOT_PLAN_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME: u64 = 4_096;
const ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_FULL_TRACE_TRANSITION: u64 = 1_024;
const ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_OUTCOME_ONLY_TRANSITION: u64 = 64;
const ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES: u64 = 4_096;

const FNV32_OFFSET_BASIS: u32 = 0x811c_9dc5;
const FNV32_PRIME: u32 = 0x0100_0193;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RootPlanTraceMode {
    FullTrace,
    OutcomeOnly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RootPlanSample {
    pub sample_index: u32,
    pub paired_seed: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootPlanCandidate {
    pub ordinal: u32,
    pub candidate_id: String,
    pub root_action: CraftActionId,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RootPlanMatrixRequest {
    pub case_id: String,
    pub scenario_id: String,
    pub scenario_model_content_hash: String,
    pub condition_profile_id: String,
    pub continuation_plan_id: String,
    pub continuation_plan_content_fnv1a32: String,
    pub trace_mode: RootPlanTraceMode,
    pub template: RolloutCase,
    pub continuation_actions: Vec<CraftActionId>,
    pub samples: Vec<RootPlanSample>,
    pub candidates: Vec<RootPlanCandidate>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RootPlanMatrixOutcome {
    pub case_id: String,
    pub scenario_id: String,
    pub scenario_model_content_hash: String,
    pub condition_profile_id: String,
    pub continuation_plan_id: String,
    pub candidate: RootPlanCandidate,
    pub sample: RootPlanSample,
    pub rollout: RolloutResult,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RootPlanMatrixBenchmarkResult {
    pub repetitions: u64,
    pub requests: usize,
    pub operations: u64,
    pub transitions: u64,
    pub kernel_ns: u128,
    pub hash: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RootPlanMatrixBatchProjection {
    pub requests: usize,
    pub operations: u64,
    pub projected_transitions: u64,
    pub projected_output_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootPlanMatrixParseError {
    pub case_id: String,
    pub message: String,
}

impl fmt::Display for RootPlanMatrixParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for RootPlanMatrixParseError {}

fn safe_token(value: &str, name: &str) -> Result<(), String> {
    if value.is_empty() || value.contains(['\t', '\r', '\n', ',', ':', ';', '|']) {
        return Err(format!("{name} must be a non-empty safe protocol token"));
    }
    Ok(())
}

fn parse_actions(value: &str, allow_empty: bool) -> Result<Vec<CraftActionId>, String> {
    if value == "-" {
        return if allow_empty {
            Ok(Vec::new())
        } else {
            Err("actions must not be empty".to_owned())
        };
    }
    let actions = value
        .split(',')
        .map(CraftActionId::from_str)
        .collect::<Result<Vec<_>, _>>()?;
    if !allow_empty && actions.is_empty() {
        return Err("actions must not be empty".to_owned());
    }
    Ok(actions)
}

fn parse_samples(value: &str) -> Result<Vec<RootPlanSample>, String> {
    let mut samples = Vec::new();
    let mut indexes = HashSet::new();
    for encoded in value.split(',') {
        let Some((index, seed)) = encoded.split_once(':') else {
            return Err(format!("invalid sample token {encoded}"));
        };
        let sample_index = index
            .parse::<u32>()
            .map_err(|error| format!("invalid sample index: {error}"))?;
        let paired_seed = seed
            .parse::<u32>()
            .map_err(|error| format!("invalid paired seed: {error}"))?;
        if !indexes.insert(sample_index) {
            return Err(format!("duplicate sample index {sample_index}"));
        }
        samples.push(RootPlanSample {
            sample_index,
            paired_seed,
        });
    }
    if samples.is_empty() || samples.len() > ROOT_PLAN_MATRIX_MAX_SAMPLES {
        return Err(format!(
            "samples must contain 1..={ROOT_PLAN_MATRIX_MAX_SAMPLES} entries"
        ));
    }
    samples.sort_unstable_by_key(|sample| sample.sample_index);
    Ok(samples)
}

fn parse_candidates(value: &str) -> Result<Vec<RootPlanCandidate>, String> {
    let mut candidates = Vec::new();
    let mut ordinals = HashSet::new();
    let mut ids = HashSet::new();
    let mut actions = HashSet::new();
    for encoded in value.split(',') {
        let parts: Vec<_> = encoded.split(':').collect();
        if parts.len() != 3 {
            return Err(format!("invalid candidate token {encoded}"));
        }
        let ordinal = parts[0]
            .parse::<u32>()
            .map_err(|error| format!("invalid candidate ordinal: {error}"))?;
        safe_token(parts[1], "candidateId")?;
        let root_action = parts[2].parse::<CraftActionId>()?;
        if !ordinals.insert(ordinal) {
            return Err(format!("duplicate candidate ordinal {ordinal}"));
        }
        if !ids.insert(parts[1].to_owned()) {
            return Err(format!("duplicate candidate id {}", parts[1]));
        }
        if !actions.insert(root_action) {
            return Err(format!("duplicate root action {root_action}"));
        }
        candidates.push(RootPlanCandidate {
            ordinal,
            candidate_id: parts[1].to_owned(),
            root_action,
        });
    }
    if candidates.is_empty() || candidates.len() > ROOT_PLAN_MATRIX_MAX_CANDIDATES {
        return Err(format!(
            "candidates must contain 1..={ROOT_PLAN_MATRIX_MAX_CANDIDATES} entries"
        ));
    }
    candidates.sort_unstable_by_key(|candidate| candidate.ordinal);
    Ok(candidates)
}

fn fnv1a32(mut hash: u32, bytes: &[u8]) -> u32 {
    for byte in bytes {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(FNV32_PRIME);
    }
    hash
}

fn benchmark_hash_u32(hash: u32, value: u32) -> u32 {
    fnv1a32(hash, &value.to_le_bytes())
}

fn benchmark_hash_text(hash: u32, value: &str) -> u32 {
    let hash = benchmark_hash_u32(hash, value.len() as u32);
    fnv1a32(hash, value.as_bytes())
}

fn benchmark_hash_outcome(mut hash: u32, outcome: &RootPlanMatrixOutcome) -> u32 {
    hash = benchmark_hash_text(hash, &outcome.case_id);
    hash = benchmark_hash_text(hash, &outcome.scenario_id);
    hash = benchmark_hash_text(hash, SCENARIO_MODEL_IDENTITY_VERSION);
    hash = benchmark_hash_text(hash, &outcome.scenario_model_content_hash);
    hash = benchmark_hash_text(hash, &outcome.continuation_plan_id);
    hash = benchmark_hash_text(hash, &outcome.condition_profile_id);
    hash = benchmark_hash_u32(hash, outcome.candidate.ordinal);
    hash = benchmark_hash_text(hash, &outcome.candidate.candidate_id);
    hash = benchmark_hash_text(hash, outcome.candidate.root_action.as_str());
    hash = benchmark_hash_u32(hash, outcome.sample.sample_index);
    hash = benchmark_hash_u32(hash, outcome.sample.paired_seed);
    benchmark_hash_rollout_result(hash, &outcome.rollout)
}

fn plan_content(plan_id: &str, actions: &[CraftActionId]) -> Vec<u8> {
    let mut content = Vec::new();
    for (index, token) in std::iter::once(FIXED_CONTINUATION_PLAN_VERSION)
        .chain(std::iter::once(plan_id))
        .chain(actions.iter().map(|action| action.as_str()))
        .enumerate()
    {
        if index > 0 {
            content.push(0);
        }
        content.extend_from_slice(token.as_bytes());
    }
    content
}

pub fn fixed_continuation_plan_hash(plan_id: &str, actions: &[CraftActionId]) -> String {
    format!(
        "{:08x}",
        fnv1a32(FNV32_OFFSET_BASIS, &plan_content(plan_id, actions))
    )
}

pub fn parse_root_plan_matrix_request(
    line: &str,
) -> Result<RootPlanMatrixRequest, RootPlanMatrixParseError> {
    let cells: Vec<_> = line.trim_end_matches(['\r', '\n']).split('\t').collect();
    let case_id = cells.get(1).copied().unwrap_or("-").to_owned();
    let parse = || -> Result<RootPlanMatrixRequest, String> {
        if cells.len() != 120 {
            return Err(format!(
                "root-plan matrix request must have 120 cells, got {}",
                cells.len()
            ));
        }
        if cells[0] != ROOT_PLAN_MATRIX_PROTOCOL_VERSION {
            return Err(format!("unsupported root-plan version {}", cells[0]));
        }
        safe_token(cells[1], "caseId")?;
        if cells[2] != "matrix" {
            return Err(format!("unsupported root-plan command {}", cells[2]));
        }
        safe_token(cells[3], "scenarioId")?;
        if cells[4] != SCENARIO_MODEL_IDENTITY_VERSION {
            return Err(format!("unsupported scenario model identity {}", cells[4]));
        }
        if !cells[5].starts_with("sha256:") || cells[5].len() != 71 {
            return Err("scenario model content hash must be a sha256 identity".to_owned());
        }
        safe_token(cells[6], "conditionProfileId")?;
        safe_token(cells[7], "continuationPlanId")?;
        if cells[8].len() != 8 || !cells[8].bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("continuation plan FNV must be eight hexadecimal digits".to_owned());
        }
        let trace_mode = match cells[9] {
            "full-trace" => RootPlanTraceMode::FullTrace,
            "outcome-only" => RootPlanTraceMode::OutcomeOnly,
            value => return Err(format!("unsupported trace mode {value}")),
        };
        let continuation_actions = parse_actions(cells[117], true)?;
        if 1 + continuation_actions.len() > 1_000 {
            return Err("root plus continuation must contain at most 1000 actions".to_owned());
        }
        let expected_plan_hash = fixed_continuation_plan_hash(cells[7], &continuation_actions);
        if !cells[8].eq_ignore_ascii_case(&expected_plan_hash) {
            return Err(format!(
                "continuation plan content FNV mismatch: expected {expected_plan_hash}, got {}",
                cells[8]
            ));
        }
        let samples = parse_samples(cells[118])?;
        let candidates = parse_candidates(cells[119])?;
        let operations = (samples.len() as u64)
            .checked_mul(candidates.len() as u64)
            .ok_or_else(|| "root-plan operation count overflow".to_owned())?;
        if operations > ROOT_PLAN_MATRIX_MAX_OPERATIONS {
            return Err(format!(
                "root-plan operations {operations} exceed {ROOT_PLAN_MATRIX_MAX_OPERATIONS}"
            ));
        }

        let actions = std::iter::once(candidates[0].root_action)
            .chain(continuation_actions.iter().copied())
            .map(CraftActionId::as_str)
            .collect::<Vec<_>>()
            .join(",");
        let mut rollout_cells = vec![
            ROLLOUT_BATCH_PROTOCOL_VERSION.to_owned(),
            format!(
                "{}.{}.{}",
                cells[1], candidates[0].candidate_id, samples[0].sample_index
            ),
            "rollout".to_owned(),
        ];
        rollout_cells.extend(cells[10..50].iter().map(|value| (*value).to_owned()));
        rollout_cells.push(samples[0].paired_seed.to_string());
        rollout_cells.extend(cells[50..117].iter().map(|value| (*value).to_owned()));
        rollout_cells.push(actions);
        let template = parse_rollout_request(&rollout_cells.join("\t"))
            .map_err(|error| format!("invalid embedded rollout: {}", error.message))?
            .case;
        let action_bound = usize::try_from(template.max_steps)
            .unwrap_or(usize::MAX)
            .min(1 + continuation_actions.len()) as u64;
        let projected_transitions = operations
            .checked_mul(action_bound)
            .ok_or_else(|| "projected transition count overflow".to_owned())?;
        if projected_transitions > ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS {
            return Err(format!(
                "projected transitions {projected_transitions} exceed {ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS}"
            ));
        }

        Ok(RootPlanMatrixRequest {
            case_id: cells[1].to_owned(),
            scenario_id: cells[3].to_owned(),
            scenario_model_content_hash: cells[5].to_owned(),
            condition_profile_id: cells[6].to_owned(),
            continuation_plan_id: cells[7].to_owned(),
            continuation_plan_content_fnv1a32: expected_plan_hash,
            trace_mode,
            template,
            continuation_actions,
            samples,
            candidates,
        })
    };
    parse().map_err(|message| RootPlanMatrixParseError { case_id, message })
}

fn pair_rollout_case(
    request: &RootPlanMatrixRequest,
    candidate: &RootPlanCandidate,
    sample: RootPlanSample,
) -> RolloutCase {
    let mut case = request.template.clone();
    case.case_id = format!(
        "{}.{}.{}",
        request.case_id, candidate.candidate_id, sample.sample_index
    );
    case.seed = sample.paired_seed;
    case.actions.clear();
    case.actions.push(candidate.root_action);
    case.actions
        .extend(request.continuation_actions.iter().copied());
    case
}

fn checked_add(left: u64, right: u64, label: &str) -> Result<u64, String> {
    left.checked_add(right)
        .ok_or_else(|| format!("root-plan {label} overflow"))
}

fn checked_mul(left: u64, right: u64, label: &str) -> Result<u64, String> {
    left.checked_mul(right)
        .ok_or_else(|| format!("root-plan {label} overflow"))
}

fn request_projection(
    request: &RootPlanMatrixRequest,
) -> Result<RootPlanMatrixBatchProjection, String> {
    if request.candidates.is_empty() || request.candidates.len() > ROOT_PLAN_MATRIX_MAX_CANDIDATES {
        return Err(format!(
            "candidates must contain 1..={ROOT_PLAN_MATRIX_MAX_CANDIDATES} entries"
        ));
    }
    if request.samples.is_empty() || request.samples.len() > ROOT_PLAN_MATRIX_MAX_SAMPLES {
        return Err(format!(
            "samples must contain 1..={ROOT_PLAN_MATRIX_MAX_SAMPLES} entries"
        ));
    }
    if request.template.max_steps == 0 || request.template.max_steps > 1_000 {
        return Err("root-plan max steps must be in 1..=1000".to_owned());
    }
    if 1 + request.continuation_actions.len() > 1_000 {
        return Err("root plus continuation must contain at most 1000 actions".to_owned());
    }

    let operations = checked_mul(
        request.candidates.len() as u64,
        request.samples.len() as u64,
        "operation count",
    )?;
    if operations > ROOT_PLAN_MATRIX_MAX_OPERATIONS {
        return Err(format!(
            "root-plan operations {operations} exceed {ROOT_PLAN_MATRIX_MAX_OPERATIONS}"
        ));
    }
    let action_bound =
        u64::from(request.template.max_steps).min(1 + request.continuation_actions.len() as u64);
    let projected_transitions = checked_mul(operations, action_bound, "transition count")?;
    if projected_transitions > ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS {
        return Err(format!(
            "projected transitions {projected_transitions} exceed {ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS}"
        ));
    }

    // Every unbounded protocol token echoed by the formatter is counted exactly.
    // The remaining fixed fields and bounded numeric/enum state cells fit inside
    // the deliberately conservative per-outcome allowance. The per-transition
    // allowance covers both the action list and (when requested) the full trace.
    let identity_bytes = [
        request.case_id.len(),
        request.scenario_id.len(),
        request.scenario_model_content_hash.len(),
        request.condition_profile_id.len(),
        request.continuation_plan_id.len(),
    ]
    .into_iter()
    .try_fold(0_u64, |total, length| {
        checked_add(total, length as u64, "output byte count")
    })?;
    let transition_bytes = match request.trace_mode {
        RootPlanTraceMode::FullTrace => ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_FULL_TRACE_TRANSITION,
        RootPlanTraceMode::OutcomeOnly => ROOT_PLAN_MATRIX_OUTPUT_BYTES_PER_OUTCOME_ONLY_TRANSITION,
    };
    let trace_bytes = checked_mul(action_bound, transition_bytes, "output byte count")?;
    let candidate_output_bytes =
        request
            .candidates
            .iter()
            .try_fold(0_u64, |total, candidate| {
                let outcome_bytes = checked_add(
                    checked_add(
                        ROOT_PLAN_MATRIX_OUTPUT_BASE_BYTES_PER_OUTCOME,
                        identity_bytes,
                        "output byte count",
                    )?,
                    candidate.candidate_id.len() as u64,
                    "output byte count",
                )?;
                let outcome_bytes = checked_add(outcome_bytes, trace_bytes, "output byte count")?;
                checked_add(total, outcome_bytes, "output byte count")
            })?;
    let projected_output_bytes = checked_mul(
        request.samples.len() as u64,
        candidate_output_bytes,
        "output byte count",
    )?;

    Ok(RootPlanMatrixBatchProjection {
        requests: 1,
        operations,
        projected_transitions,
        projected_output_bytes,
    })
}

fn project_root_plan_matrix_batch(
    requests: &[RootPlanMatrixRequest],
) -> Result<RootPlanMatrixBatchProjection, String> {
    if requests.is_empty() {
        return Err("root-plan batch requires at least one request".to_owned());
    }
    let mut projection = RootPlanMatrixBatchProjection {
        requests: requests.len(),
        operations: 0,
        projected_transitions: 0,
        projected_output_bytes: ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES,
    };
    for request in requests {
        let request = request_projection(request)?;
        projection.operations = checked_add(
            projection.operations,
            request.operations,
            "batch operation count",
        )?;
        projection.projected_transitions = checked_add(
            projection.projected_transitions,
            request.projected_transitions,
            "batch transition count",
        )?;
        projection.projected_output_bytes = checked_add(
            projection.projected_output_bytes,
            request.projected_output_bytes,
            "batch output byte count",
        )?;
    }
    Ok(projection)
}

pub fn validate_root_plan_matrix_batch(
    requests: &[RootPlanMatrixRequest],
) -> Result<RootPlanMatrixBatchProjection, String> {
    let projection = project_root_plan_matrix_batch(requests)?;
    if projection.operations > ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS {
        return Err(format!(
            "root-plan batch operations {} exceed {}",
            projection.operations, ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS
        ));
    }
    if projection.projected_transitions > ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS {
        return Err(format!(
            "root-plan batch projected transitions {} exceed {}",
            projection.projected_transitions, ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS
        ));
    }
    if projection.projected_output_bytes > ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES {
        return Err(format!(
            "root-plan batch projected output bytes {} exceed {}",
            projection.projected_output_bytes, ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES
        ));
    }
    Ok(projection)
}

pub fn validate_root_plan_matrix_benchmark(
    requests: &[RootPlanMatrixRequest],
    repetitions: u64,
) -> Result<RootPlanMatrixBatchProjection, String> {
    if repetitions == 0 {
        return Err("root-plan benchmark repetitions must be positive".to_owned());
    }
    let per_repetition = project_root_plan_matrix_batch(requests)?;
    let operations = checked_mul(
        repetitions,
        per_repetition.operations,
        "benchmark operation count",
    )?;
    let projected_transitions = checked_mul(
        repetitions,
        per_repetition.projected_transitions,
        "benchmark transition count",
    )?;
    if operations > ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS {
        return Err(format!(
            "root-plan benchmark operations {operations} exceed {ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS}"
        ));
    }
    if projected_transitions > ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS {
        return Err(format!(
            "root-plan benchmark projected transitions {projected_transitions} exceed {ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS}"
        ));
    }
    Ok(RootPlanMatrixBatchProjection {
        requests: requests.len(),
        operations,
        projected_transitions,
        projected_output_bytes: ROOT_PLAN_MATRIX_OUTPUT_SUMMARY_BYTES,
    })
}

fn execute_root_plan_matrix_unchecked(
    request: &RootPlanMatrixRequest,
) -> Result<Vec<RootPlanMatrixOutcome>, String> {
    let capacity = request
        .candidates
        .len()
        .checked_mul(request.samples.len())
        .ok_or_else(|| "root-plan outcome capacity overflow".to_owned())?;
    let mut outcomes = Vec::with_capacity(capacity);
    for candidate in &request.candidates {
        for sample in &request.samples {
            let rollout = execute_rollout(&pair_rollout_case(request, candidate, *sample))?;
            outcomes.push(RootPlanMatrixOutcome {
                case_id: request.case_id.clone(),
                scenario_id: request.scenario_id.clone(),
                scenario_model_content_hash: request.scenario_model_content_hash.clone(),
                condition_profile_id: request.condition_profile_id.clone(),
                continuation_plan_id: request.continuation_plan_id.clone(),
                candidate: candidate.clone(),
                sample: *sample,
                rollout,
            });
        }
    }
    Ok(outcomes)
}

pub fn execute_root_plan_matrix(
    request: &RootPlanMatrixRequest,
) -> Result<Vec<RootPlanMatrixOutcome>, String> {
    validate_root_plan_matrix_batch(std::slice::from_ref(request))?;
    execute_root_plan_matrix_unchecked(request)
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

fn format_trace_step(step: &crate::RolloutTraceStep) -> String {
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

pub fn format_root_plan_matrix_outcome(
    outcome: &RootPlanMatrixOutcome,
    include_trace: bool,
) -> String {
    let result = &outcome.rollout;
    let mut cells = vec![
        ROOT_PLAN_MATRIX_PROTOCOL_VERSION.to_owned(),
        outcome.case_id.clone(),
        "outcome".to_owned(),
        "ok".to_owned(),
        outcome.scenario_id.clone(),
        SCENARIO_MODEL_IDENTITY_VERSION.to_owned(),
        outcome.scenario_model_content_hash.clone(),
        outcome.continuation_plan_id.clone(),
        outcome.condition_profile_id.clone(),
        outcome.candidate.ordinal.to_string(),
        outcome.candidate.candidate_id.clone(),
        outcome.candidate.root_action.to_string(),
        outcome.sample.sample_index.to_string(),
        outcome.sample.paired_seed.to_string(),
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
        result.steps.len().to_string(),
        result.final_cursor.condition_draws.to_string(),
        result.final_cursor.success_draws.to_string(),
    ];
    push_state(&mut cells, &result.final_state);
    cells.push(if include_trace && !result.steps.is_empty() {
        result
            .steps
            .iter()
            .map(format_trace_step)
            .collect::<Vec<_>>()
            .join(";")
    } else {
        "-".to_owned()
    });
    debug_assert_eq!(cells.len(), 45);
    cells.join("\t")
}

pub fn benchmark_root_plan_matrices(
    requests: &[RootPlanMatrixRequest],
    repetitions: u64,
) -> Result<RootPlanMatrixBenchmarkResult, String> {
    let projection = validate_root_plan_matrix_benchmark(requests, repetitions)?;
    let started = Instant::now();
    let mut transitions = 0_u64;
    let mut hash = FNV32_OFFSET_BASIS;
    for _ in 0..repetitions {
        for request in requests {
            for outcome in execute_root_plan_matrix_unchecked(request)? {
                transitions = transitions
                    .checked_add(outcome.rollout.steps.len() as u64)
                    .ok_or_else(|| "root-plan benchmark transition overflow".to_owned())?;
                hash = benchmark_hash_outcome(hash, &outcome);
            }
        }
    }
    Ok(RootPlanMatrixBenchmarkResult {
        repetitions,
        requests: requests.len(),
        operations: projection.operations,
        transitions,
        kernel_ns: started.elapsed().as_nanos(),
        hash,
    })
}
