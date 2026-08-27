use super::*;
use crate::MATERIAL_CONDITION_COUNT;
use crate::ts_migration_port::quality_utility;
use std::collections::HashMap;

fn normal_weights() -> ConditionTransitionWeights {
    let mut weights = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut weights {
        row[MaterialCondition::Normal.index()] = 1.0;
    }
    weights
}

fn branch(
    input: Input<'_>,
    preview: &ActionPreview,
    success: bool,
    probability: f64,
) -> BranchEvidence {
    let weights = normal_weights();
    let mut random = EpisodeRandomStream::new(0);
    let mut observed = draw_simulated_action_outcome(
        preview,
        input.state,
        &weights[input.state.condition.index()],
        &mut random,
        RandomDrawCursor {
            condition_draws: 0,
            success_draws: 0,
        },
    )
    .observed;
    observed.success = success;
    let next = apply_observed_outcome(
        input.recipe,
        input.crafter,
        input.state,
        preview.action.id,
        observed,
    )
    .unwrap()
    .next_state;
    let completion = match next.terminal {
        CraftTerminal::Completed => CompletionEvidence::Completed,
        CraftTerminal::Failed => CompletionEvidence::TerminalFailure,
        CraftTerminal::None => CraftActionId::ALL
            .iter()
            .copied()
            .find(|action| {
                let preview = preview_action(input.recipe, input.crafter, &next, *action);
                preview.legal
                    && preview.success_rate == 1.0
                    && preview.progress_gain > 0
                    && branch_state(input.recipe, input.crafter, &next, *action, true)
                        .is_some_and(|state| state.terminal == CraftTerminal::Completed)
            })
            .map_or(CompletionEvidence::Unknown, CompletionEvidence::NormalRoute),
    };
    BranchEvidence {
        probability,
        reference_state: next,
        completion,
    }
}

#[derive(Default)]
struct Forecast {
    completion: f64,
    quality: f64,
    potential: f64,
    floor_loss: f64,
    actions: f64,
}

fn forecast(
    input: Input<'_>,
    proposal: &CandidateProposal,
    root: &ActionPreview,
    root_success: bool,
    sample: usize,
    weights: &ConditionTransitionWeights,
    work: &mut PortfolioWork,
) -> Forecast {
    // Planning randomness belongs to this recommendation. Observable mechanics
    // alone seed it, with common random numbers across competing proposals.
    let seed = types::signature(input.state) as u32 ^ (sample as u32).wrapping_mul(0x9e37_79b9);
    let mut random = EpisodeRandomStream::new(seed);
    let mut cursor = RandomDrawCursor {
        condition_draws: 0,
        success_draws: 0,
    };
    let mut state = input.state.clone();
    let mut context = input.context.clone();
    let mut decision = proposal.decision;
    let route = decision.route.expect("all proposals own a continuation");
    let horizon =
        PORTFOLIO_HORIZON.min(context.action_limit.saturating_sub(context.action_uses) as usize);
    let mut actions = 0;
    for step in 0..horizon {
        let preview = if step == 0 {
            *root
        } else {
            let projected = Input {
                state: &state,
                context: &context,
                ..input
            };
            let consumer = (step == 1)
                .then(|| consumer_available(projected, route))
                .flatten();
            if let Some(action) = consumer {
                decision = action_decision(action, route.engine);
            } else {
                work.continuation_calls += 1;
                let next = continuation(projected, route.engine).or_else(|| {
                    deterministic_completion_first(
                        input.recipe,
                        input.crafter,
                        &state,
                        (horizon - step).min(7),
                    )
                    .map(|action| action_decision(action, route.engine))
                });
                let Some(next) = next else {
                    break;
                };
                decision = attach_route(next, route.engine);
            }
            preview_action(input.recipe, input.crafter, &state, decision.action)
        };
        if !preview.legal {
            break;
        }
        let mut draw = draw_simulated_action_outcome(
            &preview,
            &state,
            &weights[state.condition.index()],
            &mut random,
            cursor,
        );
        if step == 0 {
            draw.observed.success = root_success;
        }
        let next = apply_observed_outcome(
            input.recipe,
            input.crafter,
            &state,
            decision.action,
            draw.observed,
        )
        .unwrap()
        .next_state;
        advance_planner_context(
            &mut context,
            GenericSolverVersion::RoutePortfolioV1,
            decision,
            &state,
            &next,
        );
        cursor = draw.cursor_after;
        state = next;
        actions += 1;
        work.projected_transitions += 1;
        if state.terminal != CraftTerminal::None {
            break;
        }
    }
    let quality = quality_utility(input.objective, state.quality);
    let completed = state.terminal == CraftTerminal::Completed;
    let progress = (f64::from(state.progress) / f64::from(input.recipe.progress_required.max(1)))
        .clamp(0.0, 1.0);
    let required = if input.recipe.required_quality > 0 {
        (f64::from(state.quality) / f64::from(input.recipe.required_quality)).clamp(0.0, 1.0)
    } else {
        1.0
    };
    Forecast {
        completion: f64::from(completed),
        quality: if completed { quality } else { 0.0 },
        // An unfinished state has a small tie-breaking potential, not delivery credit.
        potential: if state.terminal == CraftTerminal::None {
            progress.min(required) * (1.0 + quality) / 2.0
        } else {
            0.0
        },
        floor_loss: if completed {
            (quality_utility(input.objective, input.objective.protected_quality_floor) - quality)
                .max(0.0)
        } else {
            0.0
        },
        actions: f64::from(actions),
    }
}

pub(super) fn evaluate(
    input: Input<'_>,
    proposals: Vec<CandidateProposal>,
    work: &mut PortfolioWork,
) -> Vec<CandidateEvidence> {
    let default_weights = normal_weights();
    let weights = input.condition_weights.unwrap_or(&default_weights);
    let mut previews = HashMap::new();
    let mut candidates = Vec::new();
    for proposal in proposals {
        let preview = *previews.entry(proposal.decision.action).or_insert_with(|| {
            preview_action(
                input.recipe,
                input.crafter,
                input.state,
                proposal.decision.action,
            )
        });
        let success = branch(input, &preview, true, preview.success_rate);
        let failure = (preview.success_rate < 1.0)
            .then(|| branch(input, &preview, false, 1.0 - preview.success_rate));
        let mut total = Forecast::default();
        for (succeeded, probability) in [
            (true, preview.success_rate),
            (false, 1.0 - preview.success_rate),
        ] {
            if probability <= 0.0 {
                continue;
            }
            for sample in 0..PORTFOLIO_SAMPLES {
                let result = forecast(input, &proposal, &preview, succeeded, sample, weights, work);
                let weight = probability / PORTFOLIO_SAMPLES as f64;
                total.completion += weight * result.completion;
                total.quality += weight * result.quality;
                total.potential += weight * result.potential;
                total.floor_loss += weight * result.floor_loss;
                total.actions += weight * result.actions;
            }
        }
        let (completion_weight, floor_weight) = match input.risk {
            RiskPreference::Stable => (4.0, 1.0),
            RiskPreference::Balanced => (2.0, 0.5),
            RiskPreference::Aggressive => (1.0, 0.25),
        };
        let score = completion_weight * total.completion + total.quality
            - floor_weight * total.floor_loss
            + 0.01 * total.potential;
        candidates.push(CandidateEvidence {
            proposal,
            preview,
            success,
            failure,
            completion_probability: total.completion,
            delivered_quality_utility: total.quality,
            unfinished_potential: total.potential,
            expected_actions: total.actions,
            forecast_samples: PORTFOLIO_SAMPLES,
            forecast_horizon: PORTFOLIO_HORIZON.min(
                input
                    .context
                    .action_limit
                    .saturating_sub(input.context.action_uses) as usize,
            ),
            score,
        });
    }
    candidates
}
