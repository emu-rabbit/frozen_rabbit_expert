//! Preserved semantic Rust port of the frozen TypeScript v0.6 migration oracle.
//!
//! Its original objective was migration recovery, not current policy design. Function
//! boundaries, ordered candidates, bounded search budgets and canonical
//! tie-breaks intentionally follow `packages/solver/src/recommend.ts`,
//! `guideIntegratedPolicy.ts`, `finisherCertificate.ts`, and `policySafety.ts`.

use crate::generic_solver::{
    GenericDecision, GenericObjective, PlannerContext, PlannerOption, PlannerPersona,
    QualityUtilityKind, RiskPreference,
};
use crate::{
    ActionCategory, ActionPreview, CraftActionId, CraftState, CraftTerminal, CrafterProfile,
    MaterialCondition, ObservedActionOutcome, RecipeProfile, action_definition,
    apply_observed_outcome, legal_actions, preview_action,
};

mod search_cache;
pub(crate) use search_cache::Scope as SemanticSearchCacheScope;
use search_cache::{Query as SearchQuery, Value as SearchValue};

const FINISHER_NODE_LIMIT: usize = 256;
const DEFAULT_PROGRESS_ACTION_LIMIT: usize = 6;
const DEFAULT_QUALITY_ACTION_LIMIT: usize = 5;

/// The complete history input of this leaf policy. Keeping this typed also
/// makes its memoization dependency boundary explicit to the portfolio.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct SemanticContext {
    manipulation_uses: u8,
    waste_not_uses: u8,
    innovation_uses: u8,
    great_strides_uses: u8,
    last_action: Option<CraftActionId>,
}

impl From<&PlannerContext> for SemanticContext {
    fn from(context: &PlannerContext) -> Self {
        Self {
            manipulation_uses: context.manipulation_uses,
            waste_not_uses: context.waste_not_uses,
            innovation_uses: context.innovation_uses,
            great_strides_uses: context.great_strides_uses,
            last_action: context.last_action,
        }
    }
}

const COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT: [u8; 101] = [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8,
    9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 17,
    17, 17, 18, 18, 18, 19, 19, 20, 20, 21, 22, 23, 24, 26, 28, 31, 34, 38, 42, 47, 52, 58, 64, 68,
    71, 74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 94, 96, 98, 100,
];

fn hq_chance_percent(quality: i32, quality_maximum: i32) -> u8 {
    let quality_percent =
        ((i64::from(quality.max(0)) * 100) / i64::from(quality_maximum.max(1))).min(100) as usize;
    if quality_percent < 50 {
        return (1 + quality_percent * 14 / 50) as u8;
    }
    COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT[quality_percent]
}

const GUARANTEED_PROGRESS_ACTIONS: &[CraftActionId] = &[
    CraftActionId::IntensiveSynthesis,
    CraftActionId::PrudentSynthesis,
    CraftActionId::CarefulSynthesis,
    CraftActionId::BasicSynthesis,
    CraftActionId::Groundwork,
];

const GUARANTEED_RECOVERY_PREFIX_ACTIONS: &[CraftActionId] = &[
    CraftActionId::TrainedPerfection,
    CraftActionId::MastersMend,
    CraftActionId::ImmaculateMend,
    CraftActionId::Manipulation,
    CraftActionId::WasteNot,
    CraftActionId::WasteNot2,
    CraftActionId::Veneration,
];

const QUALITY_BURST_ACTIONS: &[CraftActionId] = &[
    CraftActionId::PreciseTouch,
    CraftActionId::TrainedFinesse,
    CraftActionId::Innovation,
    CraftActionId::GreatStrides,
    CraftActionId::ByregotsBlessing,
    CraftActionId::DelicateSynthesis,
];

#[derive(Clone)]
struct Replay {
    state: CraftState,
    cp_cost: i32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ProgressCertificate {
    actions: Vec<CraftActionId>,
    required_cp: i32,
    required_durability: i32,
}

#[derive(Clone)]
struct QualityCertificate {
    quality_actions: Vec<CraftActionId>,
}

#[derive(Clone)]
struct ActionNode {
    state: CraftState,
    actions: Vec<CraftActionId>,
}

#[derive(Clone, Copy)]
struct SearchBudget {
    remaining: usize,
}

impl SearchBudget {
    fn consume(&mut self) -> bool {
        if self.remaining == 0 {
            return false;
        }
        self.remaining -= 1;
        true
    }
}

fn apply_success(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
) -> Option<CraftState> {
    apply_observed_outcome(
        recipe,
        crafter,
        state,
        action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .ok()
    .map(|result| result.next_state)
}

fn apply_branch(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
    success: bool,
) -> Option<CraftState> {
    apply_observed_outcome(
        recipe,
        crafter,
        state,
        action,
        ObservedActionOutcome {
            success,
            next_condition: MaterialCondition::Normal,
        },
    )
    .ok()
    .map(|result| result.next_state)
}

fn progress_simulation_state(recipe: &RecipeProfile, state: &CraftState) -> Option<CraftState> {
    if state.terminal == CraftTerminal::Failed
        || state.progress >= recipe.progress_required && state.quality < recipe.required_quality
    {
        return None;
    }
    let mut simulated = state.clone();
    simulated.quality = simulated.quality.max(recipe.required_quality);
    simulated.terminal = if simulated.progress >= recipe.progress_required {
        CraftTerminal::Completed
    } else {
        CraftTerminal::None
    };
    simulated.failure_reason = None;
    Some(simulated)
}

fn replay_guaranteed_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    initial: &CraftState,
    actions: &[CraftActionId],
    assume_required_quality_satisfied: bool,
) -> Option<Replay> {
    let mut state = if assume_required_quality_satisfied {
        progress_simulation_state(recipe, initial)?
    } else {
        initial.clone()
    };
    if state.terminal == CraftTerminal::Failed {
        return None;
    }
    if state.terminal == CraftTerminal::Completed {
        return actions.is_empty().then_some(Replay { state, cp_cost: 0 });
    }

    let mut cp_cost = 0;
    for (index, action) in actions.iter().copied().enumerate() {
        let preview = preview_action(recipe, crafter, &state, action);
        if !preview.legal || preview.success_rate != 1.0 {
            return None;
        }
        cp_cost += preview.cp_cost;
        state = apply_success(recipe, crafter, &state, action)?;
        if state.terminal == CraftTerminal::Failed
            || state.terminal == CraftTerminal::Completed && index + 1 != actions.len()
        {
            return None;
        }
    }
    Some(Replay { state, cp_cost })
}

fn minimum_starting_durability(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    initial: &CraftState,
    actions: &[CraftActionId],
    assume_required_quality_satisfied: bool,
) -> Option<i32> {
    if actions.is_empty() {
        return Some(0);
    }
    let completes = |durability| {
        let mut candidate = initial.clone();
        candidate.durability = durability;
        replay_guaranteed_actions(
            recipe,
            crafter,
            &candidate,
            actions,
            assume_required_quality_satisfied,
        )
        .is_some_and(|replay| replay.state.terminal == CraftTerminal::Completed)
    };
    // Callers already replayed this exact suffix successfully at the observed
    // durability. Below that bound, resource trajectories and Groundwork gains
    // are monotone: less durability cannot finish earlier than the valid suffix.
    // Restricting the search to this known-valid interval avoids the early-
    // completion discontinuity that can occur above the observed durability.
    let mut lower = 1;
    let mut upper = initial.durability;
    if upper < lower {
        return None;
    }
    debug_assert!(
        completes(upper),
        "callers provide a replayed completion witness"
    );
    while lower < upper {
        let middle = lower + (upper - lower) / 2;
        if completes(middle) {
            upper = middle;
        } else {
            lower = middle + 1;
        }
    }
    Some(lower)
}

fn compare_action_sequences(left: &[CraftActionId], right: &[CraftActionId]) -> std::cmp::Ordering {
    for (left_action, right_action) in left.iter().zip(right) {
        let compared = left_action.as_str().cmp(right_action.as_str());
        if compared != std::cmp::Ordering::Equal {
            return compared;
        }
    }
    left.len().cmp(&right.len())
}

fn progress_certificate_from_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: &[CraftActionId],
) -> Option<ProgressCertificate> {
    let replay = replay_guaranteed_actions(recipe, crafter, state, actions, true)?;
    if replay.state.terminal != CraftTerminal::Completed {
        return None;
    }
    Some(ProgressCertificate {
        actions: actions.to_vec(),
        required_cp: replay.cp_cost,
        required_durability: minimum_starting_durability(recipe, crafter, state, actions, true)?,
    })
}

fn sort_progress_certificates(certificates: &mut [ProgressCertificate]) {
    certificates.sort_by(compare_progress_certificates);
}

fn compare_progress_certificates(
    left: &ProgressCertificate,
    right: &ProgressCertificate,
) -> std::cmp::Ordering {
    left.required_durability
        .cmp(&right.required_durability)
        .then_with(|| left.required_cp.cmp(&right.required_cp))
        .then_with(|| left.actions.len().cmp(&right.actions.len()))
        .then_with(|| compare_action_sequences(&left.actions, &right.actions))
}

/// Visit feasible progress routes in the canonical search order. A query may
/// stop at its first witness; ranked route selection visits the whole budget.
fn visit_progress_within_budget(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
    budget: &mut SearchBudget,
    accept: &mut impl FnMut(&[CraftActionId]) -> bool,
) -> bool {
    let Some(simulation) = progress_simulation_state(recipe, state) else {
        return false;
    };
    if simulation.terminal == CraftTerminal::Completed {
        return accept(&[]);
    }

    let mut frontier = vec![ActionNode {
        state: simulation,
        actions: Vec::new(),
    }];
    for _ in 0..max_actions {
        let mut next_frontier = Vec::new();
        for node in frontier {
            if !budget.consume() {
                break;
            }
            for action in GUARANTEED_PROGRESS_ACTIONS.iter().copied() {
                let preview = preview_action(recipe, crafter, &node.state, action);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                let Some(next_state) = apply_success(recipe, crafter, &node.state, action) else {
                    continue;
                };
                if next_state.terminal == CraftTerminal::Failed {
                    continue;
                }
                let mut actions = node.actions.clone();
                actions.push(action);
                if next_state.terminal == CraftTerminal::Completed {
                    if accept(&actions) {
                        return true;
                    }
                } else {
                    next_frontier.push(ActionNode {
                        state: next_state,
                        actions,
                    });
                }
            }
        }
        frontier = next_frontier;
    }
    false
}

fn find_progress_within_budget(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
    budget: &mut SearchBudget,
) -> Option<ProgressCertificate> {
    let mut best: Option<ProgressCertificate> = None;
    visit_progress_within_budget(
        recipe,
        crafter,
        state,
        max_actions,
        budget,
        &mut |actions| {
            // A route that needs more durability than the incumbent cannot win.
            // Search still visits the same nodes; only certificate measurement is
            // bounded by the best proven resource requirement so far.
            let bounded = CraftState {
                durability: best
                    .as_ref()
                    .map_or(state.durability, |entry| entry.required_durability),
                ..state.clone()
            };
            if let Some(certificate) =
                progress_certificate_from_actions(recipe, crafter, &bounded, actions)
            {
                if best
                    .as_ref()
                    .is_none_or(|entry| compare_progress_certificates(&certificate, entry).is_lt())
                {
                    best = Some(certificate);
                }
            }
            false
        },
    );
    best
}

fn find_progress_with_recovery_within_budget(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
    budget: &mut SearchBudget,
) -> Option<ProgressCertificate> {
    if let Some(direct) = find_progress_within_budget(recipe, crafter, state, max_actions, budget) {
        return Some(direct);
    }
    if max_actions < 2 || state.terminal != CraftTerminal::None {
        return None;
    }

    let mut certificates = Vec::new();
    let mut prefixes = vec![ActionNode {
        state: state.clone(),
        actions: Vec::new(),
    }];
    for _ in 0..2.min(max_actions - 1) {
        let mut next_prefixes = Vec::new();
        for prefix in prefixes {
            if !budget.consume() {
                break;
            }
            for recovery_action in GUARANTEED_RECOVERY_PREFIX_ACTIONS.iter().copied() {
                if prefix.actions.contains(&recovery_action) {
                    continue;
                }
                let preview = preview_action(recipe, crafter, &prefix.state, recovery_action);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                let Some(recovered) =
                    apply_success(recipe, crafter, &prefix.state, recovery_action)
                else {
                    continue;
                };
                if recovered.terminal == CraftTerminal::Failed {
                    continue;
                }
                let mut recovery_actions = prefix.actions.clone();
                recovery_actions.push(recovery_action);
                if let Some(tail) = find_progress_within_budget(
                    recipe,
                    crafter,
                    &recovered,
                    max_actions - recovery_actions.len(),
                    budget,
                ) {
                    let mut combined_actions = recovery_actions.clone();
                    combined_actions.extend(tail.actions);
                    if let Some(combined) =
                        progress_certificate_from_actions(recipe, crafter, state, &combined_actions)
                    {
                        certificates.push(combined);
                    }
                }
                next_prefixes.push(ActionNode {
                    state: recovered,
                    actions: recovery_actions,
                });
            }
        }
        prefixes = next_prefixes;
    }
    sort_progress_certificates(&mut certificates);
    certificates.into_iter().next()
}

fn find_progress_with_recovery(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
) -> Option<ProgressCertificate> {
    let result = search_cache::get(
        recipe,
        crafter,
        state,
        SearchQuery::Progress(max_actions),
        || {
            SearchValue::Progress(find_progress_with_recovery_uncached(
                recipe,
                crafter,
                state,
                max_actions,
            ))
        },
    );
    let SearchValue::Progress(value) = result else {
        unreachable!("typed query result")
    };
    value
}

fn find_progress_with_recovery_uncached(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
) -> Option<ProgressCertificate> {
    let mut budget = SearchBudget {
        remaining: FINISHER_NODE_LIMIT,
    };
    find_progress_with_recovery_within_budget(recipe, crafter, state, max_actions, &mut budget)
}

/// Feasibility uses the same search order and fresh node budget as ranked
/// certificates. Every accepted route has already been simulated successfully;
/// its minimal starting durability and relative rank are irrelevant to this query.
fn has_progress_with_recovery(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
) -> bool {
    let result = search_cache::get(
        recipe,
        crafter,
        state,
        SearchQuery::Feasible(max_actions),
        || {
            SearchValue::Feasible(has_progress_with_recovery_uncached(
                recipe,
                crafter,
                state,
                max_actions,
            ))
        },
    );
    let SearchValue::Feasible(value) = result else {
        unreachable!("typed query result")
    };
    value
}

fn has_progress_with_recovery_uncached(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
) -> bool {
    let mut budget = SearchBudget {
        remaining: FINISHER_NODE_LIMIT,
    };
    if visit_progress_within_budget(
        recipe,
        crafter,
        state,
        max_actions,
        &mut budget,
        &mut |_| true,
    ) {
        return true;
    }
    if max_actions < 2 || state.terminal != CraftTerminal::None {
        return false;
    }
    let mut prefixes = vec![ActionNode {
        state: state.clone(),
        actions: Vec::new(),
    }];
    for _ in 0..2.min(max_actions - 1) {
        let mut next_prefixes = Vec::new();
        for prefix in prefixes {
            if !budget.consume() {
                break;
            }
            for recovery in GUARANTEED_RECOVERY_PREFIX_ACTIONS.iter().copied() {
                if prefix.actions.contains(&recovery) {
                    continue;
                }
                let preview = preview_action(recipe, crafter, &prefix.state, recovery);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                let Some(recovered) = apply_success(recipe, crafter, &prefix.state, recovery)
                else {
                    continue;
                };
                if recovered.terminal == CraftTerminal::Failed {
                    continue;
                }
                let mut actions = prefix.actions.clone();
                actions.push(recovery);
                if visit_progress_within_budget(
                    recipe,
                    crafter,
                    &recovered,
                    max_actions - actions.len(),
                    &mut budget,
                    &mut |_| true,
                ) {
                    return true;
                }
                next_prefixes.push(ActionNode {
                    state: recovered,
                    actions,
                });
            }
        }
        prefixes = next_prefixes;
    }
    false
}

fn quality_certificate_from_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    quality_actions: &[CraftActionId],
    quality_floor: i32,
    progress_action_limit: usize,
    budget: &mut SearchBudget,
) -> Option<(QualityCertificate, ProgressCertificate, Replay)> {
    let quality_replay = replay_guaranteed_actions(recipe, crafter, state, quality_actions, false)?;
    if quality_replay.state.quality < quality_floor {
        return None;
    }
    let progress = find_progress_with_recovery_within_budget(
        recipe,
        crafter,
        &quality_replay.state,
        progress_action_limit,
        budget,
    )?;
    let mut all_actions = quality_actions.to_vec();
    all_actions.extend(progress.actions.iter().copied());
    let full_replay = replay_guaranteed_actions(recipe, crafter, state, &all_actions, false)?;
    if full_replay.state.terminal != CraftTerminal::Completed {
        return None;
    }
    Some((
        QualityCertificate {
            quality_actions: quality_actions.to_vec(),
        },
        progress,
        full_replay,
    ))
}

fn find_quality_burst(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    quality_floor: i32,
    max_quality_actions: usize,
    max_progress_actions: usize,
) -> Option<QualityCertificate> {
    let result = search_cache::get(
        recipe,
        crafter,
        state,
        SearchQuery::Quality(quality_floor, max_quality_actions, max_progress_actions),
        || {
            SearchValue::Quality(find_quality_burst_uncached(
                recipe,
                crafter,
                state,
                quality_floor,
                max_quality_actions,
                max_progress_actions,
            ))
        },
    );
    let SearchValue::Quality(value) = result else {
        unreachable!("typed query result")
    };
    value
}

fn find_quality_burst_uncached(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    quality_floor: i32,
    max_quality_actions: usize,
    max_progress_actions: usize,
) -> Option<QualityCertificate> {
    if state.terminal != CraftTerminal::None || state.quality >= quality_floor {
        return None;
    }
    #[derive(Clone)]
    struct RankedCertificate {
        certificate: QualityCertificate,
        required_durability: i32,
        required_cp: i32,
        all_actions: Vec<CraftActionId>,
    }

    let mut budget = SearchBudget {
        remaining: FINISHER_NODE_LIMIT,
    };
    let mut certificates = Vec::new();
    let mut frontier = vec![ActionNode {
        state: state.clone(),
        actions: Vec::new(),
    }];
    for _ in 0..max_quality_actions {
        let mut next_frontier = Vec::new();
        for node in frontier {
            if !budget.consume() {
                break;
            }
            for action in QUALITY_BURST_ACTIONS.iter().copied() {
                let preview = preview_action(recipe, crafter, &node.state, action);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                let Some(next_state) = apply_success(recipe, crafter, &node.state, action) else {
                    continue;
                };
                if next_state.terminal == CraftTerminal::Failed {
                    continue;
                }
                let mut actions = node.actions.clone();
                actions.push(action);
                if next_state.quality >= quality_floor {
                    if let Some((certificate, progress, full_replay)) =
                        quality_certificate_from_actions(
                            recipe,
                            crafter,
                            state,
                            &actions,
                            quality_floor,
                            max_progress_actions,
                            &mut budget,
                        )
                    {
                        let mut all_actions = actions.clone();
                        all_actions.extend(progress.actions);
                        if let Some(required_durability) =
                            minimum_starting_durability(recipe, crafter, state, &all_actions, false)
                        {
                            certificates.push(RankedCertificate {
                                certificate,
                                required_durability,
                                required_cp: full_replay.cp_cost,
                                all_actions,
                            });
                        }
                    }
                    continue;
                }
                if !matches!(
                    action,
                    CraftActionId::ByregotsBlessing | CraftActionId::DelicateSynthesis
                ) {
                    next_frontier.push(ActionNode {
                        state: next_state,
                        actions,
                    });
                }
            }
        }
        frontier = next_frontier;
    }
    certificates.sort_by(|left, right| {
        left.required_durability
            .cmp(&right.required_durability)
            .then_with(|| left.required_cp.cmp(&right.required_cp))
            .then_with(|| left.all_actions.len().cmp(&right.all_actions.len()))
            .then_with(|| compare_action_sequences(&left.all_actions, &right.all_actions))
    });
    certificates
        .into_iter()
        .next()
        .map(|entry| entry.certificate)
}

/// A complete, bounded Normal-condition witness to maximum quality and delivery.
/// Failure to find one is unknown, never a reason to reject another route.
pub(crate) fn maximum_quality_finish_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    remaining: usize,
) -> Option<Vec<CraftActionId>> {
    if remaining < 2 || state.quality >= recipe.quality_max {
        return None;
    }
    let quality = find_quality_burst(
        recipe,
        crafter,
        state,
        recipe.quality_max,
        remaining.min(DEFAULT_QUALITY_ACTION_LIMIT),
        remaining.min(8),
    )?;
    let after = replay_guaranteed_actions(recipe, crafter, state, &quality.quality_actions, false)?;
    let progress = find_progress_with_recovery(
        recipe,
        crafter,
        &after.state,
        remaining
            .saturating_sub(quality.quality_actions.len())
            .min(8),
    )?;
    let mut actions = quality.quality_actions;
    actions.extend(progress.actions);
    (actions.len() <= remaining).then_some(actions)
}

fn can_spend_observe_on_condition_fishing(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    observe: ActionPreview,
) -> bool {
    if !observe.legal
        || state.condition == MaterialCondition::Good
        || state.quality >= recipe.required_quality
        || state.inner_quiet < 10
        || f64::from(state.progress) / f64::from(recipe.progress_required) < 0.8
    {
        return false;
    }
    let mut normal = state.clone();
    normal.condition = MaterialCondition::Normal;
    let careful = preview_action(recipe, crafter, &normal, CraftActionId::CarefulSynthesis);
    if !careful.legal || careful.progress_gain <= 0 {
        return false;
    }
    let remaining_progress = recipe.progress_required - state.progress;
    let synthesis_steps = (remaining_progress + careful.progress_gain - 1) / careful.progress_gain;
    let progress_durability = synthesis_steps * careful.durability_cost;
    let progress_cp = synthesis_steps * careful.cp_cost;
    if synthesis_steps < 1 || state.durability < progress_durability + 10 {
        return false;
    }
    let great_strides_cp = if state.buffs.great_strides > 2 { 0 } else { 32 };
    let innovation_cp = if state.buffs.innovation > 2 { 0 } else { 18 };
    if state.cp - observe.cp_cost < progress_cp + great_strides_cp + innovation_cp + 24 {
        return false;
    }
    let mut good = state.clone();
    good.condition = MaterialCondition::Good;
    good.buffs.great_strides = 2;
    good.buffs.innovation = 2;
    let blessing = preview_action(recipe, crafter, &good, CraftActionId::ByregotsBlessing);
    blessing.legal
        && f64::from(state.quality + blessing.quality_gain)
            / f64::from(recipe.required_quality.max(1))
            >= 0.95
}

fn is_policy_action_safe(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
) -> bool {
    let preview = preview_action(recipe, crafter, state, action);
    if !preview.legal
        || action == CraftActionId::FinalAppraisal && state.buffs.final_appraisal > 0
        || action == CraftActionId::Observe
            && state.combo_from == Some(CraftActionId::Observe)
            && !can_spend_observe_on_condition_fishing(recipe, crafter, state, preview)
    {
        return false;
    }
    let completes_progress = state.progress + preview.progress_gain >= recipe.progress_required;
    let reaches_required_quality = state.quality + preview.quality_gain >= recipe.required_quality;
    if completes_progress && !reaches_required_quality {
        return false;
    }
    let guaranteed_valid_completion =
        preview.success_rate == 1.0 && completes_progress && reaches_required_quality;
    preview.durability_cost < state.durability || guaranteed_valid_completion
}

fn can(
    recipe: &RecipeProfile,
    safety_recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
) -> bool {
    preview_action(recipe, crafter, state, action).legal
        && is_policy_action_safe(safety_recipe, crafter, state, action)
}

fn first_allowed(
    recipe: &RecipeProfile,
    safety_recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: &[CraftActionId],
) -> Option<CraftActionId> {
    actions
        .iter()
        .copied()
        .find(|action| can(recipe, safety_recipe, crafter, state, *action))
}

pub(crate) fn quality_utility(objective: GenericObjective, quality: i32) -> f64 {
    if quality <= 0 {
        return 0.0;
    }
    if objective.quality_utility_kind == QualityUtilityKind::HqChance {
        return f64::from(hq_chance_percent(quality, objective.quality_maximum)) / 100.0;
    }
    if objective.quality_milestone_count <= 1 {
        return (f64::from(quality) / f64::from(objective.quality_maximum.max(1))).clamp(0.0, 1.0);
    }
    let thresholds =
        &objective.quality_milestones[..usize::from(objective.quality_milestone_count)];
    let reached = thresholds
        .iter()
        .take_while(|threshold| quality >= **threshold)
        .count();
    if reached == thresholds.len() {
        return 1.0;
    }
    let lower = if reached == 0 {
        0
    } else {
        thresholds[reached - 1]
    };
    let upper = thresholds[reached];
    let interval = f64::from(quality - lower) / f64::from(upper - lower);
    (f64::from(reached as u32) + interval.clamp(0.0, 1.0)) / f64::from(thresholds.len() as u32)
}

fn route_quality_goal(objective: GenericObjective) -> i32 {
    // Every risk is greedy for quality. Risk changes only how much downside a
    // route may expose before falling back to a protected deliverable result.
    objective.quality_maximum
}

fn preserves_progress_finish(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
    adaptive_completion: bool,
) -> bool {
    let preview = preview_action(recipe, crafter, state, action);
    if !preview.legal {
        return false;
    }
    let branches: &[bool] = if preview.success_rate == 1.0 {
        &[true]
    } else {
        &[true, false]
    };
    branches.iter().copied().all(|success| {
        let Some(next) = apply_branch(recipe, crafter, state, action, success) else {
            return false;
        };
        next.terminal == CraftTerminal::Completed
            || next.terminal == CraftTerminal::None
                && has_progress_with_recovery(
                    recipe,
                    crafter,
                    &next,
                    if adaptive_completion {
                        8
                    } else {
                        DEFAULT_PROGRESS_ACTION_LIMIT
                    },
                )
    })
}

fn contingency_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    adaptive_completion: bool,
) -> Option<CraftActionId> {
    if let Some(action) = find_progress_with_recovery(
        recipe,
        crafter,
        state,
        if adaptive_completion {
            8
        } else {
            DEFAULT_PROGRESS_ACTION_LIMIT
        },
    )
    .and_then(|certificate| certificate.actions.first().copied())
    .filter(|action| is_policy_action_safe(recipe, crafter, state, *action))
    {
        return Some(action);
    }
    let mut candidates = legal_actions(recipe, crafter, state)
        .into_iter()
        .filter(|action| is_policy_action_safe(recipe, crafter, state, *action))
        .map(|action| (action, preview_action(recipe, crafter, state, action)))
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        let left_completes =
            i32::from(state.progress + left.1.progress_gain >= recipe.progress_required);
        let right_completes =
            i32::from(state.progress + right.1.progress_gain >= recipe.progress_required);
        let left_recovery = i32::from(action_definition(left.0).category == ActionCategory::Repair);
        let right_recovery =
            i32::from(action_definition(right.0).category == ActionCategory::Repair);
        let left_progress =
            i32::from(action_definition(left.0).category == ActionCategory::Progress);
        let right_progress =
            i32::from(action_definition(right.0).category == ActionCategory::Progress);
        right_completes
            .cmp(&left_completes)
            .then_with(|| {
                (f64::from(right_completes) * right.1.success_rate)
                    .total_cmp(&(f64::from(left_completes) * left.1.success_rate))
            })
            .then_with(|| right_recovery.cmp(&left_recovery))
            .then_with(|| right_progress.cmp(&left_progress))
            .then_with(|| {
                (f64::from(right.1.progress_gain) * right.1.success_rate)
                    .total_cmp(&(f64::from(left.1.progress_gain) * left.1.success_rate))
            })
            .then_with(|| left.1.cp_cost.cmp(&right.1.cp_cost))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn first_or_contingency(
    recipe: &RecipeProfile,
    safety_recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: &[CraftActionId],
    adaptive_completion: bool,
) -> Option<CraftActionId> {
    first_allowed(recipe, safety_recipe, crafter, state, actions).or_else(|| {
        adaptive_completion
            .then(|| contingency_action(recipe, crafter, state, true))
            .flatten()
    })
}

fn certified_quality_before_completion(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    quality_floor: i32,
) -> Option<CraftActionId> {
    find_quality_burst(
        recipe,
        crafter,
        state,
        quality_floor,
        DEFAULT_QUALITY_ACTION_LIMIT,
        8,
    )
    .and_then(|certificate| certificate.quality_actions.first().copied())
    .filter(|action| is_policy_action_safe(recipe, crafter, state, *action))
}

fn adjust_picked_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    adaptive_completion: bool,
    prefer_good_intensive_before_cashout: bool,
    proposed: CraftActionId,
) -> CraftActionId {
    let mut action = proposed;
    if adaptive_completion
        && state.quality < route_quality_goal(objective)
        && state.inner_quiet == 10
        && action != CraftActionId::ByregotsBlessing
    {
        let blessing = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
        let proposed_preview = preview_action(recipe, crafter, state, action);
        if blessing.legal
            && proposed_preview.cp_cost > 0
            && state.cp - proposed_preview.cp_cost < blessing.cp_cost
            && preserves_progress_finish(
                recipe,
                crafter,
                state,
                CraftActionId::ByregotsBlessing,
                true,
            )
        {
            action = CraftActionId::ByregotsBlessing;
        }
    }
    if adaptive_completion
        && state.quality < route_quality_goal(objective)
        && !preserves_progress_finish(recipe, crafter, state, action, true)
    {
        let good_intensive_rescue = prefer_good_intensive_before_cashout
            && state.condition == MaterialCondition::Good
            && action != CraftActionId::IntensiveSynthesis
            && is_policy_action_safe(recipe, crafter, state, CraftActionId::IntensiveSynthesis)
            && preserves_progress_finish(
                recipe,
                crafter,
                state,
                CraftActionId::IntensiveSynthesis,
                true,
            );
        if good_intensive_rescue {
            action = CraftActionId::IntensiveSynthesis;
        } else if let Some(finish) = find_progress_with_recovery(recipe, crafter, state, 8)
            .and_then(|certificate| certificate.actions.first().copied())
        {
            action = finish;
        }
    }
    if adaptive_completion && state.quality < route_quality_goal(objective) {
        let preview = preview_action(recipe, crafter, state, action);
        let completes_below_maximum = preview.legal
            && preview.progress_gain > 0
            && state.progress + preview.progress_gain >= recipe.progress_required
            && state.quality + preview.quality_gain < route_quality_goal(objective);
        if completes_below_maximum
            && let Some(quality_action) = certified_quality_before_completion(
                recipe,
                crafter,
                state,
                route_quality_goal(objective),
            )
        {
            action = quality_action;
        }
    }
    action
}

fn best_progress_completion_action(
    recipe: &RecipeProfile,
    safety_recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
) -> Option<CraftActionId> {
    let mut candidates = CraftActionId::ALL
        .iter()
        .copied()
        .filter(|action| {
            action_definition(*action).category == ActionCategory::Progress
                && can(recipe, safety_recipe, crafter, state, *action)
        })
        .map(|action| (action, preview_action(recipe, crafter, state, action)))
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        let left_done = i32::from(
            state.progress + left.1.progress_gain >= recipe.progress_required
                && left.1.success_rate == 1.0,
        );
        let right_done = i32::from(
            state.progress + right.1.progress_gain >= recipe.progress_required
                && right.1.success_rate == 1.0,
        );
        right_done
            .cmp(&left_done)
            .then_with(|| {
                (f64::from(right.1.progress_gain) * right.1.success_rate)
                    .total_cmp(&(f64::from(left.1.progress_gain) * left.1.success_rate))
            })
            .then_with(|| left.1.cp_cost.cmp(&right.1.cp_cost))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn byregot_desperation_available(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
) -> bool {
    let preview = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
    if !preview.legal || preview.success_rate != 1.0 {
        return false;
    }
    [
        MaterialCondition::Normal,
        MaterialCondition::Sturdy,
        MaterialCondition::Pliant,
    ]
    .into_iter()
    .any(|next_condition| {
        let Ok(result) = apply_observed_outcome(
            recipe,
            crafter,
            state,
            CraftActionId::ByregotsBlessing,
            ObservedActionOutcome {
                success: true,
                next_condition,
            },
        ) else {
            return false;
        };
        let after = result.next_state;
        let actions: &[CraftActionId] = if next_condition == MaterialCondition::Pliant {
            &[
                CraftActionId::MastersMend,
                CraftActionId::ImmaculateMend,
                CraftActionId::Manipulation,
                CraftActionId::WasteNot,
                CraftActionId::WasteNot2,
            ]
        } else {
            &[CraftActionId::RapidSynthesis, CraftActionId::HastyTouch]
        };
        actions.iter().copied().any(|action| {
            let candidate = preview_action(recipe, crafter, &after, action);
            candidate.legal
                && candidate.success_rate > 0.0
                && apply_success(recipe, crafter, &after, action)
                    .is_some_and(|next| next.terminal != CraftTerminal::Failed)
        })
    })
}

fn guide_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &SemanticContext,
) -> Option<CraftActionId> {
    let route_goal = route_quality_goal(objective);
    let adaptive = objective.adaptive_completion;
    let quality_optional = recipe.required_quality < objective.quality_maximum;
    let mut policy_recipe = *recipe;
    policy_recipe.required_quality = route_goal;
    let safety_recipe = if adaptive { recipe } else { &policy_recipe };
    let pick = |action| {
        adjust_picked_action(
            recipe,
            crafter,
            state,
            objective,
            adaptive,
            quality_optional,
            action,
        )
    };
    let first = |actions: &[CraftActionId]| {
        first_or_contingency(recipe, safety_recipe, crafter, state, actions, adaptive).map(pick)
    };
    let action_allowed = |action| can(recipe, safety_recipe, crafter, state, action);
    let progress_ratio = f64::from(state.progress) / f64::from(recipe.progress_required.max(1));
    let quality_ratio = f64::from(state.quality) / f64::from(route_goal.max(1));
    let great_strides_quality = if quality_optional { 0.65 } else { 0.72 };
    let quality_wanted = progress_ratio > quality_ratio || progress_ratio >= 0.9;
    let progress_wanted = quality_ratio > progress_ratio || progress_ratio < 0.55;
    let free_quality_cp_floor = ((f64::from(crafter.max_cp) * 0.14).round() as i32).clamp(60, 140);

    if crafter.specialist
        && state.heart_and_soul_active
        && context.last_action == Some(CraftActionId::HeartAndSoul)
    {
        if quality_optional && state.inner_quiet <= 8 && action_allowed(CraftActionId::PreciseTouch)
        {
            return Some(pick(CraftActionId::PreciseTouch));
        }
        if action_allowed(CraftActionId::TricksOfTheTrade) {
            return Some(pick(CraftActionId::TricksOfTheTrade));
        }
    }
    if crafter.specialist
        && state.condition != MaterialCondition::Good
        && state.cp <= 16
        && state.cp <= crafter.max_cp - 20
        && state.heart_and_soul_available
        && !state.heart_and_soul_active
        && action_allowed(CraftActionId::HeartAndSoul)
    {
        return Some(pick(CraftActionId::HeartAndSoul));
    }
    if quality_optional
        && crafter.specialist
        && state.condition == MaterialCondition::Normal
        && state.inner_quiet <= 8
        && state.inner_quiet < 10
        && progress_ratio >= 0.55_f64.max(generic_progress_floor(recipe, crafter))
        && quality_wanted
        && state.cp >= preview_action(recipe, crafter, state, CraftActionId::PreciseTouch).cp_cost
        && state.heart_and_soul_available
        && !state.heart_and_soul_active
        && action_allowed(CraftActionId::HeartAndSoul)
        && preserves_progress_finish(
            recipe,
            crafter,
            state,
            CraftActionId::HeartAndSoul,
            adaptive,
        )
    {
        return Some(pick(CraftActionId::HeartAndSoul));
    }

    if state.step == 1 {
        return first(&[CraftActionId::Reflect, CraftActionId::MuscleMemory]);
    }
    if context.manipulation_uses == 0
        && state.step <= 4
        && state.condition != MaterialCondition::Good
        && state.buffs.manipulation == 0
        && action_allowed(CraftActionId::Manipulation)
    {
        return Some(pick(CraftActionId::Manipulation));
    }

    let progress_floor = if quality_optional {
        generic_progress_floor(recipe, crafter)
    } else {
        0.0
    };
    if progress_floor > 0.0 && progress_ratio < progress_floor {
        if state.condition == MaterialCondition::Good {
            let actions: &[CraftActionId] = if state.inner_quiet < 10 {
                &[
                    CraftActionId::PreciseTouch,
                    CraftActionId::IntensiveSynthesis,
                    CraftActionId::TricksOfTheTrade,
                ]
            } else {
                &[
                    CraftActionId::IntensiveSynthesis,
                    CraftActionId::PreciseTouch,
                    CraftActionId::TricksOfTheTrade,
                ]
            };
            return first(actions);
        }
        if state.condition == MaterialCondition::Pliant {
            if context.manipulation_uses < 3
                && state.durability <= 25
                && state.buffs.manipulation <= 2
                && action_allowed(CraftActionId::Manipulation)
            {
                return Some(pick(CraftActionId::Manipulation));
            }
            if context.waste_not_uses < 1
                && state.buffs.waste_not <= 1
                && action_allowed(CraftActionId::WasteNot2)
            {
                return Some(pick(CraftActionId::WasteNot2));
            }
            if state.buffs.veneration == 0 && action_allowed(CraftActionId::Veneration) {
                return Some(pick(CraftActionId::Veneration));
            }
        }
        if state.condition != MaterialCondition::Malleable
            && state.buffs.veneration == 0
            && action_allowed(CraftActionId::Veneration)
        {
            return Some(pick(CraftActionId::Veneration));
        }
        let actions: &[CraftActionId] = if matches!(
            state.condition,
            MaterialCondition::Malleable | MaterialCondition::Sturdy
        ) {
            &[
                CraftActionId::RapidSynthesis,
                CraftActionId::Groundwork,
                CraftActionId::CarefulSynthesis,
                CraftActionId::PrudentSynthesis,
            ]
        } else {
            &[
                CraftActionId::RapidSynthesis,
                CraftActionId::CarefulSynthesis,
                CraftActionId::PrudentSynthesis,
            ]
        };
        if let Some(action) = actions.iter().copied().find(|action| {
            if !action_allowed(*action) {
                return false;
            }
            let preview = preview_action(recipe, crafter, state, *action);
            preview.progress_gain > 0
                && state.progress + preview.progress_gain < recipe.progress_required
        }) {
            return Some(pick(action));
        }
    }

    if adaptive && state.inner_quiet < 2 && state.cp < 56 {
        if let Some(action) = find_progress_with_recovery(recipe, crafter, state, 8)
            .and_then(|certificate| certificate.actions.first().copied())
            .filter(|action| is_policy_action_safe(recipe, crafter, state, *action))
        {
            return Some(pick(action));
        }
    }

    if state.quality >= route_goal {
        if let Some(action) = find_progress_with_recovery(
            recipe,
            crafter,
            state,
            if adaptive {
                8
            } else {
                DEFAULT_PROGRESS_ACTION_LIMIT
            },
        )
        .and_then(|certificate| certificate.actions.first().copied())
        .filter(|action| action_allowed(*action))
        {
            return Some(pick(action));
        }
        if let Some(action) = best_progress_completion_action(recipe, safety_recipe, crafter, state)
        {
            return Some(pick(action));
        }
        return first(&[CraftActionId::MastersMend, CraftActionId::Manipulation]);
    }

    if quality_optional && crafter.specialist && state.inner_quiet == 10 {
        let blessing = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
        let mature = state.buffs.great_strides > 0
            && blessing.legal
            && (state.quality + blessing.quality_gain >= route_goal
                || quality_ratio >= great_strides_quality)
            && preserves_progress_finish(
                recipe,
                crafter,
                state,
                CraftActionId::ByregotsBlessing,
                adaptive,
            );
        if mature {
            if state.buffs.innovation == 0
                && state.quick_innovation_available
                && action_allowed(CraftActionId::QuickInnovation)
            {
                return Some(pick(CraftActionId::QuickInnovation));
            }
            if state.condition != MaterialCondition::Good
                && state.careful_observation_uses_left > 0
                && action_allowed(CraftActionId::CarefulObservation)
            {
                return Some(pick(CraftActionId::CarefulObservation));
            }
            return Some(pick(CraftActionId::ByregotsBlessing));
        }
    }

    if state.inner_quiet >= 8 && quality_ratio >= 0.5 {
        if let Some(action) = find_quality_burst(
            recipe,
            crafter,
            state,
            route_goal,
            DEFAULT_QUALITY_ACTION_LIMIT,
            if adaptive {
                8
            } else {
                DEFAULT_PROGRESS_ACTION_LIMIT
            },
        )
        .and_then(|certificate| certificate.quality_actions.first().copied())
        .filter(|action| action_allowed(*action))
        {
            return Some(pick(action));
        }
        if !adaptive {
            for progress_action in [
                CraftActionId::CarefulSynthesis,
                CraftActionId::PrudentSynthesis,
                CraftActionId::Groundwork,
            ] {
                let preview = preview_action(recipe, crafter, state, progress_action);
                if !action_allowed(progress_action)
                    || !preview.legal
                    || preview.success_rate != 1.0
                    || preview.progress_gain <= 0
                    || state.progress + preview.progress_gain >= recipe.progress_required
                {
                    continue;
                }
                let Some(prefixed) = apply_success(recipe, crafter, state, progress_action) else {
                    continue;
                };
                if find_quality_burst(
                    recipe,
                    crafter,
                    &prefixed,
                    route_goal,
                    DEFAULT_QUALITY_ACTION_LIMIT,
                    DEFAULT_PROGRESS_ACTION_LIMIT,
                )
                .is_some()
                {
                    return Some(pick(progress_action));
                }
            }
        }
    }

    let conservative_cycle_infeasible = state.cp < 56
        || state.durability <= 15 && state.buffs.manipulation == 0
        || state.step >= 40;
    if state.inner_quiet == 10
        && conservative_cycle_infeasible
        && action_allowed(CraftActionId::ByregotsBlessing)
    {
        let after_blessing = apply_success(
            &policy_recipe,
            crafter,
            state,
            CraftActionId::ByregotsBlessing,
        );
        let one_risk_finish = after_blessing.as_ref().is_some_and(|after| {
            let rapid = preview_action(
                &policy_recipe,
                crafter,
                after,
                CraftActionId::RapidSynthesis,
            );
            after.quality >= route_goal
                && rapid.legal
                && after.progress + rapid.progress_gain >= recipe.progress_required
        });
        if one_risk_finish && byregot_desperation_available(recipe, crafter, state) {
            return Some(pick(CraftActionId::ByregotsBlessing));
        }
    }

    if state.condition == MaterialCondition::Good {
        if state.buffs.great_strides > 0 && action_allowed(CraftActionId::ByregotsBlessing) {
            let preview = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
            if state.quality + preview.quality_gain >= route_goal || quality_ratio >= 0.95 {
                return Some(pick(CraftActionId::ByregotsBlessing));
            }
        }
        let actions: &[CraftActionId] = if state.inner_quiet < 10 || quality_wanted {
            &[
                CraftActionId::PreciseTouch,
                CraftActionId::DelicateSynthesis,
                CraftActionId::TricksOfTheTrade,
            ]
        } else if progress_wanted {
            &[
                CraftActionId::IntensiveSynthesis,
                CraftActionId::PreciseTouch,
                CraftActionId::TricksOfTheTrade,
            ]
        } else {
            &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade]
        };
        return first(actions);
    }

    if state.condition == MaterialCondition::GoodOmen && quality_wanted {
        let great_strides = preview_action(recipe, crafter, state, CraftActionId::GreatStrides);
        if state.inner_quiet == 10
            && state.buffs.great_strides == 0
            && state.cp >= great_strides.cp_cost + 24
            && action_allowed(CraftActionId::GreatStrides)
        {
            return Some(pick(CraftActionId::GreatStrides));
        }
        if context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && action_allowed(CraftActionId::Innovation)
        {
            return Some(pick(CraftActionId::Innovation));
        }
    }

    if state.condition == MaterialCondition::Primed {
        if context.manipulation_uses < 3
            && state.buffs.manipulation <= 2
            && state.durability <= 30
            && action_allowed(CraftActionId::Manipulation)
        {
            return Some(pick(CraftActionId::Manipulation));
        }
        if progress_wanted
            && state.buffs.veneration == 0
            && action_allowed(CraftActionId::Veneration)
        {
            return Some(pick(CraftActionId::Veneration));
        }
        if quality_wanted
            && context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && action_allowed(CraftActionId::Innovation)
        {
            return Some(pick(CraftActionId::Innovation));
        }
    }

    if state.condition == MaterialCondition::Pliant {
        if context.manipulation_uses < 3
            && state.durability <= 25
            && state.buffs.manipulation <= 2
            && action_allowed(CraftActionId::Manipulation)
        {
            return Some(pick(CraftActionId::Manipulation));
        }
        if context.waste_not_uses < 1
            && state.buffs.waste_not <= 1
            && action_allowed(CraftActionId::WasteNot2)
        {
            return Some(pick(CraftActionId::WasteNot2));
        }
        if quality_wanted
            && context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && action_allowed(CraftActionId::Innovation)
        {
            return Some(pick(CraftActionId::Innovation));
        }
    }

    if context.manipulation_uses == 1
        && context.last_action != Some(CraftActionId::TrainedFinesse)
        && state.condition == MaterialCondition::Normal
        && state.inner_quiet == 10
        && state.buffs.manipulation == 0
        && state.durability <= 20
        && (state.durability > 10 || !action_allowed(CraftActionId::TrainedPerfection))
        && action_allowed(CraftActionId::Manipulation)
        && action_allowed(CraftActionId::TrainedFinesse)
    {
        return Some(pick(CraftActionId::TrainedFinesse));
    }

    if state.durability <= 10 {
        if state.buffs.manipulation > 0 {
            if quality_wanted
                && state.inner_quiet == 10
                && action_allowed(CraftActionId::TrainedFinesse)
            {
                return Some(pick(CraftActionId::TrainedFinesse));
            }
            if quality_wanted
                && context.innovation_uses < 6
                && state.buffs.innovation <= 1
                && action_allowed(CraftActionId::Innovation)
            {
                return Some(pick(CraftActionId::Innovation));
            }
            if progress_wanted
                && state.buffs.veneration == 0
                && action_allowed(CraftActionId::Veneration)
            {
                return Some(pick(CraftActionId::Veneration));
            }
        }
        if state.trained_perfection_available && action_allowed(CraftActionId::TrainedPerfection) {
            return Some(pick(CraftActionId::TrainedPerfection));
        }
        if context.manipulation_uses < 3
            && state.buffs.manipulation == 0
            && action_allowed(CraftActionId::Manipulation)
        {
            return Some(pick(CraftActionId::Manipulation));
        }
        if action_allowed(CraftActionId::MastersMend) {
            return Some(pick(CraftActionId::MastersMend));
        }
    }

    if context.manipulation_uses < 3
        && state.buffs.manipulation == 0
        && state.durability <= 20
        && action_allowed(CraftActionId::Manipulation)
    {
        return Some(pick(CraftActionId::Manipulation));
    }
    if context.waste_not_uses < 1
        && state.buffs.waste_not == 0
        && action_allowed(CraftActionId::WasteNot2)
    {
        return Some(pick(CraftActionId::WasteNot2));
    }
    if quality_wanted
        && context.innovation_uses < 6
        && state.buffs.innovation <= 1
        && action_allowed(CraftActionId::Innovation)
    {
        return Some(pick(CraftActionId::Innovation));
    }
    if quality_wanted
        && state.inner_quiet >= 8
        && quality_ratio >= great_strides_quality
        && context.great_strides_uses < 3
        && state.buffs.great_strides == 0
        && (state.buffs.innovation > 0
            || quality_optional
                && crafter.specialist
                && state.inner_quiet == 10
                && state.quick_innovation_available)
        && state.cp
            >= preview_action(recipe, crafter, state, CraftActionId::GreatStrides).cp_cost + 24
        && action_allowed(CraftActionId::GreatStrides)
    {
        return Some(pick(CraftActionId::GreatStrides));
    }

    if state.buffs.great_strides > 0 && quality_wanted {
        if action_allowed(CraftActionId::ByregotsBlessing) {
            let preview = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
            if state.quality + preview.quality_gain >= route_goal || quality_ratio >= 0.95 {
                return Some(pick(CraftActionId::ByregotsBlessing));
            }
        }
        return first(&[
            CraftActionId::PreparatoryTouch,
            CraftActionId::TrainedFinesse,
            CraftActionId::PrudentTouch,
            CraftActionId::HastyTouch,
        ]);
    }

    if quality_wanted {
        let daring_allowed = match risk {
            RiskPreference::Stable => false,
            RiskPreference::Balanced => state.condition == MaterialCondition::Centered,
            RiskPreference::Aggressive => true,
        };
        if state.buffs.expedience > 0 && daring_allowed {
            return first(&[CraftActionId::DaringTouch, CraftActionId::HastyTouch]);
        }
        if state.condition == MaterialCondition::Centered {
            return first(&[
                CraftActionId::HastyTouch,
                CraftActionId::DaringTouch,
                CraftActionId::TrainedFinesse,
            ]);
        }
        if state.condition == MaterialCondition::Sturdy || state.buffs.waste_not > 0 {
            let actions: &[CraftActionId] = if state.cp < free_quality_cp_floor {
                &[
                    CraftActionId::HastyTouch,
                    CraftActionId::DaringTouch,
                    CraftActionId::PreparatoryTouch,
                    CraftActionId::TrainedFinesse,
                ]
            } else {
                &[
                    CraftActionId::PreparatoryTouch,
                    CraftActionId::HastyTouch,
                    CraftActionId::TrainedFinesse,
                ]
            };
            return first(actions);
        }
        if state.inner_quiet == 10 && state.buffs.innovation > 0 {
            let actions: &[CraftActionId] = if state.cp < free_quality_cp_floor {
                &[CraftActionId::HastyTouch, CraftActionId::TrainedFinesse]
            } else {
                &[CraftActionId::TrainedFinesse, CraftActionId::HastyTouch]
            };
            return first(actions);
        }
        return first(&[
            CraftActionId::HastyTouch,
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
        ]);
    }

    if progress_wanted {
        if state.condition == MaterialCondition::Malleable {
            if state.buffs.veneration == 0 && action_allowed(CraftActionId::Veneration) {
                return Some(pick(CraftActionId::Veneration));
            }
            return first(&[
                CraftActionId::RapidSynthesis,
                CraftActionId::Groundwork,
                CraftActionId::CarefulSynthesis,
            ]);
        }
        if state.condition == MaterialCondition::Centered {
            return first(&[
                CraftActionId::RapidSynthesis,
                CraftActionId::CarefulSynthesis,
            ]);
        }
        return first(&[
            CraftActionId::RapidSynthesis,
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
        ]);
    }

    if state.inner_quiet < 10 {
        first(&[
            CraftActionId::HastyTouch,
            CraftActionId::RapidSynthesis,
            CraftActionId::PrudentTouch,
        ])
    } else if state.buffs.innovation > 0 {
        first(&[
            CraftActionId::TrainedFinesse,
            CraftActionId::HastyTouch,
            CraftActionId::RapidSynthesis,
        ])
    } else {
        first(&[
            CraftActionId::RapidSynthesis,
            CraftActionId::HastyTouch,
            CraftActionId::TrainedFinesse,
        ])
    }
}

fn generic_progress_floor(recipe: &RecipeProfile, crafter: &CrafterProfile) -> f64 {
    let initial = CraftState::initial(recipe, crafter);
    let rapid = preview_action(recipe, crafter, &initial, CraftActionId::RapidSynthesis);
    if !rapid.legal || rapid.progress_gain <= 0 {
        return 0.0;
    }
    (1.0 - f64::from(rapid.progress_gain * 2) / f64::from(recipe.progress_required)).clamp(0.0, 0.9)
}

fn delivery_floor_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
) -> Option<CraftActionId> {
    if recipe.required_quality != 0 || state.quality < objective.protected_quality_floor {
        return None;
    }
    let certificate = find_progress_with_recovery(recipe, crafter, state, 8);
    let current_utility = quality_utility(objective, state.quality);
    let prepared_good_quality_window = certificate.is_some()
        && current_utility < 1.0
        && state.condition == MaterialCondition::Good
        && state.inner_quiet == 10
        && state.durability <= 10
        && (state.buffs.great_strides > 0 || state.buffs.innovation > 0);
    if prepared_good_quality_window {
        if let Some(action) = find_quality_burst(
            recipe,
            crafter,
            state,
            objective.quality_maximum,
            DEFAULT_QUALITY_ACTION_LIMIT,
            8,
        )
        .and_then(|burst| burst.quality_actions.first().copied())
        .filter(|action| {
            let preview = preview_action(recipe, crafter, state, *action);
            preview.quality_gain > 0
                && preview.success_rate == 1.0
                && (*action != CraftActionId::ByregotsBlessing
                    || state.quality + preview.quality_gain >= objective.quality_maximum)
                && is_policy_action_safe(recipe, crafter, state, *action)
        }) {
            return Some(action);
        }

        let mut direct = CraftActionId::ALL
            .iter()
            .copied()
            .filter_map(|action| {
                if action_definition(action).category != ActionCategory::Quality {
                    return None;
                }
                let preview = preview_action(recipe, crafter, state, action);
                if !preview.legal
                    || preview.success_rate != 1.0
                    || preview.quality_gain <= 0
                    || !is_policy_action_safe(recipe, crafter, state, action)
                {
                    return None;
                }
                let next = apply_success(recipe, crafter, state, action)?;
                let utility = quality_utility(objective, next.quality);
                if utility <= current_utility
                    || action == CraftActionId::ByregotsBlessing
                        && next.quality < objective.quality_maximum
                    || next.terminal == CraftTerminal::Completed && utility < 1.0
                    || next.terminal == CraftTerminal::Failed
                    || next.terminal == CraftTerminal::None
                        && !has_progress_with_recovery(recipe, crafter, &next, 8)
                {
                    return None;
                }
                Some((action, utility, preview.quality_gain, preview.cp_cost))
            })
            .collect::<Vec<_>>();
        direct.sort_by(|left, right| {
            right
                .1
                .total_cmp(&left.1)
                .then_with(|| right.2.cmp(&left.2))
                .then_with(|| left.3.cmp(&right.3))
                .then_with(|| left.0.as_str().cmp(right.0.as_str()))
        });
        if let Some((action, ..)) = direct.first() {
            return Some(*action);
        }
    }
    if current_utility >= 1.0 {
        return certificate.and_then(|entry| entry.actions.first().copied());
    }
    None
}

fn near_completion_quality_extension(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
) -> Option<CraftActionId> {
    if recipe.required_quality > 0 {
        return None;
    }
    let deterministic_completion_is_one_action_away =
        CraftActionId::ALL.iter().copied().any(|action| {
            if action_definition(action).category != ActionCategory::Progress {
                return false;
            }
            let preview = preview_action(recipe, crafter, state, action);
            preview.legal
                && preview.success_rate == 1.0
                && state.progress + preview.progress_gain >= recipe.progress_required
        });
    if state.quality >= objective.protected_quality_floor
        || !deterministic_completion_is_one_action_away
    {
        return None;
    }
    let mut candidates = CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            if action_definition(action).category != ActionCategory::Quality {
                return None;
            }
            let preview = preview_action(recipe, crafter, state, action);
            if preview.success_rate != 1.0
                || preview.quality_gain <= 0
                || !is_policy_action_safe(recipe, crafter, state, action)
            {
                return None;
            }
            let next = apply_success(recipe, crafter, state, action)?;
            if next.terminal == CraftTerminal::Failed
                || next.terminal == CraftTerminal::Completed
                    && next.quality < objective.protected_quality_floor
                || action == CraftActionId::ByregotsBlessing
                    && next.quality < objective.protected_quality_floor
                || next.terminal != CraftTerminal::Completed
                    && !has_progress_with_recovery(
                        recipe,
                        crafter,
                        &next,
                        DEFAULT_PROGRESS_ACTION_LIMIT,
                    )
            {
                return None;
            }
            Some((
                action,
                quality_utility(objective, next.quality),
                preview.quality_gain,
                preview.cp_cost,
            ))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| left.3.cmp(&right.3))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn fallback_delivery_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    allow_certificate: bool,
) -> Option<CraftActionId> {
    if recipe.required_quality != 0 || state.quality < objective.protected_quality_floor {
        return None;
    }
    if let Some(action) = find_progress_with_recovery(recipe, crafter, state, 8)
        .and_then(|certificate| certificate.actions.first().copied())
    {
        return allow_certificate.then_some(action);
    }
    if risk == RiskPreference::Stable {
        return None;
    }
    let mut candidates = CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            if action_definition(action).category != ActionCategory::Progress {
                return None;
            }
            let preview = preview_action(recipe, crafter, state, action);
            if !preview.legal || preview.success_rate <= 0.0 || preview.success_rate >= 1.0 {
                return None;
            }
            let success = apply_success(recipe, crafter, state, action)?;
            (success.terminal == CraftTerminal::Completed).then_some((
                action,
                preview.success_rate,
                preview.progress_gain,
            ))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn balanced_desperation_completion_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    risk: RiskPreference,
) -> Option<CraftActionId> {
    if risk != RiskPreference::Balanced {
        return None;
    }
    let mut candidates = CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            let preview = preview_action(recipe, crafter, state, action);
            if !preview.legal
                || preview.success_rate <= 0.0
                || preview.success_rate >= 1.0
                || preview.durability_cost < state.durability
            {
                return None;
            }
            let success = apply_success(recipe, crafter, state, action)?;
            let failure = apply_observed_outcome(
                recipe,
                crafter,
                state,
                action,
                ObservedActionOutcome {
                    success: false,
                    next_condition: state.condition,
                },
            )
            .ok()?
            .next_state;
            (success.terminal == CraftTerminal::Completed
                && failure.terminal == CraftTerminal::Failed)
                .then_some((action, preview.success_rate, preview.progress_gain))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn setup_has_funded_quality_consumer(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    setup_action: CraftActionId,
    objective: GenericObjective,
) -> bool {
    let setup = preview_action(recipe, crafter, state, setup_action);
    if !setup.legal || setup.success_rate != 1.0 {
        return false;
    }
    let Some(prepared) = apply_success(recipe, crafter, state, setup_action) else {
        return false;
    };
    if prepared.terminal != CraftTerminal::None {
        return false;
    }
    CraftActionId::ALL.iter().copied().any(|quality_action| {
        if action_definition(quality_action).category != ActionCategory::Quality {
            return false;
        }
        let preview = preview_action(recipe, crafter, &prepared, quality_action);
        if !preview.legal
            || preview.success_rate <= 0.0
            || preview.quality_gain <= 0
            || !is_policy_action_safe(recipe, crafter, &prepared, quality_action)
        {
            return false;
        }
        let Some(after_quality) = apply_success(recipe, crafter, &prepared, quality_action) else {
            return false;
        };
        if after_quality.terminal == CraftTerminal::Failed
            || after_quality.quality <= prepared.quality
            || quality_action == CraftActionId::ByregotsBlessing
                && after_quality.quality < objective.quality_maximum
        {
            return false;
        }
        if after_quality.terminal == CraftTerminal::Completed
            || has_progress_with_recovery(recipe, crafter, &after_quality, 8)
        {
            return true;
        }
        CraftActionId::ALL.iter().copied().any(|progress_action| {
            if action_definition(progress_action).category != ActionCategory::Progress {
                return false;
            }
            let progress = preview_action(recipe, crafter, &after_quality, progress_action);
            progress.legal
                && progress.success_rate > 0.0
                && apply_success(recipe, crafter, &after_quality, progress_action)
                    .is_some_and(|next| next.terminal == CraftTerminal::Completed)
        })
    })
}

fn decision(action: CraftActionId) -> GenericDecision {
    GenericDecision {
        route: None,
        action,
        option: PlannerOption::BuildQuality,
        persona: PlannerPersona::GuideContinuation,
    }
}

pub(crate) fn recommend_ts_migration_port(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<GenericDecision> {
    if state.terminal != CraftTerminal::None {
        return None;
    }
    if let Some(action) = delivery_floor_action(recipe, crafter, state, objective) {
        return Some(decision(action));
    }
    if let Some(action) = near_completion_quality_extension(recipe, crafter, state, objective) {
        return Some(decision(action));
    }
    if let Some(route) = guide_action(recipe, crafter, state, objective, risk, &context.into()) {
        let category = action_definition(route).category;
        if recipe.required_quality == 0
            && state.quality >= objective.protected_quality_floor
            && matches!(
                category,
                ActionCategory::Buff | ActionCategory::Repair | ActionCategory::Utility
            )
            && !setup_has_funded_quality_consumer(recipe, crafter, state, route, objective)
            && let Some(delivery) =
                fallback_delivery_action(recipe, crafter, state, objective, risk, false)
        {
            return Some(decision(delivery));
        }
        return Some(decision(route));
    }
    if let Some(action) = balanced_desperation_completion_action(recipe, crafter, state, risk) {
        return Some(decision(action));
    }
    fallback_delivery_action(recipe, crafter, state, objective, risk, true).map(decision)
}

#[cfg(test)]
mod tests {
    #[test]
    fn feasibility_matches_ranked_certificate_existence_across_resource_states() {
        use super::*;
        let crafter = CrafterProfile {
            level: 100,
            craftsmanship: 5_400,
            control: 5_200,
            max_cp: 749,
            cosmic_tool_good_bonus: true,
            specialist: true,
        };
        let mut found = 0;
        let mut missing = 0;
        for seed in 0..256_i32 {
            let recipe = RecipeProfile {
                canonical_recipe_id: 0,
                recipe_level: 746,
                progress_required: 4_000 + seed % 3 * 3_000,
                quality_max: 20_000,
                required_quality: if seed % 2 == 0 { 0 } else { 20_000 },
                durability_max: 60,
                progress_divider: 180.0,
                quality_divider: 180.0,
                progress_modifier: 100.0,
                quality_modifier: 100.0,
            };
            let mut state = CraftState::initial(&recipe, &crafter);
            state.step = 2;
            state.progress = seed % 17 * recipe.progress_required / 16;
            state.quality = seed * 193 % 20_001;
            state.durability = 5 + seed % 12 * 5;
            state.cp = seed * 47 % 750;
            state.condition = [
                MaterialCondition::Normal,
                MaterialCondition::Good,
                MaterialCondition::Sturdy,
                MaterialCondition::Pliant,
                MaterialCondition::Robust,
            ][seed as usize % 5];
            state.buffs.manipulation = seed % 9;
            state.buffs.waste_not = seed % 5;
            state.buffs.veneration = seed % 4;
            state.buffs.final_appraisal = seed % 6;
            state.trained_perfection_available = seed % 3 == 0;
            state.trained_perfection_active = seed % 7 == 0;
            for limit in [1, 2, 4, 6, 8] {
                let mut reference_budget = SearchBudget {
                    remaining: FINISHER_NODE_LIMIT,
                };
                let mut reference = Vec::new();
                visit_progress_within_budget(
                    &recipe,
                    &crafter,
                    &state,
                    limit,
                    &mut reference_budget,
                    &mut |actions| {
                        if let Some(certificate) =
                            progress_certificate_from_actions(&recipe, &crafter, &state, actions)
                        {
                            reference.push(certificate);
                        }
                        false
                    },
                );
                sort_progress_certificates(&mut reference);
                let mut bounded_budget = SearchBudget {
                    remaining: FINISHER_NODE_LIMIT,
                };
                let bounded = find_progress_within_budget(
                    &recipe,
                    &crafter,
                    &state,
                    limit,
                    &mut bounded_budget,
                );
                assert_eq!(
                    bounded,
                    reference.into_iter().next(),
                    "rank seed={seed}, limit={limit}"
                );
                assert_eq!(bounded_budget.remaining, reference_budget.remaining);
                let expected =
                    find_progress_with_recovery(&recipe, &crafter, &state, limit).is_some();
                let actual = has_progress_with_recovery(&recipe, &crafter, &state, limit);
                assert_eq!(
                    actual, expected,
                    "seed={seed}, limit={limit}, state={state:?}"
                );
                if actual {
                    found += 1;
                } else {
                    missing += 1;
                }
            }
        }
        assert!(found > 100 && missing > 100);
    }

    #[test]
    fn durability_bisection_matches_exhaustive_valid_suffixes() {
        use super::*;
        let mut recipe = RecipeProfile {
            canonical_recipe_id: 0,
            recipe_level: 746,
            progress_required: 2_000,
            quality_max: 20_000,
            required_quality: 0,
            durability_max: 60,
            progress_divider: 180.0,
            quality_divider: 180.0,
            progress_modifier: 100.0,
            quality_modifier: 100.0,
        };
        let crafter = CrafterProfile {
            level: 100,
            craftsmanship: 5_400,
            control: 5_200,
            max_cp: 749,
            cosmic_tool_good_bonus: true,
            specialist: true,
        };
        let routes: &[&[CraftActionId]] = &[
            &[CraftActionId::Groundwork],
            &[CraftActionId::Groundwork, CraftActionId::Groundwork],
            &[CraftActionId::CarefulSynthesis, CraftActionId::Groundwork],
            &[
                CraftActionId::Veneration,
                CraftActionId::Groundwork,
                CraftActionId::CarefulSynthesis,
            ],
            &[
                CraftActionId::MastersMend,
                CraftActionId::Groundwork,
                CraftActionId::Groundwork,
            ],
            &[
                CraftActionId::Manipulation,
                CraftActionId::PrudentSynthesis,
                CraftActionId::Groundwork,
            ],
            &[
                CraftActionId::TrainedPerfection,
                CraftActionId::Groundwork,
                CraftActionId::Groundwork,
            ],
            &[
                CraftActionId::Innovation,
                CraftActionId::BasicTouch,
                CraftActionId::Groundwork,
            ],
        ];
        let mut checked = 0;
        for target in [300, 800, 1_200, 1_800, 2_400, 3_000] {
            recipe.progress_required = target;
            for condition in [
                MaterialCondition::Normal,
                MaterialCondition::Sturdy,
                MaterialCondition::Robust,
            ] {
                for manipulation in [0, 3] {
                    for waste_not in [0, 3] {
                        for durability in 1..=60 {
                            let mut state = CraftState::initial(&recipe, &crafter);
                            state.condition = condition;
                            state.durability = durability;
                            state.buffs.manipulation = manipulation;
                            state.buffs.waste_not = waste_not;
                            for actions in routes {
                                let completes = |d| {
                                    let mut trial = state.clone();
                                    trial.durability = d;
                                    replay_guaranteed_actions(
                                        &recipe, &crafter, &trial, actions, true,
                                    )
                                    .is_some_and(|r| r.state.terminal == CraftTerminal::Completed)
                                };
                                if !completes(durability) {
                                    continue;
                                }
                                let linear = (1..=recipe.durability_max).find(|d| completes(*d));
                                assert_eq!(
                                    minimum_starting_durability(
                                        &recipe, &crafter, &state, actions, true
                                    ),
                                    linear,
                                    "{state:?} {actions:?} target={target}"
                                );
                                checked += 1;
                            }
                        }
                    }
                }
            }
        }
        assert!(checked > 1_000);
    }

    use super::{hq_chance_percent, quality_utility, route_quality_goal};
    use crate::{GenericObjective, QualityUtilityKind};

    fn collectability_objective(protected_quality_floor: i32) -> GenericObjective {
        GenericObjective {
            quality_maximum: 27_400,
            protected_quality_floor,
            adaptive_completion: true,
            quality_utility_kind: QualityUtilityKind::CollectabilityTiers,
            quality_milestone_count: 4,
            quality_milestones: [16_440, 19_180, 24_660, 27_400],
        }
    }

    #[test]
    fn hq_curve_matches_player_facing_milestones() {
        assert_eq!(hq_chance_percent(17_099, 22_500), 47);
        assert_eq!(hq_chance_percent(17_100, 22_500), 52);
        assert_eq!(hq_chance_percent(18_449, 22_500), 74);
        assert_eq!(hq_chance_percent(18_450, 22_500), 76);
        assert_eq!(hq_chance_percent(22_500, 22_500), 100);
    }

    #[test]
    fn risk_specific_floor_never_truncates_quality_utility_or_route_goal() {
        for protected_quality_floor in [16_440, 24_660, 27_400] {
            let objective = collectability_objective(protected_quality_floor);
            assert_eq!(quality_utility(objective, 19_180), 0.5);
            assert_eq!(route_quality_goal(objective), objective.quality_maximum);
        }
    }
}
