//! Bounded comparison of ordinary and higher-budget portfolio preferences.
//!
//! The episode continues with the ordinary solver. Teacher recommendations are
//! read-only counterfactuals at the same observed states, so this is a label
//! stability probe rather than closed-loop teacher outcome evidence.

use crate::{
    CraftActionId, GenericEpisodeCase, GenericEpisodeResult, PortfolioEvaluationBudget,
    PortfolioRecommendation, execute_generic_episode_with_observer,
    recommend_portfolio_with_evaluation_budget,
};

pub const CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION: &str =
    "native-route-candidate-teacher-probe-v1";
pub const CANDIDATE_TEACHER_PROBE_COLUMNS: &[&str] = &[
    "protocol",
    "row_kind",
    "example_ordinal",
    "decision_ordinal",
    "condition",
    "candidate_count",
    "baseline_index",
    "baseline_action",
    "low_index",
    "low_action",
    "high_index",
    "high_action",
    "low_high_candidate_agree",
    "low_high_action_agree",
    "baseline_high_candidate_agree",
    "baseline_high_action_agree",
    "low_selection_score",
    "high_selection_score",
    "low_score_for_high_candidate",
    "high_score_for_low_candidate",
    "low_cross_margin",
    "high_cross_margin",
    "low_pair_standard_error",
    "high_pair_standard_error",
    "low_projected_transitions",
    "high_projected_transitions",
];

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateTeacherPreferenceRecord {
    pub example_ordinal: u32,
    pub decision_ordinal: u32,
    pub condition: crate::MaterialCondition,
    pub candidate_count: usize,
    pub baseline_index: Option<usize>,
    pub baseline_action: Option<CraftActionId>,
    pub low_index: Option<usize>,
    pub low_action: Option<CraftActionId>,
    pub high_index: Option<usize>,
    pub high_action: Option<CraftActionId>,
    pub low_selection_score: Option<f64>,
    pub high_selection_score: Option<f64>,
    pub low_score_for_high_candidate: Option<f64>,
    pub high_score_for_low_candidate: Option<f64>,
    pub low_cross_margin: Option<f64>,
    pub high_cross_margin: Option<f64>,
    pub low_pair_standard_error: Option<f64>,
    pub high_pair_standard_error: Option<f64>,
    pub low_projected_transitions: usize,
    pub high_projected_transitions: usize,
}

impl CandidateTeacherPreferenceRecord {
    pub fn low_high_candidate_agree(&self) -> bool {
        self.low_index == self.high_index
    }

    pub fn low_high_action_agree(&self) -> bool {
        self.low_action == self.high_action
    }

    pub fn baseline_high_candidate_agree(&self) -> bool {
        self.baseline_index == self.high_index
    }

    pub fn baseline_high_action_agree(&self) -> bool {
        self.baseline_action == self.high_action
    }

    pub fn format_row(&self) -> String {
        [
            CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION.to_owned(),
            "preference".to_owned(),
            self.example_ordinal.to_string(),
            self.decision_ordinal.to_string(),
            self.condition.as_str().to_owned(),
            self.candidate_count.to_string(),
            option_usize(self.baseline_index),
            option_action(self.baseline_action),
            option_usize(self.low_index),
            option_action(self.low_action),
            option_usize(self.high_index),
            option_action(self.high_action),
            bool_cell(self.low_high_candidate_agree()),
            bool_cell(self.low_high_action_agree()),
            bool_cell(self.baseline_high_candidate_agree()),
            bool_cell(self.baseline_high_action_agree()),
            option_float(self.low_selection_score),
            option_float(self.high_selection_score),
            option_float(self.low_score_for_high_candidate),
            option_float(self.high_score_for_low_candidate),
            option_float(self.low_cross_margin),
            option_float(self.high_cross_margin),
            option_float(self.low_pair_standard_error),
            option_float(self.high_pair_standard_error),
            self.low_projected_transitions.to_string(),
            self.high_projected_transitions.to_string(),
        ]
        .join("\t")
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateTeacherPreferenceExport {
    pub episode: GenericEpisodeResult,
    pub records: Vec<CandidateTeacherPreferenceRecord>,
}

pub fn candidate_teacher_probe_header() -> String {
    CANDIDATE_TEACHER_PROBE_COLUMNS.join("\t")
}

pub fn execute_candidate_teacher_preference_episode(
    case: &GenericEpisodeCase,
    example_ordinal: u32,
    low_budget: PortfolioEvaluationBudget,
    high_budget: PortfolioEvaluationBudget,
) -> Result<CandidateTeacherPreferenceExport, String> {
    if !case.solver_version.is_route_portfolio() {
        return Err(format!(
            "candidate teacher probe requires a route-portfolio solver; got {}",
            case.solver_version
        ));
    }
    if low_budget.samples() >= high_budget.samples() {
        return Err("teacher probe low samples must be below high samples".to_owned());
    }
    if low_budget.horizon() != high_budget.horizon() {
        return Err("teacher probe budgets must use the same horizon".to_owned());
    }

    let mut records = Vec::new();
    let mut capture_error = None;
    let mut decision_ordinal = 0_u32;
    let episode = execute_generic_episode_with_observer(
        case,
        |state, context, _decision, baseline, _elapsed_ns| {
            if capture_error.is_none() {
                capture_error = match baseline {
                    Some(baseline) => {
                        let low = recommend_portfolio_with_evaluation_budget(
                            case.solver_version,
                            &case.rollout.recipe,
                            &case.rollout.crafter,
                            state,
                            case.objective,
                            case.risk,
                            context,
                            Some(case.random_condition_mask),
                            Some(&case.rollout.condition_transition_weights),
                            low_budget,
                        );
                        let high = recommend_portfolio_with_evaluation_budget(
                            case.solver_version,
                            &case.rollout.recipe,
                            &case.rollout.crafter,
                            state,
                            case.objective,
                            case.risk,
                            context,
                            Some(case.random_condition_mask),
                            Some(&case.rollout.condition_transition_weights),
                            high_budget,
                        );
                        build_record(
                            example_ordinal,
                            decision_ordinal,
                            state.condition,
                            baseline,
                            &low,
                            &high,
                        )
                        .map(|record| records.push(record))
                        .err()
                    }
                    None => Some("teacher probe did not receive candidate evidence".to_owned()),
                };
            }
            decision_ordinal = decision_ordinal.saturating_add(1);
        },
    )?;
    if let Some(error) = capture_error {
        return Err(error);
    }
    if records.len() != episode.recommendation_calls as usize {
        return Err(format!(
            "captured {} teacher preferences for {} recommendation calls",
            records.len(),
            episode.recommendation_calls
        ));
    }
    Ok(CandidateTeacherPreferenceExport { episode, records })
}

fn build_record(
    example_ordinal: u32,
    decision_ordinal: u32,
    condition: crate::MaterialCondition,
    baseline: &PortfolioRecommendation,
    low: &PortfolioRecommendation,
    high: &PortfolioRecommendation,
) -> Result<CandidateTeacherPreferenceRecord, String> {
    let baseline_proposals = baseline
        .candidates
        .iter()
        .map(|candidate| &candidate.proposal)
        .collect::<Vec<_>>();
    let low_proposals = low
        .candidates
        .iter()
        .map(|candidate| &candidate.proposal)
        .collect::<Vec<_>>();
    let high_proposals = high
        .candidates
        .iter()
        .map(|candidate| &candidate.proposal)
        .collect::<Vec<_>>();
    if baseline_proposals != low_proposals || baseline_proposals != high_proposals {
        return Err("teacher budget changed candidate generation or ordering".to_owned());
    }
    if low
        .candidates
        .iter()
        .any(|candidate| candidate.screened_out)
        || high
            .candidates
            .iter()
            .any(|candidate| candidate.screened_out)
    {
        return Err("teacher evaluation unexpectedly screened a candidate".to_owned());
    }
    validate_selection(baseline)?;
    validate_selection(low)?;
    validate_selection(high)?;
    let baseline_action = baseline.decision.map(|decision| decision.action);
    let low_action = low.decision.map(|decision| decision.action);
    let high_action = high.decision.map(|decision| decision.action);
    let low_selection_score = selected_score(low, low.selected_candidate_index);
    let high_selection_score = selected_score(high, high.selected_candidate_index);
    let low_score_for_high_candidate = selected_score(low, high.selected_candidate_index);
    let high_score_for_low_candidate = selected_score(high, low.selected_candidate_index);
    Ok(CandidateTeacherPreferenceRecord {
        example_ordinal,
        decision_ordinal,
        condition,
        candidate_count: baseline.candidates.len(),
        baseline_index: baseline.selected_candidate_index,
        baseline_action,
        low_index: low.selected_candidate_index,
        low_action,
        high_index: high.selected_candidate_index,
        high_action,
        low_selection_score,
        high_selection_score,
        low_score_for_high_candidate,
        high_score_for_low_candidate,
        low_cross_margin: option_difference(low_selection_score, low_score_for_high_candidate),
        high_cross_margin: option_difference(high_selection_score, high_score_for_low_candidate),
        low_pair_standard_error: paired_standard_error(
            low,
            low.selected_candidate_index,
            high.selected_candidate_index,
        ),
        high_pair_standard_error: paired_standard_error(
            high,
            high.selected_candidate_index,
            low.selected_candidate_index,
        ),
        low_projected_transitions: low.work.projected_transitions,
        high_projected_transitions: high.work.projected_transitions,
    })
}

fn selected_score(recommendation: &PortfolioRecommendation, index: Option<usize>) -> Option<f64> {
    index.map(|index| recommendation.candidates[index].selection_score)
}

fn option_difference(left: Option<f64>, right: Option<f64>) -> Option<f64> {
    left.zip(right).map(|(left, right)| left - right)
}

fn paired_standard_error(
    recommendation: &PortfolioRecommendation,
    left_index: Option<usize>,
    right_index: Option<usize>,
) -> Option<f64> {
    let (left_index, right_index) = left_index.zip(right_index)?;
    let left = &recommendation.candidates[left_index].sample_values;
    let right = &recommendation.candidates[right_index].sample_values;
    if left.len() != right.len() || left.len() < 2 {
        return Some(0.0);
    }
    let differences = left
        .iter()
        .zip(right)
        .map(|(left, right)| left - right)
        .collect::<Vec<_>>();
    let count = differences.len() as f64;
    let mean = differences.iter().sum::<f64>() / count;
    let variance = differences
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / (count - 1.0);
    Some((variance / count).sqrt())
}

fn validate_selection(recommendation: &PortfolioRecommendation) -> Result<(), String> {
    match (
        recommendation.selected_candidate_index,
        recommendation.decision,
    ) {
        (Some(index), Some(decision)) => {
            let candidate = recommendation
                .candidates
                .get(index)
                .ok_or_else(|| "teacher selected candidate index is out of range".to_owned())?;
            if candidate.screened_out || candidate.proposal.decision != decision {
                return Err("teacher selected candidate identity is inconsistent".to_owned());
            }
        }
        (None, None) => {}
        _ => return Err("teacher selected candidate index and decision disagree".to_owned()),
    }
    Ok(())
}

fn option_usize(value: Option<usize>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| value.to_string())
}

fn option_action(value: Option<CraftActionId>) -> String {
    value.map_or_else(|| "-".to_owned(), |action| action.as_str().to_owned())
}

fn option_float(value: Option<f64>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| value.to_string())
}

fn bool_cell(value: bool) -> String {
    if value { "1" } else { "0" }.to_owned()
}
