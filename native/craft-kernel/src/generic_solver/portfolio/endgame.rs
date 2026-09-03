//! Bounded deterministic suffix proposals. Normal future conditions are a
//! planning witness, not a guarantee for the stochastic real craft.
use super::*;
use crate::{
    CrafterFormulaInput, RecipeFormulaInput, calculate_base_progress, calculate_base_quality,
};
use std::collections::{HashMap, HashSet};

const WIDTH: usize = 32;
const DEPTH: usize = 12;
const ACTIONS: &[CraftActionId] = &[
    CraftActionId::ByregotsBlessing,
    CraftActionId::PreciseTouch,
    CraftActionId::PreparatoryTouch,
    CraftActionId::PrudentTouch,
    CraftActionId::BasicTouch,
    CraftActionId::StandardTouch,
    CraftActionId::AdvancedTouch,
    CraftActionId::TrainedFinesse,
    CraftActionId::DelicateSynthesis,
    CraftActionId::Innovation,
    CraftActionId::GreatStrides,
    CraftActionId::QuickInnovation,
    CraftActionId::Veneration,
    CraftActionId::TrainedPerfection,
    CraftActionId::MastersMend,
    CraftActionId::ImmaculateMend,
    CraftActionId::Manipulation,
    CraftActionId::WasteNot,
    CraftActionId::WasteNot2,
    CraftActionId::IntensiveSynthesis,
    CraftActionId::Groundwork,
    CraftActionId::CarefulSynthesis,
    CraftActionId::PrudentSynthesis,
    CraftActionId::BasicSynthesis,
    CraftActionId::HeartAndSoul,
    CraftActionId::TricksOfTheTrade,
];

#[derive(Clone)]
struct Node {
    state: CraftState,
    actions: Vec<CraftActionId>,
}

fn useful(before: &CraftState, after: &CraftState, action: CraftActionId) -> bool {
    match action {
        CraftActionId::Innovation => after.buffs.innovation > before.buffs.innovation,
        CraftActionId::GreatStrides => after.buffs.great_strides > before.buffs.great_strides,
        CraftActionId::Veneration => after.buffs.veneration > before.buffs.veneration,
        CraftActionId::Manipulation => after.buffs.manipulation > before.buffs.manipulation,
        CraftActionId::WasteNot | CraftActionId::WasteNot2 => {
            after.buffs.waste_not > before.buffs.waste_not
        }
        CraftActionId::MastersMend | CraftActionId::ImmaculateMend => {
            after.durability > before.durability
        }
        CraftActionId::TricksOfTheTrade => after.cp > before.cp,
        _ => true,
    }
}

// Search ordering only: completed proposals are ranked by actual delivered
// quality. Diversity keeps progress, IQ building and setup routes represented.
fn priority(input: Input<'_>, s: &CraftState) -> f64 {
    if input.condition_coordination
        && input.risk == RiskPreference::Aggressive
        && input.objective.quality_utility_kind != QualityUtilityKind::HqChance
    {
        let formula = RecipeFormulaInput {
            recipe_level: input.recipe.recipe_level,
            progress_divider: input.recipe.progress_divider,
            quality_divider: input.recipe.quality_divider,
            progress_modifier: input.recipe.progress_modifier,
            quality_modifier: input.recipe.quality_modifier,
        };
        let crafter = CrafterFormulaInput {
            craftsmanship: f64::from(input.crafter.craftsmanship),
            control: f64::from(input.crafter.control),
        };
        let base_progress = calculate_base_progress(&formula, &crafter).floor().max(1.0);
        let base_quality = calculate_base_quality(&formula, &crafter).floor();
        let durability_cp =
            (112.0 / f64::from((input.recipe.durability_max - 5).max(1))).min(96.0 / 40.0);
        let available = f64::from(s.cp)
            + durability_cp
                * (f64::from(s.durability)
                    + 5.0 * f64::from(s.buffs.manipulation)
                    + 4.0 * f64::from(s.buffs.waste_not)
                    + if s.trained_perfection_available || s.trained_perfection_active {
                        15.0
                    } else {
                        0.0
                    });
        let remaining_progress = f64::from((input.recipe.progress_required - s.progress).max(0));
        let progress_reserve =
            remaining_progress / (base_progress * 3.6) * (18.0 + 20.0 * durability_cp);
        let iq = f64::from(s.inner_quiet) / 10.0;
        return f64::from(s.quality)
            + (available - progress_reserve) * base_quality * 0.085 * (0.5 + 0.5 * iq)
            + base_quality * 4.0 * iq * iq
            + base_quality
                * (f64::from(s.buffs.innovation) * 0.35 + f64::from(s.buffs.great_strides) * 0.8)
            + base_progress * f64::from(s.buffs.veneration) * 0.2;
    }
    let q = f64::from(s.quality) / f64::from(input.recipe.quality_max.max(1));
    let p = f64::from(s.progress) / f64::from(input.recipe.progress_required.max(1));
    q + 0.3 * p
        + 0.02 * f64::from(s.inner_quiet)
        + 0.2 * f64::from(s.cp) / f64::from(input.crafter.max_cp.max(1))
        + 0.15 * f64::from(s.durability) / f64::from(input.recipe.durability_max.max(1))
        + 0.02 * f64::from(s.buffs.innovation)
        + 0.04 * f64::from(s.buffs.great_strides)
        + 0.01 * f64::from(s.buffs.manipulation)
        + 0.008 * f64::from(s.buffs.waste_not)
        + 0.01 * f64::from(s.buffs.veneration)
}

pub(super) fn plan(input: Input<'_>, work: &mut PortfolioWork) -> Option<Vec<CraftActionId>> {
    let width = if input.construction { 16 } else { WIDTH };
    if input.state.quality >= input.recipe.quality_max
        || (input.state.inner_quiet < 6
            && i64::from(input.state.quality) * 4 < i64::from(input.recipe.quality_max) * 3)
    {
        return None;
    }
    let remaining = input
        .context
        .action_limit
        .saturating_sub(input.context.action_uses) as usize;
    let mut frontier = vec![Node {
        state: input.state.clone(),
        actions: Vec::new(),
    }];
    let mut best: Option<Node> = None;
    for _ in 0..remaining.min(DEPTH) {
        let mut next = Vec::new();
        let mut seen = HashSet::new();
        for node in frontier {
            for &action in ACTIONS {
                let preview = preview_action(input.recipe, input.crafter, &node.state, action);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                if node.state.quality >= input.recipe.quality_max
                    && (preview.action.category == ActionCategory::Quality
                        || matches!(
                            action,
                            CraftActionId::Innovation
                                | CraftActionId::GreatStrides
                                | CraftActionId::QuickInnovation
                        ))
                {
                    continue;
                }
                if matches!(
                    action,
                    CraftActionId::Manipulation
                        | CraftActionId::WasteNot
                        | CraftActionId::WasteNot2
                ) && node.actions.contains(&action)
                {
                    continue;
                }
                work.endgame_transitions += 1;
                let after =
                    branch_state(input.recipe, input.crafter, &node.state, action, true).unwrap();
                if after.terminal == CraftTerminal::Failed || !useful(&node.state, &after, action) {
                    continue;
                }
                let mut actions = node.actions.clone();
                actions.push(action);
                if after.terminal == CraftTerminal::Completed {
                    if after.quality > input.state.quality
                        && best.as_ref().is_none_or(|b| {
                            after.quality > b.state.quality
                                || (after.quality == b.state.quality
                                    && (actions.len(), -after.cp, -after.durability)
                                        < (b.actions.len(), -b.state.cp, -b.state.durability))
                        })
                    {
                        best = Some(Node {
                            state: after,
                            actions,
                        });
                    }
                } else if seen.insert(after.clone()) {
                    next.push(Node {
                        state: after,
                        actions,
                    });
                }
            }
        }
        if best
            .as_ref()
            .is_some_and(|n| n.state.quality >= input.recipe.quality_max)
        {
            break;
        }
        next.sort_by(|a, b| {
            priority(input, &b.state)
                .total_cmp(&priority(input, &a.state))
                .then_with(|| a.actions.cmp(&b.actions))
        });
        let mut buckets = HashMap::new();
        frontier = next
            .into_iter()
            .filter(|n| {
                let key = (
                    i64::from(n.state.progress) * 4
                        / i64::from(input.recipe.progress_required.max(1)),
                    i64::from(n.state.quality) * 4 / i64::from(input.recipe.quality_max.max(1)),
                    n.state.inner_quiet / 3,
                );
                let used = buckets.entry(key).or_insert(0);
                *used += 1;
                *used <= 2
            })
            .take(width)
            .collect();
        if frontier.is_empty() {
            break;
        }
    }
    best.map(|n| n.actions)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn assert_every_tape(
        recipe: &RecipeProfile,
        crafter: &CrafterProfile,
        state: &CraftState,
        actions: &[CraftActionId],
    ) {
        if state.terminal != CraftTerminal::None {
            assert_eq!(state.terminal, CraftTerminal::Completed);
            assert_eq!(state.quality, recipe.quality_max);
            return;
        }
        let (&action, rest) = actions.split_first().expect("all branches must finish");
        assert_eq!(
            preview_action(recipe, crafter, state, action).success_rate,
            1.0
        );
        for &next_condition in MaterialCondition::ALL {
            let next = apply_observed_outcome(
                recipe,
                crafter,
                state,
                action,
                ObservedActionOutcome {
                    success: true,
                    next_condition,
                },
            )
            .unwrap()
            .next_state;
            assert_every_tape(recipe, crafter, &next, rest);
        }
    }

    #[test]
    fn suffixes_are_funded_and_respect_required_quality_and_action_budget() {
        for required_quality in [0, 22_500] {
            let recipe = RecipeProfile {
                canonical_recipe_id: 0,
                recipe_level: 746,
                progress_required: 10_000,
                quality_max: 22_500,
                required_quality,
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
            let mut state = CraftState::initial(&recipe, &crafter);
            state.step = 20;
            state.progress = 8_000;
            state.quality = 20_000;
            state.inner_quiet = 10;
            state.cp = 200;
            state.durability = 40;
            let context = PlannerContext {
                action_uses: 20,
                action_limit: 32,
                ..PlannerContext::default()
            };
            for &condition in MaterialCondition::ALL {
                state.condition = condition;
                let input = Input {
                    condition_coordination: false,
                    resource_aware: true,
                    completion_aware: false,
                    condition_opportunities: true,
                    condition_work_scheduler: false,
                    condition_work_completion_guard: false,
                    coordinated: true,
                    construction: false,
                    compact_comparison: false,
                    robust_suffix: false,
                    recipe: &recipe,
                    crafter: &crafter,
                    state: &state,
                    context: &context,
                    risk: RiskPreference::Balanced,
                    random_condition_mask: Some(0x1ff),
                    declared_condition_weights: None,
                    objective: GenericObjective {
                        quality_maximum: recipe.quality_max,
                        protected_quality_floor: recipe.quality_max,
                        adaptive_completion: true,
                        quality_utility_kind: QualityUtilityKind::ContinuousCollectability,
                        quality_milestone_count: 1,
                        quality_milestones: [recipe.quality_max, 0, 0, 0],
                    },
                };
                let mut work = PortfolioWork::default();
                let safe_state = CraftState {
                    quality: 22_000,
                    durability: 60,
                    ..state.clone()
                };
                let safe_input = Input {
                    state: &safe_state,
                    ..input
                };
                let safe = [
                    CraftActionId::ByregotsBlessing,
                    CraftActionId::Groundwork,
                    CraftActionId::Groundwork,
                ];
                assert!(
                    robust::verifies(safe_input, &safe, &mut work),
                    "{condition:?}"
                );
                assert_every_tape(&recipe, &crafter, &safe_state, &safe);
                assert!(!robust::verifies_with_budget(
                    safe_input, &safe, 0, &mut work
                ));
                assert!(!robust::verifies(
                    safe_input,
                    &[CraftActionId::RapidSynthesis],
                    &mut work
                ));
                // A Normal-only witness can fail on a future Malleable step.
                let dangerous_state = CraftState {
                    progress: 9_400,
                    condition: MaterialCondition::Normal,
                    ..safe_state.clone()
                };
                let dangerous = [
                    CraftActionId::Observe,
                    CraftActionId::CarefulSynthesis,
                    CraftActionId::ByregotsBlessing,
                    CraftActionId::Groundwork,
                ];
                let mut normal = dangerous_state.clone();
                for action in dangerous {
                    normal = branch_state(&recipe, &crafter, &normal, action, true).unwrap();
                }
                assert_eq!(normal.terminal, CraftTerminal::Completed);
                assert_eq!(normal.quality, recipe.quality_max);
                assert!(!robust::verifies(
                    Input {
                        state: &dangerous_state,
                        ..input
                    },
                    &dangerous,
                    &mut work
                ));
                // Primed Waste Not can outlive the Normal witness and forbid Prudent Touch.
                let conflict_state = CraftState {
                    progress: 9_000,
                    cp: 500,
                    condition: MaterialCondition::Normal,
                    ..safe_state.clone()
                };
                let conflict = [
                    CraftActionId::Observe,
                    CraftActionId::WasteNot,
                    CraftActionId::Observe,
                    CraftActionId::Observe,
                    CraftActionId::Observe,
                    CraftActionId::Observe,
                    CraftActionId::PrudentTouch,
                    CraftActionId::ByregotsBlessing,
                    CraftActionId::Groundwork,
                ];
                let mut normal = conflict_state.clone();
                for action in conflict {
                    normal = branch_state(&recipe, &crafter, &normal, action, true).unwrap();
                }
                assert_eq!(normal.terminal, CraftTerminal::Completed);
                assert_eq!(normal.quality, recipe.quality_max);
                assert!(!robust::verifies(
                    Input {
                        state: &conflict_state,
                        ..input
                    },
                    &conflict,
                    &mut work
                ));
                let actions = plan(input, &mut work).expect("funded near-complete quality route");
                assert!(actions.len() <= 12);
                assert!(work.endgame_transitions <= WIDTH * DEPTH * ACTIONS.len());
                let mut replay = state.clone();
                for action in actions {
                    let preview = preview_action(&recipe, &crafter, &replay, action);
                    assert!(preview.legal);
                    assert_eq!(preview.success_rate, 1.0);
                    replay = branch_state(&recipe, &crafter, &replay, action, true).unwrap();
                }
                assert_eq!(replay.terminal, CraftTerminal::Completed);
                assert!(replay.quality > state.quality && replay.quality >= required_quality);
                let exhausted = PlannerContext {
                    action_limit: 20,
                    ..context.clone()
                };
                assert!(
                    plan(
                        Input {
                            context: &exhausted,
                            ..input
                        },
                        &mut work
                    )
                    .is_none()
                );
            }
        }
    }
}
