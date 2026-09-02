//! Stable, dependency-free export seam for route-aware teacher data.
//!
//! Rows deliberately omit case, recipe, family, equipment, and seed identity.
//! Corpus manifests may retain those values for grouped evaluation, but a
//! runtime ranker must only consume mechanics and observed-state features.

use crate::{
    BranchEvidence, CandidateEvidence, CandidateSource, CompletionEvidence,
    ConditionAssignmentEvidence, ConditionWork, ContinuationEngine, CraftActionId, CraftState,
    CrafterProfile, GenericDecision, GenericEpisodeCase, GenericEpisodeResult, PlannerContext,
    PortfolioRecommendation, PortfolioWork, RecipeProfile, RouteIntent, RoutePlan,
    execute_generic_episode_with_observer, planner_context_fingerprint,
};

pub const CANDIDATE_DATASET_SCHEMA_VERSION: &str = "rust-route-candidate-dataset-v3";
pub const CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION: &str =
    "native-route-candidate-dataset-export-v3";
pub const CANDIDATE_DATASET_MAX_OUTPUT_BYTES: usize = 256 * 1024 * 1024;

pub const CANDIDATE_DATASET_DECISION_COLUMNS: &[&str] = &[
    "schema",
    "row_kind",
    "example_ordinal",
    "decision_ordinal",
    "solver_version",
    "risk",
    "objective",
    "recipe_mechanics",
    "crafter_mechanics",
    "random_condition_mask",
    "state",
    "context_fingerprint",
    "context",
    "selected_candidate_index",
    "selected_action",
    "selected_option",
    "selected_persona",
    "selected_route",
    "candidate_count",
    "work",
];

pub const CANDIDATE_DATASET_CANDIDATE_COLUMNS: &[&str] = &[
    "schema",
    "row_kind",
    "example_ordinal",
    "decision_ordinal",
    "candidate_index",
    "selected",
    "screened_out",
    "action",
    "option",
    "persona",
    "route",
    "sources",
    "continuation_actions",
    "preview_legal",
    "preview_reason",
    "preview_cp_cost",
    "preview_durability_cost",
    "preview_success_rate",
    "preview_progress_gain",
    "preview_quality_gain",
    "success_branch",
    "failure_branch",
    "completion_probability",
    "delivered_quality_utility",
    "unfinished_potential",
    "expected_actions",
    "forecast_samples",
    "forecast_horizon",
    "score",
    "sample_values",
    "selection_score",
    "condition_assignment",
];

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateDatasetDecisionRecord {
    pub decision_ordinal: u32,
    pub selected_candidate_index: Option<usize>,
    pub decision_row: String,
    pub candidate_rows: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateDatasetExport {
    pub episode: GenericEpisodeResult,
    pub decisions: Vec<CandidateDatasetDecisionRecord>,
}

impl CandidateDatasetExport {
    pub fn rows(&self) -> Vec<String> {
        let mut rows = Vec::with_capacity(
            self.decisions.len()
                + self
                    .decisions
                    .iter()
                    .map(|record| record.candidate_rows.len())
                    .sum::<usize>(),
        );
        for record in &self.decisions {
            rows.push(record.decision_row.clone());
            rows.extend(record.candidate_rows.iter().cloned());
        }
        rows
    }

    pub fn content_fnv1a64(&self) -> u64 {
        candidate_dataset_rows_fnv1a64(&self.rows())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CandidateDatasetRow {
    Decision(Vec<String>),
    Candidate(Vec<String>),
}

impl CandidateDatasetRow {
    pub fn format(&self) -> String {
        match self {
            Self::Decision(cells) | Self::Candidate(cells) => cells.join("\t"),
        }
    }
}

pub fn candidate_dataset_decision_header() -> String {
    CANDIDATE_DATASET_DECISION_COLUMNS.join("\t")
}

pub fn candidate_dataset_candidate_header() -> String {
    CANDIDATE_DATASET_CANDIDATE_COLUMNS.join("\t")
}

pub fn parse_candidate_dataset_row(row: &str) -> Result<CandidateDatasetRow, String> {
    if row.contains(['\r', '\n']) {
        return Err("candidate dataset row must not contain a line break".to_owned());
    }
    let cells = row.split('\t').map(str::to_owned).collect::<Vec<_>>();
    if cells.first().map(String::as_str) != Some(CANDIDATE_DATASET_SCHEMA_VERSION) {
        return Err("candidate dataset schema identity mismatch".to_owned());
    }
    let (expected, parsed) = match cells.get(1).map(String::as_str) {
        Some("decision") => (
            CANDIDATE_DATASET_DECISION_COLUMNS.len(),
            CandidateDatasetRow::Decision(cells.clone()),
        ),
        Some("candidate") => (
            CANDIDATE_DATASET_CANDIDATE_COLUMNS.len(),
            CandidateDatasetRow::Candidate(cells.clone()),
        ),
        _ => return Err("unknown candidate dataset row kind".to_owned()),
    };
    if cells.len() != expected {
        return Err(format!(
            "candidate dataset {} row has {} cells; expected {expected}",
            cells[1],
            cells.len()
        ));
    }
    cells[2]
        .parse::<u32>()
        .map_err(|_| "invalid candidate dataset example ordinal".to_owned())?;
    cells[3]
        .parse::<u32>()
        .map_err(|_| "invalid candidate dataset decision ordinal".to_owned())?;
    if cells[1] == "candidate" {
        cells[4]
            .parse::<usize>()
            .map_err(|_| "invalid candidate dataset candidate index".to_owned())?;
        for index in [5, 6, 13] {
            if !matches!(cells[index].as_str(), "0" | "1") {
                return Err(format!("candidate dataset cell {index} must be 0 or 1"));
            }
        }
    }
    Ok(parsed)
}

pub fn execute_candidate_dataset_episode(
    case: &GenericEpisodeCase,
) -> Result<CandidateDatasetExport, String> {
    execute_candidate_dataset_episode_with_ordinal(case, 0)
}

pub fn execute_candidate_dataset_episode_with_ordinal(
    case: &GenericEpisodeCase,
    example_ordinal: u32,
) -> Result<CandidateDatasetExport, String> {
    if !case.solver_version.is_route_portfolio() {
        return Err(format!(
            "candidate dataset requires a route-portfolio solver; got {}",
            case.solver_version
        ));
    }
    let mut decisions = Vec::new();
    let mut capture_error = None;
    let mut decision_ordinal = 0_u32;
    let episode = execute_generic_episode_with_observer(
        case,
        |state, context, decision, portfolio, _elapsed_ns| {
            if capture_error.is_none() {
                capture_error = match portfolio {
                    Some(portfolio) => format_decision_record(
                        case,
                        example_ordinal,
                        decision_ordinal,
                        state,
                        context,
                        decision,
                        portfolio,
                    )
                    .map(|record| decisions.push(record))
                    .err(),
                    None => Some(
                        "route-portfolio observer did not receive candidate evidence".to_owned(),
                    ),
                };
            }
            decision_ordinal = decision_ordinal.saturating_add(1);
        },
    )?;
    if let Some(error) = capture_error {
        return Err(error);
    }
    if decisions.len() != episode.recommendation_calls as usize {
        return Err(format!(
            "captured {} decisions for {} recommendation calls",
            decisions.len(),
            episode.recommendation_calls
        ));
    }
    Ok(CandidateDatasetExport { episode, decisions })
}

fn format_decision_record(
    case: &GenericEpisodeCase,
    example_ordinal: u32,
    decision_ordinal: u32,
    state: &CraftState,
    context: &PlannerContext,
    decision: Option<GenericDecision>,
    portfolio: &PortfolioRecommendation,
) -> Result<CandidateDatasetDecisionRecord, String> {
    if decision != portfolio.decision {
        return Err("observer decision does not match portfolio decision".to_owned());
    }
    match (portfolio.selected_candidate_index, portfolio.decision) {
        (Some(index), Some(selected)) => {
            let candidate = portfolio
                .candidates
                .get(index)
                .ok_or_else(|| "selected candidate index is out of range".to_owned())?;
            if candidate.screened_out || candidate.proposal.decision != selected {
                return Err("selected candidate identity is inconsistent".to_owned());
            }
        }
        (None, None) => {}
        _ => return Err("selected candidate index and decision disagree".to_owned()),
    }

    let selected_index = portfolio.selected_candidate_index;
    let mut candidate_rows = Vec::with_capacity(portfolio.candidates.len());
    for (index, candidate) in portfolio.candidates.iter().enumerate() {
        candidate_rows.push(format_candidate_row(
            example_ordinal,
            decision_ordinal,
            index,
            selected_index == Some(index),
            candidate,
        )?);
    }

    let selected = portfolio.decision;
    let cells = vec![
        CANDIDATE_DATASET_SCHEMA_VERSION.to_owned(),
        "decision".to_owned(),
        example_ordinal.to_string(),
        decision_ordinal.to_string(),
        case.solver_version.to_string(),
        case.risk.to_string(),
        format_objective(case),
        format_recipe(&case.rollout.recipe),
        format_crafter(&case.rollout.crafter),
        case.random_condition_mask.to_string(),
        format_state(state),
        planner_context_fingerprint(case.solver_version, context),
        format_context(context),
        option_usize(selected_index),
        selected.map_or_else(|| "-".to_owned(), |value| value.action.as_str().to_owned()),
        selected.map_or_else(|| "-".to_owned(), |value| value.option.as_str().to_owned()),
        selected.map_or_else(|| "-".to_owned(), |value| value.persona.as_str().to_owned()),
        selected
            .and_then(|value| value.route)
            .map_or_else(|| "-".to_owned(), |route| format_route(&route)),
        portfolio.candidates.len().to_string(),
        format_work(&portfolio.work),
    ];
    debug_assert_eq!(cells.len(), CANDIDATE_DATASET_DECISION_COLUMNS.len());
    let decision_row = cells.join("\t");
    parse_candidate_dataset_row(&decision_row)?;
    for row in &candidate_rows {
        parse_candidate_dataset_row(row)?;
    }
    Ok(CandidateDatasetDecisionRecord {
        decision_ordinal,
        selected_candidate_index: selected_index,
        decision_row,
        candidate_rows,
    })
}

fn format_candidate_row(
    example_ordinal: u32,
    decision_ordinal: u32,
    candidate_index: usize,
    selected: bool,
    candidate: &CandidateEvidence,
) -> Result<String, String> {
    let preview = &candidate.preview;
    let cells = vec![
        CANDIDATE_DATASET_SCHEMA_VERSION.to_owned(),
        "candidate".to_owned(),
        example_ordinal.to_string(),
        decision_ordinal.to_string(),
        candidate_index.to_string(),
        bool_cell(selected),
        bool_cell(candidate.screened_out),
        candidate.proposal.decision.action.as_str().to_owned(),
        candidate.proposal.decision.option.as_str().to_owned(),
        candidate.proposal.decision.persona.as_str().to_owned(),
        candidate
            .proposal
            .decision
            .route
            .map_or_else(|| "-".to_owned(), |route| format_route(&route)),
        candidate
            .proposal
            .sources
            .iter()
            .map(|source| candidate_source_name(*source))
            .collect::<Vec<_>>()
            .join(","),
        action_list(&candidate.proposal.continuation_actions),
        bool_cell(preview.legal),
        preview
            .reason
            .map_or_else(|| "-".to_owned(), |reason| reason.as_str().to_owned()),
        preview.cp_cost.to_string(),
        preview.durability_cost.to_string(),
        finite_cell(preview.success_rate, "preview success rate")?,
        preview.progress_gain.to_string(),
        preview.quality_gain.to_string(),
        format_branch(&candidate.success)?,
        candidate
            .failure
            .as_ref()
            .map(format_branch)
            .transpose()?
            .unwrap_or_else(|| "-".to_owned()),
        finite_cell(
            candidate.completion_probability,
            "candidate completion probability",
        )?,
        finite_cell(
            candidate.delivered_quality_utility,
            "candidate delivered quality utility",
        )?,
        finite_cell(
            candidate.unfinished_potential,
            "candidate unfinished potential",
        )?,
        finite_cell(candidate.expected_actions, "candidate expected actions")?,
        candidate.forecast_samples.to_string(),
        candidate.forecast_horizon.to_string(),
        finite_cell(candidate.score, "candidate score")?,
        candidate
            .sample_values
            .iter()
            .map(|value| finite_cell(*value, "candidate sample value"))
            .collect::<Result<Vec<_>, _>>()?
            .join(","),
        finite_cell(candidate.selection_score, "candidate selection score")?,
        candidate
            .condition_assignment
            .as_ref()
            .map_or_else(|| "-".to_owned(), format_condition_assignment),
    ];
    debug_assert_eq!(cells.len(), CANDIDATE_DATASET_CANDIDATE_COLUMNS.len());
    Ok(cells.join("\t"))
}

fn format_objective(case: &GenericEpisodeCase) -> String {
    let objective = case.objective;
    [
        objective.quality_maximum.to_string(),
        objective.protected_quality_floor.to_string(),
        bool_cell(objective.adaptive_completion),
        objective.quality_utility_kind.as_str().to_owned(),
        objective.quality_milestone_count.to_string(),
        objective.quality_milestones[0].to_string(),
        objective.quality_milestones[1].to_string(),
        objective.quality_milestones[2].to_string(),
        objective.quality_milestones[3].to_string(),
    ]
    .join(",")
}

fn format_recipe(recipe: &RecipeProfile) -> String {
    [
        recipe.recipe_level.to_string(),
        recipe.progress_required.to_string(),
        recipe.quality_max.to_string(),
        recipe.required_quality.to_string(),
        recipe.durability_max.to_string(),
        recipe.progress_divider.to_string(),
        recipe.quality_divider.to_string(),
        recipe.progress_modifier.to_string(),
        recipe.quality_modifier.to_string(),
    ]
    .join(",")
}

fn format_crafter(crafter: &CrafterProfile) -> String {
    [
        crafter.level.to_string(),
        crafter.craftsmanship.to_string(),
        crafter.control.to_string(),
        crafter.max_cp.to_string(),
        bool_cell(crafter.cosmic_tool_good_bonus),
        bool_cell(crafter.specialist),
    ]
    .join(",")
}

fn format_state(state: &CraftState) -> String {
    [
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
        option_action(state.combo_from),
        bool_cell(state.trained_perfection_available),
        bool_cell(state.trained_perfection_active),
        state.careful_observation_uses_left.to_string(),
        bool_cell(state.heart_and_soul_available),
        bool_cell(state.heart_and_soul_active),
        bool_cell(state.quick_innovation_available),
        state.terminal.as_str().to_owned(),
        state
            .failure_reason
            .map_or_else(|| "-".to_owned(), |reason| reason.as_str().to_owned()),
    ]
    .join(",")
}

fn format_context(context: &PlannerContext) -> String {
    let memory = &context.route_memory;
    [
        memory
            .active
            .as_ref()
            .map_or_else(|| "-".to_owned(), format_route),
        memory
            .suspended
            .as_ref()
            .map_or_else(|| "-".to_owned(), format_route),
        memory
            .state_signature
            .map_or_else(|| "-".to_owned(), |value| format!("{value:016x}")),
        memory.switches.to_string(),
        memory.interrupts.to_string(),
        memory.resumes.to_string(),
        memory.consumers_used.to_string(),
        memory.rebuilds.to_string(),
        context.active_option.as_str().to_owned(),
        context.option_steps.to_string(),
        context.observed_transitions.to_string(),
        context.manipulation_uses.to_string(),
        context.waste_not_uses.to_string(),
        context.innovation_uses.to_string(),
        context.great_strides_uses.to_string(),
        context.cashout_cycles.to_string(),
        context.action_uses.to_string(),
        context.last_quality_action_use.to_string(),
        context.last_precise_touch_action_use.to_string(),
        context.reliable_quality_first_route_index.to_string(),
        context.active_persona.as_str().to_owned(),
        context
            .resume_persona
            .map_or_else(|| "-".to_owned(), |value| value.as_str().to_owned()),
        context
            .resume_option
            .map_or_else(|| "-".to_owned(), |value| value.as_str().to_owned()),
        bool_cell(context.fishing_used),
        context.fishing_rolls_remaining.to_string(),
        bool_cell(context.shared_continuation_used),
        context.action_limit.to_string(),
        context.risk_attempts.to_string(),
        context.progress_risk_attempts.to_string(),
        context.quality_risk_attempts.to_string(),
        context.risk_failures.to_string(),
        context.consecutive_risk_failures.to_string(),
        option_action(context.last_action),
    ]
    .join(",")
}

fn format_route(route: &RoutePlan) -> String {
    [
        route_intent_name(route.intent).to_owned(),
        continuation_engine_name(route.engine).to_owned(),
        option_action(route.setup),
        option_action(route.consumer),
        bool_cell(route.interrupt),
    ]
    .join(":")
}

fn format_branch(branch: &BranchEvidence) -> Result<String, String> {
    Ok([
        finite_cell(branch.probability, "branch probability")?,
        format_completion(branch.completion),
        format_state(&branch.reference_state),
    ]
    .join("~"))
}

fn format_completion(completion: CompletionEvidence) -> String {
    match completion {
        CompletionEvidence::Completed => "completed".to_owned(),
        CompletionEvidence::NormalRoute(action) => {
            format!("normal-route:{}", action.as_str())
        }
        CompletionEvidence::TerminalFailure => "terminal-failure".to_owned(),
        CompletionEvidence::Unknown => "unknown".to_owned(),
    }
}

fn format_work(work: &PortfolioWork) -> String {
    [
        work.analytic_terminal_folds,
        work.quality_bound_checks,
        work.quality_bound_prunes,
        work.progress_bound_checks,
        work.progress_bound_prunes,
        work.robust_suffix_checks,
        work.robust_suffix_certificates,
        work.robust_suffix_transitions,
        work.semantic_query_lookups,
        work.semantic_query_hits,
        work.endgame_transitions,
        work.forecast_cache_hits,
        work.completion_cache_hits,
        work.proposals,
        work.distinct_actions,
        work.producer_calls,
        work.continuation_calls,
        work.continuation_cache_hits,
        work.projected_transitions,
    ]
    .map(|value| value.to_string())
    .join(",")
}

pub fn candidate_dataset_rows_fnv1a64(rows: &[String]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for row in rows {
        for byte in row.as_bytes().iter().chain(std::iter::once(&b'\n')) {
            hash = (hash ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    hash
}

fn finite_cell(value: f64, name: &str) -> Result<String, String> {
    if value.is_finite() {
        Ok(value.to_string())
    } else {
        Err(format!("{name} must be finite"))
    }
}

fn bool_cell(value: bool) -> String {
    if value { "1" } else { "0" }.to_owned()
}

fn option_usize(value: Option<usize>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| value.to_string())
}

fn option_action(value: Option<CraftActionId>) -> String {
    value.map_or_else(|| "-".to_owned(), |action| action.as_str().to_owned())
}

fn action_list(actions: &[CraftActionId]) -> String {
    if actions.is_empty() {
        "-".to_owned()
    } else {
        actions
            .iter()
            .map(|action| action.as_str())
            .collect::<Vec<_>>()
            .join(",")
    }
}

fn route_intent_name(intent: RouteIntent) -> &'static str {
    match intent {
        RouteIntent::ProgressSetup => "progress-setup",
        RouteIntent::ProgressBuild => "progress-build",
        RouteIntent::QualityBuild => "quality-build",
        RouteIntent::HybridWork => "hybrid-work",
        RouteIntent::BurstSetup => "burst-setup",
        RouteIntent::Burst => "burst",
        RouteIntent::Finish => "finish",
        RouteIntent::Recovery => "recovery",
    }
}

fn condition_work_name(work: ConditionWork) -> &'static str {
    match work {
        ConditionWork::ReliableProgress => "reliable-progress",
        ConditionWork::RiskyProgress => "risky-progress",
        ConditionWork::ReliableQuality => "reliable-quality",
        ConditionWork::RiskyQuality => "risky-quality",
        ConditionWork::Hybrid => "hybrid",
        ConditionWork::ProgressSetup => "progress-setup",
        ConditionWork::QualitySetup => "quality-setup",
        ConditionWork::Resource => "resource",
    }
}

fn format_condition_assignment(value: &ConditionAssignmentEvidence) -> String {
    [
        value.work.map_or_else(
            || "-".to_owned(),
            |work| condition_work_name(work).to_owned(),
        ),
        value.current_condition.as_str().to_owned(),
        value.capture.to_string(),
        value
            .reserved_condition
            .map_or_else(|| "-".to_owned(), |condition| condition.as_str().to_owned()),
        value.reservation.to_string(),
        value.alignment.to_string(),
    ]
    .join(":")
}

fn continuation_engine_name(engine: ContinuationEngine) -> &'static str {
    match engine {
        ContinuationEngine::Semantic => "semantic",
        ContinuationEngine::Budgeted => "budgeted",
    }
}

fn candidate_source_name(source: CandidateSource) -> &'static str {
    match source {
        CandidateSource::Semantic => "semantic",
        CandidateSource::Budgeted => "budgeted",
        CandidateSource::Route => "route",
        CandidateSource::Progress => "progress",
        CandidateSource::Quality => "quality",
        CandidateSource::Condition => "condition",
        CandidateSource::Resource => "resource",
        CandidateSource::Specialist => "specialist",
        CandidateSource::BestEffort => "best-effort",
        CandidateSource::Endgame => "endgame",
        CandidateSource::Opening => "opening",
        CandidateSource::CertifiedEndgame => "certified-endgame",
    }
}
