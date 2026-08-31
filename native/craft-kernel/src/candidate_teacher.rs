//! Fixed-budget route-candidate teacher diagnostics.
//!
//! The preference probe follows the ordinary solver and records read-only
//! counterfactuals. The separate teacher episode runner lets a fixed-budget
//! recommendation control the closed loop while preserving ordinary mechanics,
//! actual outcome streams, and planner-context updates.

use crate::generic_episode::execute_generic_episode_with_route_recommender;
use crate::{
    CraftActionId, CraftState, GenericEpisodeCase, GenericEpisodeResult, PlannerContext,
    PortfolioEvaluationBudget, PortfolioRecommendation, execute_generic_episode_with_observer,
    format_generic_episode_result, recommend_portfolio_version,
    recommend_portfolio_with_evaluation_budget,
};

pub const CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION: &str =
    "native-route-candidate-teacher-probe-v1";
pub const CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION: &str =
    "native-route-candidate-teacher-episode-v1";
pub const CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION: &str =
    "native-route-candidate-teacher-consensus-episode-v1";
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

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CandidateTeacherConsensusConfig {
    low_budget: PortfolioEvaluationBudget,
    high_budget: PortfolioEvaluationBudget,
    standard_error_multiplier: f64,
    minimum_paired_gain: f64,
}

impl CandidateTeacherConsensusConfig {
    pub fn new(
        low_budget: PortfolioEvaluationBudget,
        high_budget: PortfolioEvaluationBudget,
        standard_error_multiplier: f64,
        minimum_paired_gain: f64,
    ) -> Result<Self, String> {
        if low_budget.samples() >= high_budget.samples() {
            return Err("consensus teacher low samples must be below high samples".to_owned());
        }
        if low_budget.horizon() != high_budget.horizon() {
            return Err("consensus teacher budgets must use the same horizon".to_owned());
        }
        if !standard_error_multiplier.is_finite() || standard_error_multiplier < 0.0 {
            return Err(
                "consensus teacher standard-error multiplier must be finite and non-negative"
                    .to_owned(),
            );
        }
        if !minimum_paired_gain.is_finite() || minimum_paired_gain < 0.0 {
            return Err(
                "consensus teacher minimum paired gain must be finite and non-negative".to_owned(),
            );
        }
        Ok(Self {
            low_budget,
            high_budget,
            standard_error_multiplier,
            minimum_paired_gain,
        })
    }

    pub const fn low_budget(self) -> PortfolioEvaluationBudget {
        self.low_budget
    }

    pub const fn high_budget(self) -> PortfolioEvaluationBudget {
        self.high_budget
    }

    pub const fn standard_error_multiplier(self) -> f64 {
        self.standard_error_multiplier
    }

    pub const fn minimum_paired_gain(self) -> f64 {
        self.minimum_paired_gain
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CandidateTeacherConsensusDisposition {
    ReferenceAgreement,
    TeacherDisagreement,
    InsufficientPairedGain,
    Override,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CandidateTeacherConsensusCounts {
    pub reference_agreement: usize,
    pub teacher_disagreement: usize,
    pub insufficient_paired_gain: usize,
    pub overrides: usize,
    pub unavailable: usize,
}

impl CandidateTeacherConsensusCounts {
    fn observe(&mut self, disposition: CandidateTeacherConsensusDisposition) {
        match disposition {
            CandidateTeacherConsensusDisposition::ReferenceAgreement => {
                self.reference_agreement += 1;
            }
            CandidateTeacherConsensusDisposition::TeacherDisagreement => {
                self.teacher_disagreement += 1;
            }
            CandidateTeacherConsensusDisposition::InsufficientPairedGain => {
                self.insufficient_paired_gain += 1;
            }
            CandidateTeacherConsensusDisposition::Override => self.overrides += 1,
            CandidateTeacherConsensusDisposition::Unavailable => self.unavailable += 1,
        }
    }

    pub const fn total(self) -> usize {
        self.reference_agreement
            + self.teacher_disagreement
            + self.insufficient_paired_gain
            + self.overrides
            + self.unavailable
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateTeacherConsensusChoice {
    pub recommendation: PortfolioRecommendation,
    pub disposition: CandidateTeacherConsensusDisposition,
    pub paired_gain: Option<f64>,
    pub paired_standard_error: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateTeacherConsensusEpisodeExport {
    pub episode: GenericEpisodeResult,
    pub counts: CandidateTeacherConsensusCounts,
}

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

pub fn candidate_teacher_episode_identity(budget: PortfolioEvaluationBudget) -> String {
    format!(
        "generic-craft-route-teacher-samples-{}-horizon-{}",
        budget.samples(),
        budget.horizon()
    )
}

pub fn format_candidate_teacher_episode_result(
    result: &GenericEpisodeResult,
    budget: PortfolioEvaluationBudget,
) -> String {
    let generic = format_generic_episode_result(result);
    let generic_cells = generic.split('\t').map(str::to_owned).collect::<Vec<_>>();
    format_candidate_teacher_episode_cells(result, budget, &generic_cells)
}

pub fn format_candidate_teacher_episode_outcome_signature(
    result: &GenericEpisodeResult,
    budget: PortfolioEvaluationBudget,
) -> String {
    let generic = format_generic_episode_result(result);
    let mut generic_cells = generic.split('\t').map(str::to_owned).collect::<Vec<_>>();
    debug_assert!(generic_cells.len() > 4);
    generic_cells[22] = "-".to_owned();
    generic_cells[23] = "-".to_owned();
    let last = generic_cells
        .last_mut()
        .expect("generic episode result always has timing cells");
    *last = "-".to_owned();
    format_candidate_teacher_episode_cells(result, budget, &generic_cells)
}

fn format_candidate_teacher_episode_cells(
    result: &GenericEpisodeResult,
    budget: PortfolioEvaluationBudget,
    generic_cells: &[String],
) -> String {
    debug_assert!(generic_cells.len() > 4);
    let mut cells = vec![
        CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION.to_owned(),
        result.case_id.clone(),
        "episode".to_owned(),
        "ok".to_owned(),
        candidate_teacher_episode_identity(budget),
        budget.samples().to_string(),
        budget.horizon().to_string(),
    ];
    cells.extend(generic_cells.iter().skip(4).cloned());
    cells.join("\t")
}

pub fn format_candidate_teacher_episode_error(case_id: &str, message: &str) -> String {
    [
        CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        "episode".to_owned(),
        "error".to_owned(),
        message.replace(['\t', '\r', '\n'], " "),
    ]
    .join("\t")
}

pub fn candidate_teacher_consensus_identity(config: CandidateTeacherConsensusConfig) -> String {
    format!(
        "generic-craft-route-consensus-low{}-high{}-h{}-z{:016x}-min{:016x}",
        config.low_budget().samples(),
        config.high_budget().samples(),
        config.high_budget().horizon(),
        config.standard_error_multiplier().to_bits(),
        config.minimum_paired_gain().to_bits(),
    )
}

pub fn format_candidate_teacher_consensus_episode_result(
    result: &GenericEpisodeResult,
    config: CandidateTeacherConsensusConfig,
) -> String {
    let generic = format_generic_episode_result(result);
    let generic_cells = generic.split('\t').map(str::to_owned).collect::<Vec<_>>();
    format_candidate_teacher_consensus_episode_cells(result, config, &generic_cells)
}

pub fn format_candidate_teacher_consensus_outcome_signature(
    result: &GenericEpisodeResult,
    config: CandidateTeacherConsensusConfig,
) -> String {
    let generic = format_generic_episode_result(result);
    let mut generic_cells = generic.split('\t').map(str::to_owned).collect::<Vec<_>>();
    debug_assert!(generic_cells.len() > 4);
    generic_cells[22] = "-".to_owned();
    generic_cells[23] = "-".to_owned();
    let last = generic_cells
        .last_mut()
        .expect("generic episode result always has timing cells");
    *last = "-".to_owned();
    format_candidate_teacher_consensus_episode_cells(result, config, &generic_cells)
}

fn format_candidate_teacher_consensus_episode_cells(
    result: &GenericEpisodeResult,
    config: CandidateTeacherConsensusConfig,
    generic_cells: &[String],
) -> String {
    debug_assert!(generic_cells.len() > 4);
    let mut cells = vec![
        CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION.to_owned(),
        result.case_id.clone(),
        "episode".to_owned(),
        "ok".to_owned(),
        candidate_teacher_consensus_identity(config),
        config.low_budget().samples().to_string(),
        config.high_budget().samples().to_string(),
        config.high_budget().horizon().to_string(),
        config.standard_error_multiplier().to_string(),
        config.minimum_paired_gain().to_string(),
    ];
    cells.extend(generic_cells.iter().skip(4).cloned());
    cells.join("\t")
}

pub fn format_candidate_teacher_consensus_episode_error(case_id: &str, message: &str) -> String {
    [
        CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        "episode".to_owned(),
        "error".to_owned(),
        message.replace(['\t', '\r', '\n'], " "),
    ]
    .join("\t")
}

pub fn recommend_candidate_teacher_consensus(
    case: &GenericEpisodeCase,
    state: &CraftState,
    context: &PlannerContext,
    config: CandidateTeacherConsensusConfig,
) -> Result<CandidateTeacherConsensusChoice, String> {
    if !case.solver_version.is_route_portfolio() {
        return Err(format!(
            "consensus teacher requires a route-portfolio solver; got {}",
            case.solver_version
        ));
    }
    let baseline = recommend_portfolio_version(
        case.solver_version,
        &case.rollout.recipe,
        &case.rollout.crafter,
        state,
        case.objective,
        case.risk,
        context,
        Some(case.random_condition_mask),
    );
    let low = recommend_portfolio_with_evaluation_budget(
        case.solver_version,
        &case.rollout.recipe,
        &case.rollout.crafter,
        state,
        case.objective,
        case.risk,
        context,
        Some(case.random_condition_mask),
        config.low_budget(),
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
        config.high_budget(),
    );
    validate_matching_proposals(&baseline, &low, &high)?;
    validate_selection(&baseline)?;
    validate_selection(&low)?;
    validate_selection(&high)?;

    let Some(teacher_index) = low.selected_candidate_index else {
        return Ok(consensus_fallback(
            baseline,
            CandidateTeacherConsensusDisposition::Unavailable,
            None,
            None,
        ));
    };
    if high.selected_candidate_index != Some(teacher_index) {
        return Ok(consensus_fallback(
            baseline,
            CandidateTeacherConsensusDisposition::TeacherDisagreement,
            None,
            None,
        ));
    }
    let Some(baseline_index) = baseline.selected_candidate_index else {
        return Ok(consensus_fallback(
            baseline,
            CandidateTeacherConsensusDisposition::Unavailable,
            None,
            None,
        ));
    };
    if teacher_index == baseline_index {
        return Ok(consensus_fallback(
            baseline,
            CandidateTeacherConsensusDisposition::ReferenceAgreement,
            Some(0.0),
            Some(0.0),
        ));
    }

    let (paired_gain, paired_error) = paired_difference_statistics(
        &high.candidates[teacher_index].sample_values,
        &high.candidates[baseline_index].sample_values,
    )?;
    let required_gain = config
        .minimum_paired_gain()
        .max(config.standard_error_multiplier() * paired_error);
    if paired_gain <= required_gain {
        return Ok(consensus_fallback(
            baseline,
            CandidateTeacherConsensusDisposition::InsufficientPairedGain,
            Some(paired_gain),
            Some(paired_error),
        ));
    }
    Ok(CandidateTeacherConsensusChoice {
        recommendation: high,
        disposition: CandidateTeacherConsensusDisposition::Override,
        paired_gain: Some(paired_gain),
        paired_standard_error: Some(paired_error),
    })
}

pub fn execute_candidate_teacher_consensus_episode(
    case: &GenericEpisodeCase,
    config: CandidateTeacherConsensusConfig,
) -> Result<CandidateTeacherConsensusEpisodeExport, String> {
    let mut counts = CandidateTeacherConsensusCounts::default();
    let mut recommendation_error = None;
    let episode = execute_generic_episode_with_route_recommender(case, |state, context| {
        if recommendation_error.is_none() {
            match recommend_candidate_teacher_consensus(case, state, context, config) {
                Ok(choice) => {
                    counts.observe(choice.disposition);
                    return choice.recommendation;
                }
                Err(error) => recommendation_error = Some(error),
            }
        }
        recommend_portfolio_version(
            case.solver_version,
            &case.rollout.recipe,
            &case.rollout.crafter,
            state,
            case.objective,
            case.risk,
            context,
            Some(case.random_condition_mask),
        )
    })?;
    if let Some(error) = recommendation_error {
        return Err(error);
    }
    if counts.total() != episode.recommendation_calls as usize {
        return Err(format!(
            "captured {} consensus dispositions for {} recommendation calls",
            counts.total(),
            episode.recommendation_calls
        ));
    }
    Ok(CandidateTeacherConsensusEpisodeExport { episode, counts })
}

fn consensus_fallback(
    recommendation: PortfolioRecommendation,
    disposition: CandidateTeacherConsensusDisposition,
    paired_gain: Option<f64>,
    paired_standard_error: Option<f64>,
) -> CandidateTeacherConsensusChoice {
    CandidateTeacherConsensusChoice {
        recommendation,
        disposition,
        paired_gain,
        paired_standard_error,
    }
}

fn validate_matching_proposals(
    baseline: &PortfolioRecommendation,
    low: &PortfolioRecommendation,
    high: &PortfolioRecommendation,
) -> Result<(), String> {
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
        return Err("consensus teacher changed candidate generation or ordering".to_owned());
    }
    if low
        .candidates
        .iter()
        .chain(&high.candidates)
        .any(|candidate| candidate.screened_out)
    {
        return Err("consensus teacher unexpectedly screened a candidate".to_owned());
    }
    Ok(())
}

fn paired_difference_statistics(left: &[f64], right: &[f64]) -> Result<(f64, f64), String> {
    if left.len() != right.len() || left.is_empty() {
        return Err("consensus teacher paired samples are missing or misaligned".to_owned());
    }
    let differences = left
        .iter()
        .zip(right)
        .map(|(left, right)| left - right)
        .collect::<Vec<_>>();
    let count = differences.len() as f64;
    let mean = differences.iter().sum::<f64>() / count;
    if differences.len() < 2 {
        return Ok((mean, 0.0));
    }
    let variance = differences
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / (count - 1.0);
    Ok((mean, (variance / count).sqrt()))
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
