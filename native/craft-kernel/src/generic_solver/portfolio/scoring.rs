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
        CraftTerminal::None if input.context.action_uses + 1 >= input.context.action_limit => {
            CompletionEvidence::Unknown
        }
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

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Forecast {
    deterministic: bool,
    completion: f64,
    quality: f64,
    potential: f64,
    floor_loss: f64,
    actions: f64,
}

// Integrate a final gamble exactly when both outcomes terminate. This avoids
// lucky rollout samples presenting a resource-starved finish as certain.
// The actual current condition supplies the success rate (including Centered).
fn terminal_pair(
    input: Input<'_>,
    state: &CraftState,
    preview: &ActionPreview,
    actions: u32,
) -> Option<Forecast> {
    if !(preview.success_rate > 0.0 && preview.success_rate < 1.0) {
        return None;
    }
    let success = branch_state(input.recipe, input.crafter, state, preview.action.id, true)?;
    let failure = branch_state(input.recipe, input.crafter, state, preview.action.id, false)?;
    if success.terminal == CraftTerminal::None || failure.terminal == CraftTerminal::None {
        return None;
    }
    let mut result = Forecast {
        deterministic: true,
        actions: actions as f64,
        ..Forecast::default()
    };
    for (p, end) in [
        (preview.success_rate, success),
        (1.0 - preview.success_rate, failure),
    ] {
        let q = quality_utility(input.objective, end.quality);
        if end.terminal == CraftTerminal::Completed {
            result.completion += p;
            result.quality += p * q;
            result.floor_loss += p
                * (quality_utility(input.objective, input.objective.protected_quality_floor) - q)
                    .max(0.0);
        } else {
            result.potential += p * unfinished_potential(input, &end);
        }
    }
    Some(result)
}

fn unfinished_potential(input: Input<'_>, state: &CraftState) -> f64 {
    let progress = (f64::from(state.progress) / f64::from(input.recipe.progress_required.max(1)))
        .clamp(0.0, 1.0);
    let required = if input.recipe.required_quality > 0 {
        (f64::from(state.quality) / f64::from(input.recipe.required_quality)).clamp(0.0, 1.0)
    } else {
        1.0
    };
    progress.min(required) * (1.0 + quality_utility(input.objective, state.quality)) / 2.0
}

#[derive(Eq, Hash, PartialEq)]
enum ContinuationContext {
    Full(PlannerContext),
    Semantic(crate::ts_migration_port::SemanticContext),
}

#[derive(Eq, Hash, PartialEq)]
struct ContinuationKey {
    state: CraftState,
    context: ContinuationContext,
    engine: ContinuationEngine,
}

/// One recommendation owns its fixed mechanics, objective, risk and world.
/// Complete state/context keys preserve every continuation input; saturation
/// only stops storage, so the same deterministic continuation still runs.
struct ContinuationCache<'a> {
    input: Input<'a>,
    planning_seed: u32,
    entries: HashMap<ContinuationKey, Option<GenericDecision>>,
    finish_entries: HashMap<(CraftState, usize), Option<CraftActionId>>,
    pilot_forecasts: HashMap<(usize, bool, usize), Forecast>,
}

impl<'a> ContinuationCache<'a> {
    fn new(input: Input<'a>) -> Self {
        Self {
            input,
            planning_seed: types::signature(input.state) as u32,
            entries: HashMap::new(),
            finish_entries: HashMap::new(),
            pilot_forecasts: HashMap::new(),
        }
    }

    fn recommend(
        &mut self,
        state: &CraftState,
        context: &PlannerContext,
        engine: ContinuationEngine,
        work: &mut PortfolioWork,
    ) -> Option<GenericDecision> {
        // Route memory is consumed by the portfolio, not either leaf engine.
        // All leaf-relevant history remains in the key. This is local to v1.2;
        // the original v1.1 comparison path retains its exact cache behavior.
        let mut cache_context = context.clone();
        if self.input.resource_aware {
            cache_context.route_memory = RouteMemory::default();
        }
        let key = ContinuationKey {
            state: state.clone(),
            context: if self.input.resource_aware && engine == ContinuationEngine::Semantic {
                ContinuationContext::Semantic(crate::ts_migration_port::SemanticContext::from(
                    context,
                ))
            } else {
                ContinuationContext::Full(cache_context)
            },
            engine,
        };
        if let Some(decision) = self.entries.get(&key) {
            work.continuation_cache_hits += 1;
            return *decision;
        }
        let decision = continuation(
            Input {
                state,
                context,
                ..self.input
            },
            engine,
        );
        if self.entries.len() + self.finish_entries.len() < 4096 {
            self.entries.insert(key, decision);
        }
        decision
    }

    fn finish(
        &mut self,
        state: &CraftState,
        depth: usize,
        work: &mut PortfolioWork,
    ) -> Option<CraftActionId> {
        let key = (state.clone(), depth);
        if let Some(action) = self.finish_entries.get(&key) {
            work.completion_cache_hits += 1;
            return *action;
        }
        let action =
            deterministic_completion_first(self.input.recipe, self.input.crafter, state, depth);
        if self.entries.len() + self.finish_entries.len() < 4096 {
            self.finish_entries.insert(key, action);
        }
        action
    }
}

fn forecast(
    input: Input<'_>,
    proposal: &CandidateProposal,
    root: &ActionPreview,
    root_success: bool,
    sample: usize,
    horizon: usize,
    weights: &ConditionTransitionWeights,
    cache: &mut ContinuationCache<'_>,
    work: &mut PortfolioWork,
) -> Forecast {
    // Planning randomness belongs to this recommendation. Observable mechanics
    // alone seed it, with common random numbers across competing proposals.
    let seed = cache.planning_seed ^ (sample as u32).wrapping_mul(0x9e37_79b9);
    let mut random = EpisodeRandomStream::new(seed);
    let mut cursor = RandomDrawCursor {
        condition_draws: 0,
        success_draws: 0,
    };
    let mut state = input.state.clone();
    let mut context = input.context.clone();
    let mut decision = proposal.decision;
    let route = decision.route.expect("all proposals own a continuation");
    let mut actions = 0;
    let mut deterministic = true;
    for step in 0..horizon {
        let preview = if step == 0 {
            *root
        } else {
            let projected = Input {
                state: &state,
                context: &context,
                ..input
            };
            let consumer = proposal
                .continuation_actions
                .get(step - 1)
                .copied()
                .or_else(|| {
                    (step == 1)
                        .then(|| consumer_available(projected, route))
                        .flatten()
                });
            let resumed = input
                .condition_work_scheduler
                .then(|| {
                    [context.route_memory.suspended, context.route_memory.active]
                        .into_iter()
                        .flatten()
                        .find_map(|saved| {
                            consumer_available(projected, saved).map(|action| (action, saved))
                        })
                })
                .flatten();
            if let Some(action) = consumer {
                decision = action_decision(action, route.engine);
            } else if let Some((action, saved)) = resumed {
                decision = action_decision(action, saved.engine);
                decision.route = Some(RoutePlan {
                    setup: None,
                    consumer: None,
                    interrupt: false,
                    ..saved
                });
            } else {
                work.continuation_calls += 1;
                let next = cache
                    .recommend(&state, &context, route.engine, work)
                    .or_else(|| {
                        (if input.resource_aware {
                            cache.finish(&state, (horizon - step).min(7), work)
                        } else {
                            deterministic_completion_first(
                                input.recipe,
                                input.crafter,
                                &state,
                                (horizon - step).min(7),
                            )
                        })
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
        if input.condition_coordination
            && step > 0
            && i64::from(state.progress) + i64::from(preview.progress_gain)
                >= i64::from(input.recipe.progress_required)
        {
            if let Some(mut exact) = terminal_pair(input, &state, &preview, actions + 1) {
                exact.deterministic = deterministic;
                work.analytic_terminal_folds += 1;
                work.projected_transitions += 2;
                return exact;
            }
        }
        if step > 0
            && !preview.action.no_step
            && preview.success_rate > 0.0
            && preview.success_rate < 1.0
        {
            deterministic = false;
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
        if next.terminal == CraftTerminal::None && step + 1 < horizon
            && !(preview.action.no_step && !preview.action.rerolls_condition)
            && !matches!(state.condition, MaterialCondition::GoodOmen | MaterialCondition::Robust)
            // Normal-only (including zero total) is exactly deterministic in
            // the sampler. Do not assume other single-positive rows are: the
            // sampler's zero-draw boundary can still return the first color.
            && weights[state.condition.index()].iter().skip(1).any(|&w| w > 0.0)
        {
            deterministic = false;
        }
        if input.condition_work_scheduler {
            // v1.13 values a color interruption together with the
            // funded work it can resume. Historical portfolio identities keep
            // their exact leaf-only forecast semantics.
            advance_planner_context(
                &mut context,
                GenericSolverVersion::RoutePortfolioV1,
                decision,
                &state,
                &next,
            );
        } else if input.resource_aware {
            advance_portfolio_leaf_context(&mut context, decision, &state, &next);
        } else {
            advance_planner_context(
                &mut context,
                GenericSolverVersion::RoutePortfolioV1,
                decision,
                &state,
                &next,
            );
        }
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
    Forecast {
        deterministic,
        completion: f64::from(completed),
        quality: if completed { quality } else { 0.0 },
        // Undelivered outcomes retain a small distance-to-go tie-break only.
        potential: if !completed {
            unfinished_potential(input, &state)
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

fn evaluate_proposal(
    input: Input<'_>,
    proposal_index: usize,
    proposal: CandidateProposal,
    samples: usize,
    horizon: usize,
    weights: &ConditionTransitionWeights,
    previews: &mut HashMap<CraftActionId, ActionPreview>,
    branches: &mut HashMap<CraftActionId, (BranchEvidence, Option<BranchEvidence>)>,
    cache: &mut ContinuationCache<'_>,
    work: &mut PortfolioWork,
) -> CandidateEvidence {
    let preview = *previews.entry(proposal.decision.action).or_insert_with(|| {
        preview_action(
            input.recipe,
            input.crafter,
            input.state,
            proposal.decision.action,
        )
    });
    let build_branches = || {
        (
            branch(input, &preview, true, preview.success_rate),
            (preview.success_rate < 1.0)
                .then(|| branch(input, &preview, false, 1.0 - preview.success_rate)),
        )
    };
    let (success, failure) = if input.resource_aware {
        branches
            .entry(proposal.decision.action)
            .or_insert_with(build_branches)
            .clone()
    } else {
        build_branches()
    };
    let mut total = Forecast::default();
    let condition_assignment = input
        .condition_work_scheduler
        .then(|| condition_scheduler::assignment(input, preview));
    let (completion_weight, floor_weight) = match input.risk {
        RiskPreference::Stable => (4.0, 1.0),
        RiskPreference::Balanced => (2.0, 0.5),
        RiskPreference::Aggressive => (1.0, 0.25),
    };
    let mut sample_values = vec![0.0; samples];
    for (succeeded, probability) in [
        (true, preview.success_rate),
        (false, 1.0 - preview.success_rate),
    ] {
        if probability <= 0.0 {
            continue;
        }
        for sample in 0..samples {
            let pilot_key = (proposal_index, succeeded, sample);
            let cache_forecast = input.resource_aware && (input.coordinated || sample == 0);
            let cached = cache_forecast
                .then(|| {
                    cache.pilot_forecasts.get(&pilot_key).copied().or_else(|| {
                        input
                            .coordinated
                            .then(|| {
                                cache
                                    .pilot_forecasts
                                    .get(&(proposal_index, succeeded, 0))
                                    .copied()
                            })
                            .flatten()
                            .filter(|f| f.deterministic)
                    })
                })
                .flatten();
            let result = if let Some(result) = cached {
                work.forecast_cache_hits += 1;
                result
            } else {
                let result = forecast(
                    input, &proposal, &preview, succeeded, sample, horizon, weights, cache, work,
                );
                if cache_forecast {
                    cache.pilot_forecasts.insert(pilot_key, result);
                }
                result
            };
            let weight = probability / samples as f64;
            total.completion += weight * result.completion;
            total.quality += weight * result.quality;
            total.potential += weight * result.potential;
            total.floor_loss += weight * result.floor_loss;
            total.actions += weight * result.actions;
            sample_values[sample] += probability
                * (completion_weight * result.completion + result.quality
                    - floor_weight * result.floor_loss
                    + 0.01 * result.potential);
        }
    }
    let score = completion_weight * total.completion + total.quality
        - floor_weight * total.floor_loss
        + 0.01 * total.potential;
    CandidateEvidence {
        proposal,
        preview,
        success,
        failure,
        completion_probability: total.completion,
        delivered_quality_utility: total.quality,
        unfinished_potential: total.potential,
        expected_actions: total.actions,
        forecast_samples: samples,
        forecast_horizon: horizon,
        score,
        condition_assignment,
        sample_values,
        selection_score: score,
        screened_out: false,
    }
}

/// When a colored turn offers productive work, defer an unfunded setup or
/// recovery action that gains nothing from this color and is mechanically
/// cheaper or longer-lived under another condition declared by the recipe.
/// This is condition-to-work dominance, not an action or recipe exception.
fn screen_misaligned_condition_work(input: Input<'_>, candidates: &mut [CandidateEvidence]) {
    if !input.condition_work_scheduler
        || matches!(
            input.state.condition,
            MaterialCondition::Normal | MaterialCondition::GoodOmen
        )
    {
        return;
    }
    let survives = |candidate: &CandidateEvidence| {
        candidate.success.completion != CompletionEvidence::TerminalFailure
            || candidate
                .failure
                .as_ref()
                .is_some_and(|branch| branch.completion != CompletionEvidence::TerminalFailure)
    };
    let has_capturing_work = candidates.iter().any(|candidate| {
        !candidate.screened_out
            && survives(candidate)
            && candidate
                .condition_assignment
                .is_some_and(|assignment| assignment.capture > 0.0)
    });
    if !has_capturing_work {
        return;
    }
    for candidate in candidates {
        let Some(assignment) = candidate.condition_assignment else {
            continue;
        };
        let deferrable = matches!(
            assignment.work,
            Some(
                ConditionWork::ProgressSetup
                    | ConditionWork::QualitySetup
                    | ConditionWork::Resource
            )
        );
        let funded_consumer = candidate
            .proposal
            .decision
            .route
            .is_some_and(|route| route.consumer.is_some())
            || !candidate.proposal.continuation_actions.is_empty();
        if !candidate.screened_out
            && deferrable
            && !funded_consumer
            && assignment.capture == 0.0
            && assignment.reservation > 0.0
        {
            candidate.screened_out = true;
        }
    }
}

/// A setup is purchased for a consumer, not merely for a better one-turn score.
/// Once that consumer is ready, unrelated unfunded work cannot abandon it. A
/// genuinely useful observed-condition job may still interrupt, and a complete
/// funded alternative or immediate terminal finish may replace the old route.
/// This preserves work ownership without routing whole objective families to a
/// different solver.
fn screen_abandoned_funded_work(input: Input<'_>, candidates: &mut [CandidateEvidence]) {
    if !input.condition_work_scheduler || !input.context.route_memory.matches(input.state) {
        return;
    }
    let Some(committed) = input
        .context
        .route_memory
        .suspended
        .or(input.context.route_memory.active)
    else {
        return;
    };
    let Some(consumer) = consumer_available(input, committed) else {
        return;
    };
    let viable_consumer = candidates.iter().any(|candidate| {
        !candidate.screened_out
            && candidate.proposal.decision.action == consumer
            && (candidate.success.completion != CompletionEvidence::TerminalFailure
                || candidate
                    .failure
                    .as_ref()
                    .is_some_and(|branch| branch.completion != CompletionEvidence::TerminalFailure))
    });
    if !viable_consumer {
        return;
    }
    for candidate in candidates {
        if candidate.screened_out || candidate.proposal.decision.action == consumer {
            continue;
        }
        let captures_observed_condition = !matches!(
            input.state.condition,
            MaterialCondition::Normal | MaterialCondition::GoodOmen
        ) && candidate
            .condition_assignment
            .is_some_and(|assignment| assignment.capture > 0.0);
        let owns_complete_work = !candidate.proposal.continuation_actions.is_empty()
            || candidate
                .proposal
                .decision
                .route
                .is_some_and(|route| route.consumer.is_some());
        let immediately_finishes = candidate.success.completion == CompletionEvidence::Completed;
        if !captures_observed_condition && !owns_complete_work && !immediately_finishes {
            candidate.screened_out = true;
        }
    }
}

// The leaf forecast does not observe route intent/interrupt bookkeeping. Keep
// those real-execution alternatives, but do not spend separate finalist slots
// or simulations on the same action, consumer and leaf-context transition.
fn equivalent_forecast(
    a: &CandidateProposal,
    b: &CandidateProposal,
    semantic_context_only: bool,
    observe_route_memory: bool,
) -> bool {
    let normalize = |mut decision: GenericDecision| {
        if let Some(route) = &mut decision.route {
            if !observe_route_memory {
                route.intent = RouteIntent::Recovery;
                route.interrupt = false;
            }
            if semantic_context_only && route.engine == ContinuationEngine::Semantic {
                // The semantic leaf reads only its typed five-field context.
                // Its root history update depends on action, not option/persona.
                decision.option = PlannerOption::BuildQuality;
                decision.persona = PlannerPersona::GuideContinuation;
            }
        }
        decision
    };
    normalize(a.decision) == normalize(b.decision)
        && a.continuation_actions == b.continuation_actions
}

pub(super) fn evaluate(
    input: Input<'_>,
    proposals: Vec<CandidateProposal>,
    work: &mut PortfolioWork,
    semantic_equivalence: bool,
    evaluation_budget: Option<PortfolioEvaluationBudget>,
) -> Vec<CandidateEvidence> {
    let default_weights = normal_weights();
    let weights = input.declared_condition_weights.unwrap_or(&default_weights);
    let mut previews = HashMap::new();
    let mut branches = HashMap::new();
    let mut candidates = Vec::new();
    let mut cache = ContinuationCache::new(input);
    let sole_proposal = proposals.len() == 1;
    let samples = evaluation_budget.map_or_else(
        || {
            if sole_proposal {
                1
            } else if input.recipe.required_quality > 0 {
                PORTFOLIO_SAMPLES
            } else {
                4
            }
        },
        PortfolioEvaluationBudget::samples,
    );
    let horizon = evaluation_budget
        .map_or_else(
            || {
                if sole_proposal { 1 } else { PORTFOLIO_HORIZON }
            },
            PortfolioEvaluationBudget::horizon,
        )
        .min(
            input
                .context
                .action_limit
                .saturating_sub(input.context.action_uses) as usize,
        );
    // Every option gets a common-stream pilot. When the portfolio grows,
    // preserve the reference and refine the strongest alternative; retain
    // screened evidence for diagnostics but never select it as a final result.
    let staged = evaluation_budget.is_none()
        && input.resource_aware
        && proposals.len() > if input.compact_comparison { 2 } else { 3 };
    let pilot_samples = if input.compact_comparison && proposals.len() == 3 {
        2
    } else {
        1
    };
    let finalist_samples = if staged && !input.coordinated {
        4
    } else {
        samples
    };
    let classes: Vec<usize> = (0..proposals.len())
        .map(|index| {
            if input.coordinated {
                (0..index)
                    .find(|&other| {
                        equivalent_forecast(
                            &proposals[index],
                            &proposals[other],
                            semantic_equivalence,
                            input.condition_work_scheduler,
                        )
                    })
                    .unwrap_or(index)
            } else {
                index
            }
        })
        .collect();
    for (index, proposal) in proposals.into_iter().enumerate() {
        candidates.push(evaluate_proposal(
            input,
            classes[index],
            proposal,
            if staged { pilot_samples } else { samples },
            horizon,
            weights,
            &mut previews,
            &mut branches,
            &mut cache,
            work,
        ));
    }
    if staged {
        let reference = selection::reference_index(input, &candidates);
        let mut ranked: Vec<usize> = (0..candidates.len()).collect();
        ranked.sort_by(|&a, &b| {
            let survives = |c: &CandidateEvidence| {
                c.success.completion != CompletionEvidence::TerminalFailure
                    || c.failure
                        .as_ref()
                        .is_some_and(|f| f.completion != CompletionEvidence::TerminalFailure)
            };
            survives(&candidates[b])
                .cmp(&survives(&candidates[a]))
                .then_with(|| candidates[b].score.total_cmp(&candidates[a].score))
                .then_with(|| {
                    candidates[a]
                        .expected_actions
                        .total_cmp(&candidates[b].expected_actions)
                })
                .then_with(|| a.cmp(&b))
        });
        let mut finalists = reference.into_iter().collect::<Vec<_>>();
        for index in ranked {
            if finalists.len() == 2 {
                break;
            }
            if !finalists
                .iter()
                .any(|&other| classes[other] == classes[index])
            {
                finalists.push(index);
            }
        }
        // Keep the strongest complete route alongside reference and ball
        // opportunity. A one-sample speed tie must not discard the funded plan.
        if input.condition_coordination {
            let funded = candidates
                .iter()
                .enumerate()
                .filter(|(_, c)| {
                    !c.proposal.continuation_actions.is_empty()
                        && c.proposal.sources.iter().any(|s| {
                            matches!(s, CandidateSource::Endgame | CandidateSource::Quality)
                        })
                })
                .max_by(|(_, a), (_, b)| a.score.total_cmp(&b.score))
                .map(|(index, _)| index);
            if let Some(index) = funded {
                if !finalists
                    .iter()
                    .any(|&other| classes[other] == classes[index])
                {
                    finalists.push(index);
                }
            }
        }
        if input.condition_work_scheduler {
            // A one-sample pilot may rank one color job poorly by chance. Keep
            // the strongest progress, quality, hybrid, setup and resource arm
            // so the final comparison can genuinely choose what this ball does.
            let intents = [
                RouteIntent::ProgressSetup,
                RouteIntent::ProgressBuild,
                RouteIntent::QualityBuild,
                RouteIntent::HybridWork,
                RouteIntent::BurstSetup,
                RouteIntent::Burst,
                RouteIntent::Finish,
                RouteIntent::Recovery,
            ];
            for intent in intents {
                let condition = candidates
                    .iter()
                    .enumerate()
                    .filter(|(_, candidate)| {
                        candidate
                            .proposal
                            .sources
                            .contains(&CandidateSource::Condition)
                            && candidate
                                .proposal
                                .decision
                                .route
                                .is_some_and(|route| route.intent == intent)
                    })
                    .max_by(|(_, left), (_, right)| left.score.total_cmp(&right.score))
                    .map(|(index, _)| index);
                if let Some(index) = condition {
                    if !finalists
                        .iter()
                        .any(|&other| classes[other] == classes[index])
                    {
                        finalists.push(index);
                    }
                }
            }
        }
        for (index, candidate) in candidates.iter_mut().enumerate() {
            if finalists
                .iter()
                .any(|&other| classes[other] == classes[index])
            {
                *candidate = evaluate_proposal(
                    input,
                    classes[index],
                    candidate.proposal.clone(),
                    finalist_samples,
                    horizon,
                    weights,
                    &mut previews,
                    &mut branches,
                    &mut cache,
                    work,
                );
            } else {
                candidate.screened_out = true;
            }
        }
    }
    screen_misaligned_condition_work(input, &mut candidates);
    screen_abandoned_funded_work(input, &mut candidates);
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equivalent_forecast_preserves_distinct_consumers_and_context_updates() {
        let a = CandidateProposal {
            decision: action_decision(CraftActionId::PreciseTouch, ContinuationEngine::Semantic),
            sources: vec![CandidateSource::Semantic],
            continuation_actions: vec![],
        };
        let mut b = a.clone();
        b.sources = vec![CandidateSource::Condition];
        b.decision.route.as_mut().unwrap().interrupt = true;
        assert!(equivalent_forecast(&a, &b, false, false));
        assert!(equivalent_forecast(&a, &b, true, false));
        assert!(!equivalent_forecast(&a, &b, false, true));
        b.decision.route.as_mut().unwrap().consumer = Some(CraftActionId::ByregotsBlessing);
        assert!(!equivalent_forecast(&a, &b, false, false));
        assert!(!equivalent_forecast(&a, &b, true, false));
        b = a.clone();
        b.decision.option = PlannerOption::FinishProgress;
        assert!(!equivalent_forecast(&a, &b, false, false));
        assert!(equivalent_forecast(&a, &b, true, false));
        let mut budgeted_a = a.clone();
        let mut budgeted_b = b.clone();
        budgeted_a.decision.route.as_mut().unwrap().engine = ContinuationEngine::Budgeted;
        budgeted_b.decision.route.as_mut().unwrap().engine = ContinuationEngine::Budgeted;
        assert!(!equivalent_forecast(&budgeted_a, &budgeted_b, true, false));
        b = a.clone();
        b.continuation_actions.push(CraftActionId::CarefulSynthesis);
        assert!(!equivalent_forecast(&a, &b, false, false));
        assert!(!equivalent_forecast(&a, &b, true, false));
    }

    #[test]
    fn continuation_cache_retains_full_keys_and_computes_when_full() {
        let recipe = RecipeProfile {
            canonical_recipe_id: 0,
            recipe_level: 746,
            progress_required: 10_000,
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
        let state = CraftState::initial(&recipe, &crafter);
        let context = PlannerContext::default();
        // Skipping forecast-only route bookkeeping must preserve all history
        // observed by either leaf, including no-step and failed actions.
        for &condition in MaterialCondition::ALL {
            let mut before = state.clone();
            before.step = 20;
            before.inner_quiet = 10;
            before.condition = condition;
            before.durability = 35;
            for &action in CraftActionId::ALL {
                if !preview_action(&recipe, &crafter, &before, action).legal {
                    continue;
                }
                for success in [true, false] {
                    let after = apply_observed_outcome(
                        &recipe,
                        &crafter,
                        &before,
                        action,
                        ObservedActionOutcome {
                            success,
                            next_condition: MaterialCondition::Normal,
                        },
                    )
                    .unwrap()
                    .next_state;
                    let decision = action_decision(action, ContinuationEngine::Semantic);
                    let mut full = context.clone();
                    let mut leaf = context.clone();
                    advance_planner_context(
                        &mut full,
                        GenericSolverVersion::RoutePortfolioV1,
                        decision,
                        &before,
                        &after,
                    );
                    advance_portfolio_leaf_context(&mut leaf, decision, &before, &after);
                    full.route_memory = leaf.route_memory.clone();
                    assert_eq!(full, leaf, "{condition:?}/{action:?}/{success}");
                    let mut other = context.clone();
                    let changed = GenericDecision {
                        option: PlannerOption::FinishProgress,
                        persona: PlannerPersona::OpportunityReserveGuide,
                        ..decision
                    };
                    advance_portfolio_leaf_context(&mut other, changed, &before, &after);
                    assert_eq!(
                        crate::ts_migration_port::SemanticContext::from(&full),
                        crate::ts_migration_port::SemanticContext::from(&other)
                    );
                }
            }
        }
        let input = Input {
            condition_coordination: false,
            resource_aware: false,
            completion_aware: false,
            condition_opportunities: false,
            condition_work_scheduler: false,
            condition_work_completion_guard: false,
            coordinated: false,
            construction: false,
            compact_comparison: false,
            robust_suffix: false,
            recipe: &recipe,
            crafter: &crafter,
            state: &state,
            context: &context,
            objective: GenericObjective {
                quality_maximum: recipe.quality_max,
                protected_quality_floor: recipe.quality_max,
                adaptive_completion: true,
                quality_utility_kind: QualityUtilityKind::ContinuousCollectability,
                quality_milestone_count: 1,
                quality_milestones: [recipe.quality_max, 0, 0, 0],
            },
            risk: RiskPreference::Balanced,
            random_condition_mask: Some(1),
            declared_condition_weights: None,
        };
        // A stochastic terminal finish is an exact expectation, not a lucky
        // success/failure sample. Include all conditions and the hard gate.
        for &condition in MaterialCondition::ALL {
            let mut terminal_state = state.clone();
            terminal_state.progress = recipe.progress_required - 1;
            terminal_state.quality = recipe.quality_max;
            terminal_state.durability = 1;
            terminal_state.cp = 7;
            terminal_state.condition = condition;
            let terminal_input = Input {
                state: &terminal_state,
                condition_coordination: true,
                resource_aware: true,
                coordinated: true,
                ..input
            };
            let preview = preview_action(
                &recipe,
                &crafter,
                &terminal_state,
                CraftActionId::RapidSynthesis,
            );
            let exact = terminal_pair(terminal_input, &terminal_state, &preview, 1).unwrap();
            let expected = if condition == MaterialCondition::Centered {
                0.75
            } else {
                0.5
            };
            assert_eq!(exact.completion, expected);
            assert_eq!(exact.quality, expected);
            let mut recoverable = terminal_state.clone();
            recoverable.durability = 60;
            let preview = preview_action(
                &recipe,
                &crafter,
                &recoverable,
                CraftActionId::RapidSynthesis,
            );
            assert!(terminal_pair(terminal_input, &recoverable, &preview, 1).is_none());
            let required = RecipeProfile {
                required_quality: recipe.quality_max,
                ..recipe
            };
            let mut no_quality = terminal_state.clone();
            no_quality.quality = 0;
            let preview = preview_action(
                &required,
                &crafter,
                &no_quality,
                CraftActionId::RapidSynthesis,
            );
            let failed = terminal_pair(
                Input {
                    recipe: &required,
                    ..terminal_input
                },
                &no_quality,
                &preview,
                1,
            )
            .unwrap();
            assert_eq!(failed.completion, 0.0);
            assert_eq!(failed.quality, 0.0);
            if condition == MaterialCondition::Normal {
                let proposal = CandidateProposal {
                    decision: action_decision(CraftActionId::Observe, ContinuationEngine::Semantic),
                    sources: vec![CandidateSource::Condition],
                    continuation_actions: vec![CraftActionId::RapidSynthesis],
                };
                let root =
                    preview_action(&recipe, &crafter, &terminal_state, CraftActionId::Observe);
                let mut cache = ContinuationCache::new(terminal_input);
                let mut work = PortfolioWork::default();
                for sample in 0..6 {
                    let f = forecast(
                        terminal_input,
                        &proposal,
                        &root,
                        true,
                        sample,
                        2,
                        &normal_weights(),
                        &mut cache,
                        &mut work,
                    );
                    assert_eq!(f.completion, 0.5);
                    assert_eq!(f.quality, 0.5);
                    assert_eq!(f.actions, 2.0);
                    assert!(f.deterministic);
                }
                assert_eq!(work.analytic_terminal_folds, 6);
            }
        }
        // Three choices used to cost more full forecasts than a larger portfolio.
        // v1.6 retains the reference and uses two common-stream pilot samples.
        for required_quality in [0, recipe.quality_max] {
            let comparison_recipe = RecipeProfile {
                required_quality,
                ..recipe
            };
            let bounded_context = PlannerContext {
                action_limit: 1,
                ..context.clone()
            };
            let comparison_input = Input {
                resource_aware: true,
                coordinated: true,
                compact_comparison: true,
                recipe: &comparison_recipe,
                context: &bounded_context,
                ..input
            };
            let proposals = [
                CraftActionId::BasicSynthesis,
                CraftActionId::CarefulSynthesis,
                CraftActionId::RapidSynthesis,
            ]
            .into_iter()
            .enumerate()
            .map(|(index, action)| CandidateProposal {
                decision: action_decision(action, ContinuationEngine::Semantic),
                sources: vec![if index == 0 {
                    CandidateSource::Semantic
                } else {
                    CandidateSource::Condition
                }],
                continuation_actions: vec![],
            })
            .collect::<Vec<_>>();
            let expected_samples = if required_quality > 0 {
                PORTFOLIO_SAMPLES
            } else {
                4
            };
            let compact = evaluate(
                comparison_input,
                proposals.clone(),
                &mut PortfolioWork::default(),
                false,
                None,
            );
            assert!(!compact[0].screened_out, "reference always retained");
            assert_eq!(compact.iter().filter(|c| !c.screened_out).count(), 2);
            let mut funded = proposals.clone();
            funded[1].sources = vec![CandidateSource::Endgame];
            funded[1].continuation_actions = vec![CraftActionId::BasicSynthesis];
            let preserved = evaluate(
                Input {
                    condition_coordination: true,
                    ..comparison_input
                },
                funded,
                &mut PortfolioWork::default(),
                false,
                None,
            );
            assert!(!preserved[0].screened_out);
            assert!(
                !preserved[1].screened_out,
                "funded route survives one-sample screening"
            );
            assert!(preserved.iter().filter(|c| !c.screened_out).count() <= 3);
            for candidate in &compact {
                assert_eq!(
                    candidate.forecast_samples,
                    if candidate.screened_out {
                        2
                    } else {
                        expected_samples
                    }
                );
            }
            let old = evaluate(
                Input {
                    compact_comparison: false,
                    ..comparison_input
                },
                proposals,
                &mut PortfolioWork::default(),
                false,
                None,
            );
            assert!(
                old.iter()
                    .all(|c| !c.screened_out && c.forecast_samples == expected_samples)
            );
        }
        let mut cache = ContinuationCache::new(input);
        let a = CandidateProposal {
            decision: action_decision(CraftActionId::BasicSynthesis, ContinuationEngine::Semantic),
            sources: vec![CandidateSource::Semantic],
            continuation_actions: vec![],
        };
        let mut b = a.clone();
        b.decision.option = PlannerOption::BuildQuality;
        let one_step_context = PlannerContext {
            action_limit: 1,
            ..context.clone()
        };
        let dedup_input = Input {
            resource_aware: true,
            coordinated: true,
            context: &one_step_context,
            ..input
        };
        let mut shared_work = PortfolioWork::default();
        let mut separate_work = PortfolioWork::default();
        let shared = evaluate(
            dedup_input,
            vec![a.clone(), b.clone()],
            &mut shared_work,
            true,
            None,
        );
        let separate = evaluate(dedup_input, vec![a, b], &mut separate_work, false, None);
        assert_eq!(
            shared, separate,
            "equivalent labels retain exact candidate evidence"
        );
        assert!(shared_work.projected_transitions < separate_work.projected_transitions);
        let mut fixed = CandidateProposal {
            decision: action_decision(CraftActionId::BasicSynthesis, ContinuationEngine::Semantic),
            sources: vec![CandidateSource::Progress],
            continuation_actions: vec![CraftActionId::BasicSynthesis; 20],
        };
        let preview = preview_action(&recipe, &crafter, &state, fixed.decision.action);
        let reference = forecast(
            input,
            &fixed,
            &preview,
            true,
            0,
            12,
            &normal_weights(),
            &mut cache,
            &mut PortfolioWork::default(),
        );
        assert!(reference.deterministic);
        for sample in 1..8 {
            assert_eq!(
                reference,
                forecast(
                    input,
                    &fixed,
                    &preview,
                    true,
                    sample,
                    12,
                    &normal_weights(),
                    &mut cache,
                    &mut PortfolioWork::default()
                )
            );
        }
        let mut uncertain = normal_weights();
        for row in &mut uncertain {
            row[MaterialCondition::Good.index()] = 1.0;
        }
        assert!(
            !forecast(
                input,
                &fixed,
                &preview,
                true,
                0,
                12,
                &uncertain,
                &mut cache,
                &mut PortfolioWork::default()
            )
            .deterministic
        );
        fixed.continuation_actions.clear();
        let mut work = PortfolioWork::default();
        let expected = continuation(input, ContinuationEngine::Semantic);
        assert_eq!(
            cache.recommend(&state, &context, ContinuationEngine::Semantic, &mut work),
            expected
        );
        assert_eq!(
            cache.recommend(&state, &context, ContinuationEngine::Semantic, &mut work),
            expected
        );
        assert_eq!(work.continuation_cache_hits, 1);
        let mut changed_state = state.clone();
        changed_state.condition = MaterialCondition::Good;
        let mut changed_context = context.clone();
        changed_context.route_memory.rebuilds = 1;
        for (state, context, engine) in [
            (&changed_state, &context, ContinuationEngine::Semantic),
            (&state, &changed_context, ContinuationEngine::Semantic),
            (&state, &context, ContinuationEngine::Budgeted),
        ] {
            assert_eq!(
                cache.recommend(state, context, engine, &mut work),
                continuation(
                    Input {
                        state,
                        context,
                        ..input
                    },
                    engine
                )
            );
        }
        assert_eq!(work.continuation_cache_hits, 1);
        assert_eq!(cache.entries.len(), 4);
        cache.entries.clear();
        for observed_transitions in 1..=4096 {
            cache.entries.insert(
                ContinuationKey {
                    state: state.clone(),
                    context: ContinuationContext::Full(PlannerContext {
                        observed_transitions,
                        ..context.clone()
                    }),
                    engine: ContinuationEngine::Semantic,
                },
                None,
            );
        }
        assert_eq!(
            cache.recommend(&state, &context, ContinuationEngine::Semantic, &mut work),
            expected
        );
        assert_eq!(cache.entries.len(), 4096);
        assert_eq!(work.continuation_cache_hits, 1);
        let cached_null = PlannerContext {
            observed_transitions: 1,
            ..context.clone()
        };
        assert_eq!(
            cache.recommend(
                &state,
                &cached_null,
                ContinuationEngine::Semantic,
                &mut work
            ),
            None
        );
        assert_eq!(work.continuation_cache_hits, 2);

        let mut compact = ContinuationCache::new(Input {
            resource_aware: true,
            ..input
        });
        let mut compact_work = PortfolioWork::default();
        for engine in [ContinuationEngine::Semantic, ContinuationEngine::Budgeted] {
            let expected = continuation(input, engine);
            assert_eq!(
                compact.recommend(&state, &context, engine, &mut compact_work),
                expected
            );
            let mut memory_only = context.clone();
            memory_only.route_memory.rebuilds = 7;
            assert_eq!(
                compact.recommend(&state, &memory_only, engine, &mut compact_work),
                expected
            );
        }
        assert_eq!(compact_work.continuation_cache_hits, 2);
        let mut irrelevant = context.clone();
        irrelevant.observed_transitions = 19;
        irrelevant.action_uses = 22;
        assert_eq!(
            compact.recommend(
                &state,
                &irrelevant,
                ContinuationEngine::Semantic,
                &mut compact_work
            ),
            expected
        );
        assert_eq!(compact_work.continuation_cache_hits, 3);
        for depth in [0, 1, 2, 7] {
            let expected = deterministic_completion_first(&recipe, &crafter, &state, depth);
            assert_eq!(compact.finish(&state, depth, &mut compact_work), expected);
            assert_eq!(compact.finish(&state, depth, &mut compact_work), expected);
        }
        assert_eq!(compact_work.completion_cache_hits, 4);
        assert_eq!(compact.finish_entries.len(), 4);
        let mut relevant = context.clone();
        relevant.manipulation_uses = 3;
        assert_eq!(
            compact.recommend(
                &state,
                &relevant,
                ContinuationEngine::Semantic,
                &mut compact_work
            ),
            continuation(
                Input {
                    context: &relevant,
                    ..input
                },
                ContinuationEngine::Semantic
            )
        );
        assert_eq!(compact_work.continuation_cache_hits, 3);
    }
}
