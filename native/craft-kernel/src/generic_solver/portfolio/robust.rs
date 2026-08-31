//! A bounded proof for one fixed suffix, not a stochastic success estimate.
//! Every recipe-declared possible next color is included. Exact state merging
//! is safe; an unknown set or capacity exhaustion means no certificate.
use super::*;

const MAX_FRONTIER: usize = 256;
const MAX_TRANSITIONS: usize = 2048;

pub(super) fn verifies(
    input: Input<'_>,
    actions: &[CraftActionId],
    work: &mut PortfolioWork,
) -> bool {
    verifies_with_budget(input, actions, MAX_TRANSITIONS, work)
}

pub(super) fn verifies_with_budget(
    input: Input<'_>,
    actions: &[CraftActionId],
    budget: usize,
    work: &mut PortfolioWork,
) -> bool {
    work.robust_suffix_checks += 1;
    if actions.is_empty()
        || actions.len()
            > input
                .context
                .action_limit
                .saturating_sub(input.context.action_uses) as usize
    {
        return false;
    }
    let mut frontier = HashSet::from([input.state.clone()]);
    let mut used = 0;
    for &action in actions {
        let mut next = HashSet::new();
        for state in frontier {
            if used >= budget {
                return false;
            }
            used += 1;
            work.robust_suffix_transitions += 1;
            let preview = preview_action(input.recipe, input.crafter, &state, action);
            if !preview.legal || preview.success_rate != 1.0 {
                return false;
            }
            let after = branch_state(input.recipe, input.crafter, &state, action, true).unwrap();
            if after.terminal != CraftTerminal::None {
                if after.terminal != CraftTerminal::Completed
                    || after.quality < input.recipe.quality_max
                {
                    return false;
                }
                continue;
            }
            let forced = (!preview.action.no_step
                && matches!(
                    state.condition,
                    MaterialCondition::GoodOmen | MaterialCondition::Robust
                ))
                || (preview.action.no_step && !preview.action.rerolls_condition);
            if forced {
                next.insert(after);
            } else {
                // Observed next condition affects no other field of the
                // transition. The declared set is observable product input;
                // its evaluator-private ratios are deliberately unavailable.
                let Some(mask) = input.random_condition_mask else {
                    return false;
                };
                for &condition in MaterialCondition::ALL {
                    if mask & (1_u16 << condition.index()) != 0 {
                        next.insert(CraftState {
                            condition,
                            ..after.clone()
                        });
                    }
                }
            }
            if next.len() > MAX_FRONTIER {
                return false;
            }
        }
        if next.is_empty() {
            work.robust_suffix_certificates += 1;
            return true;
        }
        frontier = next;
    }
    false
}
