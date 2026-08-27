use std::fmt;
use std::str::FromStr;
use std::time::Instant;

use crate::{
    CraftActionId, CraftState, CraftTerminal, EpisodeRandomStream, GenericDecision,
    GenericObjective, GenericSolverVersion, PlannerContext, PortfolioRecommendation,
    QualityUtilityKind, RandomDrawCursor, RiskPreference, RolloutCase, RolloutStopReason,
    RolloutTraceStep, TransitionResult, advance_planner_context, apply_observed_outcome,
    draw_simulated_action_outcome, legal_actions, parse_rollout_request,
    planner_context_fingerprint, preview_action, recommend_generic_action_with_model,
    recommend_route_portfolio,
};

pub const GENERIC_EPISODE_PROTOCOL_VERSION: &str = "native-generic-episode-batch-v7";
pub const GENERIC_EPISODE_ABI_VERSION: &str = "native-generic-closed-loop-abi-v7";
pub const GENERIC_EPISODE_MAX_CASES: usize = 10_000;
pub const GENERIC_EPISODE_MAX_PROJECTED_TRANSITIONS: u64 = 1_000_000;
pub const GENERIC_EPISODE_MAX_OUTPUT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GenericTraceMode {
    None,
    Full,
}

impl GenericTraceMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Full => "full",
        }
    }
}

impl FromStr for GenericTraceMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "none" => Ok(Self::None),
            "full" => Ok(Self::Full),
            _ => Err(format!("unknown generic trace mode: {value}")),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct GenericEpisodeCase {
    pub rollout: RolloutCase,
    pub solver_version: GenericSolverVersion,
    pub risk: RiskPreference,
    pub objective: GenericObjective,
    pub random_condition_mask: u16,
    pub trace_mode: GenericTraceMode,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenericEpisodeResult {
    pub case_id: String,
    pub solver_version: GenericSolverVersion,
    pub risk: RiskPreference,
    pub objective: GenericObjective,
    pub terminal: CraftTerminal,
    pub stop_reason: RolloutStopReason,
    pub actions: Vec<CraftActionId>,
    pub final_state: CraftState,
    pub final_cursor: RandomDrawCursor,
    pub planner_context: PlannerContext,
    pub recommendation_calls: u32,
    pub recommendation_ns: u128,
    pub recommendation_max_ns: u128,
    pub recommendation_durations_ns: Vec<u128>,
    pub steps: Vec<RolloutTraceStep>,
    pub trace_mode: GenericTraceMode,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenericEpisodeParseError {
    pub case_id: String,
    pub message: String,
}

fn terminal_stop_reason(terminal: CraftTerminal) -> Option<RolloutStopReason> {
    match terminal {
        CraftTerminal::None => None,
        CraftTerminal::Completed => Some(RolloutStopReason::Completed),
        CraftTerminal::Failed => Some(RolloutStopReason::Failed),
    }
}

pub fn parse_generic_episode_case(
    line: &str,
) -> Result<GenericEpisodeCase, GenericEpisodeParseError> {
    let cells = line
        .trim_end_matches(['\r', '\n'])
        .split('\t')
        .collect::<Vec<_>>();
    let case_id = cells.get(1).copied().unwrap_or("-").to_owned();
    let parse = || -> Result<GenericEpisodeCase, String> {
        if cells.len() < 17 {
            return Err("generic episode row is missing required fields".to_owned());
        }
        if cells[0] != GENERIC_EPISODE_PROTOCOL_VERSION {
            return Err(format!(
                "unsupported protocol version: expected {GENERIC_EPISODE_PROTOCOL_VERSION}, got {}",
                cells[0],
            ));
        }
        if case_id.is_empty() || case_id.contains(['\t', '\r', '\n']) {
            return Err("caseId must be a non-empty single TSV cell".to_owned());
        }
        if cells[2] != "episode" {
            return Err(format!("unknown generic episode command: {}", cells[2]));
        }
        let solver_version = cells[3].parse::<GenericSolverVersion>()?;
        let risk = cells[4].parse::<RiskPreference>()?;
        let quality_maximum = cells[5]
            .parse::<i32>()
            .map_err(|error| format!("invalid qualityMaximum: {error}"))?;
        let protected_quality_floor = cells[6]
            .parse::<i32>()
            .map_err(|error| format!("invalid protectedQualityFloor: {error}"))?;
        if quality_maximum <= 0 {
            return Err("qualityMaximum must be positive".to_owned());
        }
        if !(0..=quality_maximum).contains(&protected_quality_floor) {
            return Err("protectedQualityFloor must be between zero and qualityMaximum".to_owned());
        }
        let adaptive_completion = match cells[7] {
            "0" => false,
            "1" => true,
            value => return Err(format!("invalid adaptiveCompletion: {value}")),
        };
        let quality_utility_kind = cells[8].parse::<QualityUtilityKind>()?;
        let quality_milestone_count = cells[9]
            .parse::<u8>()
            .map_err(|error| format!("invalid qualityMilestoneCount: {error}"))?;
        if quality_milestone_count == 0 || quality_milestone_count > 4 {
            return Err("qualityMilestoneCount must be between one and four".to_owned());
        }
        let mut quality_milestones = [0_i32; 4];
        for (index, milestone) in quality_milestones.iter_mut().enumerate() {
            *milestone = cells[10 + index]
                .parse::<i32>()
                .map_err(|error| format!("invalid qualityMilestone{index}: {error}"))?;
        }
        let active_milestones = &quality_milestones[..usize::from(quality_milestone_count)];
        if active_milestones
            .iter()
            .any(|milestone| *milestone <= 0 || *milestone > quality_maximum)
            || active_milestones.windows(2).any(|pair| pair[0] >= pair[1])
            || quality_milestones[usize::from(quality_milestone_count)..]
                .iter()
                .any(|milestone| *milestone != 0)
        {
            return Err(
                "quality milestones must be increasing active values followed by zero padding"
                    .to_owned(),
            );
        }
        if active_milestones.last().copied() != Some(quality_maximum) {
            return Err("the last quality milestone must equal qualityMaximum".to_owned());
        }
        match quality_utility_kind {
            QualityUtilityKind::CollectabilityTiers => {
                if quality_milestone_count != 4
                    || !active_milestones.contains(&protected_quality_floor)
                {
                    return Err(
                        "collectability tiers require four milestones and a milestone protected floor"
                            .to_owned(),
                    );
                }
            }
            QualityUtilityKind::HqChance => {
                let expected = [
                    (quality_maximum * 76 + 99) / 100,
                    (quality_maximum * 82 + 99) / 100,
                    quality_maximum,
                ];
                if quality_milestone_count != 3
                    || active_milestones != expected
                    || !active_milestones.contains(&protected_quality_floor)
                {
                    return Err(
                        "HQ chance requires the 50/75/100 percent milestones and a milestone protected floor"
                            .to_owned(),
                    );
                }
            }
            QualityUtilityKind::HardQualityMaximum => {
                if active_milestones != [quality_maximum]
                    || protected_quality_floor != quality_maximum
                {
                    return Err(
                        "hard quality requires qualityMaximum as its only milestone and protected floor"
                            .to_owned(),
                    );
                }
            }
            QualityUtilityKind::ContinuousCollectability => {
                if active_milestones != [quality_maximum] {
                    return Err(
                        "continuous collectability requires qualityMaximum as its only milestone"
                            .to_owned(),
                    );
                }
            }
        }
        let random_condition_mask = cells[14]
            .parse::<u16>()
            .map_err(|error| format!("invalid randomConditionMask: {error}"))?;
        let supported_condition_mask = (1_u16 << crate::MATERIAL_CONDITION_COUNT) - 1;
        if random_condition_mask == 0
            || random_condition_mask & !supported_condition_mask != 0
            || random_condition_mask & 1 == 0
        {
            return Err(
                "randomConditionMask must contain Normal and only supported conditions".to_owned(),
            );
        }
        let trace_mode = cells[15].parse::<GenericTraceMode>()?;

        let mut rollout_cells = vec![crate::ROLLOUT_BATCH_PROTOCOL_VERSION, cells[1], "rollout"];
        rollout_cells.extend_from_slice(&cells[16..]);
        rollout_cells.push("basicSynthesis");
        let rollout_line = rollout_cells.join("\t");
        let rollout = parse_rollout_request(&rollout_line)
            .map_err(|error| error.message)?
            .case;
        if quality_maximum != rollout.recipe.quality_max {
            return Err("qualityMaximum must equal recipe qualityMax".to_owned());
        }
        Ok(GenericEpisodeCase {
            rollout,
            solver_version,
            risk,
            objective: GenericObjective {
                quality_maximum,
                protected_quality_floor,
                adaptive_completion,
                quality_utility_kind,
                quality_milestone_count,
                quality_milestones,
            },
            random_condition_mask,
            trace_mode,
        })
    }();
    parse.map_err(|message| GenericEpisodeParseError { case_id, message })
}

pub fn validate_generic_episode_batch(cases: &[GenericEpisodeCase]) -> Result<(), String> {
    if cases.is_empty() {
        return Err("generic episode batch must contain at least one case".to_owned());
    }
    if cases.len() > GENERIC_EPISODE_MAX_CASES {
        return Err(format!(
            "generic episode case count {} exceeds {}",
            cases.len(),
            GENERIC_EPISODE_MAX_CASES,
        ));
    }
    let projected_transitions = cases.iter().try_fold(0_u64, |total, case| {
        total
            .checked_add(u64::from(case.rollout.max_steps))
            .ok_or_else(|| "generic episode projected transition count overflow".to_owned())
    })?;
    if projected_transitions > GENERIC_EPISODE_MAX_PROJECTED_TRANSITIONS {
        return Err(format!(
            "generic episode projected transitions {projected_transitions} exceed {GENERIC_EPISODE_MAX_PROJECTED_TRANSITIONS}",
        ));
    }
    Ok(())
}

pub fn execute_generic_episode(case: &GenericEpisodeCase) -> Result<GenericEpisodeResult, String> {
    execute_generic_episode_with_observer(case, |_, _, _, _, _| {})
}

/// The observer receives read-only pre-action state after planning, before the
/// episode draws an actual outcome. Diagnostics reuse the ordinary decision.
pub fn execute_generic_episode_with_observer<F>(
    case: &GenericEpisodeCase,
    mut observer: F,
) -> Result<GenericEpisodeResult, String>
where
    F: FnMut(
        &CraftState,
        &PlannerContext,
        Option<GenericDecision>,
        Option<&PortfolioRecommendation>,
        u128,
    ),
{
    validate_generic_episode_batch(std::slice::from_ref(case))?;
    let rollout = &case.rollout;
    let mut random = EpisodeRandomStream::new(rollout.seed);
    random.advance_condition_draws(rollout.initial_cursor.condition_draws);
    random.advance_success_draws(rollout.initial_cursor.success_draws);
    let mut cursor = rollout.initial_cursor;
    let mut state = rollout.initial_state.clone();
    let mut context = PlannerContext {
        action_limit: rollout.max_steps,
        ..PlannerContext::default()
    };
    let mut actions = Vec::with_capacity(rollout.max_steps as usize);
    let mut steps = Vec::with_capacity(rollout.max_steps as usize);
    let mut stop_reason = terminal_stop_reason(state.terminal);
    let mut recommendation_calls = 0_u32;
    let mut recommendation_ns = 0_u128;
    let mut recommendation_max_ns = 0_u128;
    let mut recommendation_durations_ns = Vec::new();

    while stop_reason.is_none() && actions.len() < rollout.max_steps as usize {
        let started = Instant::now();
        let portfolio =
            (case.solver_version == GenericSolverVersion::RoutePortfolioV1).then(|| {
                recommend_route_portfolio(
                    &rollout.recipe,
                    &rollout.crafter,
                    &state,
                    case.objective,
                    case.risk,
                    &context,
                    Some(case.random_condition_mask),
                    Some(&rollout.condition_transition_weights),
                )
            });
        let decision = if let Some(report) = &portfolio {
            report.decision
        } else {
            recommend_generic_action_with_model(
                case.solver_version,
                &rollout.recipe,
                &rollout.crafter,
                &state,
                case.objective,
                case.risk,
                &context,
                Some(case.random_condition_mask),
                Some(&rollout.condition_transition_weights),
            )
        };
        let elapsed = started.elapsed().as_nanos();
        observer(&state, &context, decision, portfolio.as_ref(), elapsed);
        recommendation_calls = recommendation_calls.saturating_add(1);
        recommendation_ns = recommendation_ns.saturating_add(elapsed);
        recommendation_max_ns = recommendation_max_ns.max(elapsed);
        recommendation_durations_ns.push(elapsed);

        let Some(decision) = decision else {
            stop_reason = Some(
                if legal_actions(&rollout.recipe, &rollout.crafter, &state).is_empty() {
                    RolloutStopReason::NoLegalAction
                } else {
                    RolloutStopReason::PolicyNull
                },
            );
            break;
        };
        let preview = preview_action(&rollout.recipe, &rollout.crafter, &state, decision.action);
        if !preview.legal {
            stop_reason = Some(RolloutStopReason::IllegalAction);
            break;
        }
        let before_state = state.clone();
        let condition_weights = &rollout.condition_transition_weights[state.condition.index()];
        let simulated =
            draw_simulated_action_outcome(&preview, &state, condition_weights, &mut random, cursor);
        let TransitionResult {
            next_state,
            explanation_codes,
        } = apply_observed_outcome(
            &rollout.recipe,
            &rollout.crafter,
            &state,
            decision.action,
            simulated.observed,
        )
        .map_err(|error| error.to_string())?;

        cursor = simulated.cursor_after;
        state = next_state;
        advance_planner_context(
            &mut context,
            case.solver_version,
            decision,
            &before_state,
            &state,
        );
        actions.push(decision.action);
        if case.trace_mode == GenericTraceMode::Full {
            steps.push(RolloutTraceStep {
                before_state,
                action: decision.action,
                success: simulated.observed.success,
                next_condition: simulated.observed.next_condition,
                after_state: state.clone(),
                cursor_before: simulated.cursor_before,
                cursor_after: simulated.cursor_after,
                explanation_codes,
            });
        }
        stop_reason = terminal_stop_reason(state.terminal);
        if stop_reason.is_none() && actions.len() >= rollout.max_steps as usize {
            stop_reason = Some(RolloutStopReason::ActionLimit);
        }
    }

    let stop_reason = stop_reason.unwrap_or_else(|| {
        terminal_stop_reason(state.terminal).unwrap_or_else(|| {
            if actions.len() >= rollout.max_steps as usize {
                RolloutStopReason::ActionLimit
            } else if legal_actions(&rollout.recipe, &rollout.crafter, &state).is_empty() {
                RolloutStopReason::NoLegalAction
            } else {
                RolloutStopReason::PolicyNull
            }
        })
    });
    Ok(GenericEpisodeResult {
        case_id: rollout.case_id.clone(),
        solver_version: case.solver_version,
        risk: case.risk,
        objective: case.objective,
        terminal: state.terminal,
        stop_reason,
        actions,
        final_state: state,
        final_cursor: cursor,
        planner_context: context,
        recommendation_calls,
        recommendation_ns,
        recommendation_max_ns,
        recommendation_durations_ns,
        steps,
        trace_mode: case.trace_mode,
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
    cells.join("|")
}

pub fn format_generic_episode_result(result: &GenericEpisodeResult) -> String {
    let mut cells = vec![
        GENERIC_EPISODE_PROTOCOL_VERSION.to_owned(),
        result.case_id.clone(),
        "episode".to_owned(),
        "ok".to_owned(),
        result.solver_version.to_string(),
        result.risk.to_string(),
        result.objective.quality_maximum.to_string(),
        result.objective.protected_quality_floor.to_string(),
        if result.objective.adaptive_completion {
            "1"
        } else {
            "0"
        }
        .to_owned(),
        result.objective.quality_utility_kind.as_str().to_owned(),
        result.objective.quality_milestone_count.to_string(),
        result.objective.quality_milestones[0].to_string(),
        result.objective.quality_milestones[1].to_string(),
        result.objective.quality_milestones[2].to_string(),
        result.objective.quality_milestones[3].to_string(),
        result.terminal.to_string(),
        result.stop_reason.to_string(),
        result.actions.len().to_string(),
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
        result.final_cursor.condition_draws.to_string(),
        result.final_cursor.success_draws.to_string(),
        result.recommendation_calls.to_string(),
        result.recommendation_ns.to_string(),
        result.recommendation_max_ns.to_string(),
        planner_context_fingerprint(result.solver_version, &result.planner_context),
    ];
    push_state(&mut cells, &result.final_state);
    cells.push(
        if result.trace_mode == GenericTraceMode::Full && !result.steps.is_empty() {
            result
                .steps
                .iter()
                .map(format_trace_step)
                .collect::<Vec<_>>()
                .join(";")
        } else {
            "-".to_owned()
        },
    );
    cells.push(if result.recommendation_durations_ns.is_empty() {
        "-".to_owned()
    } else {
        result
            .recommendation_durations_ns
            .iter()
            .map(u128::to_string)
            .collect::<Vec<_>>()
            .join(",")
    });
    cells.join("\t")
}

pub fn format_generic_episode_error(case_id: &str, message: &str) -> String {
    [
        GENERIC_EPISODE_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        "episode".to_owned(),
        "error".to_owned(),
        message.replace(['\t', '\r', '\n'], " "),
    ]
    .join("\t")
}

pub fn generic_episode_rows_fnv1a64(rows: &[String]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;
    let mut hash = OFFSET;
    for row in rows {
        for byte in row.as_bytes().iter().chain(std::iter::once(&b'\n')) {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(PRIME);
        }
    }
    hash
}

pub fn generic_episode_build_profile() -> &'static str {
    if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    }
}

pub fn generic_episode_target() -> &'static str {
    option_env!("FROZEN_RABBIT_RUST_TARGET").unwrap_or("unknown-target")
}

pub fn generic_episode_rustc() -> &'static str {
    option_env!("FROZEN_RABBIT_RUSTC_VERSION").unwrap_or("unknown-rustc")
}

impl fmt::Display for GenericEpisodeParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
