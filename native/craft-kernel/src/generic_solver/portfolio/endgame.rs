//! Bounded deterministic suffix proposals. Normal future conditions are a
//! planning witness, not a guarantee for the stochastic real craft.
use super::*;
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
                    resource_aware: true,
                    coordinated: true,
                    construction: false,
                    compact_comparison: false,
                    recipe: &recipe,
                    crafter: &crafter,
                    state: &state,
                    context: &context,
                    risk: RiskPreference::Balanced,
                    random_condition_mask: Some(0x1ff),
                    condition_weights: None,
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
