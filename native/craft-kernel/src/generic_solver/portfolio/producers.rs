use super::*;

fn add(proposals: &mut Vec<CandidateProposal>, decision: GenericDecision, source: CandidateSource) {
    if let Some(existing) = proposals
        .iter_mut()
        .find(|entry| entry.decision == decision)
    {
        if !existing.sources.contains(&source) {
            existing.sources.push(source);
        }
    } else {
        proposals.push(CandidateProposal {
            decision,
            sources: vec![source],
        });
    }
}

fn prepared_decision(
    input: Input<'_>,
    setup: CraftActionId,
    consumer: CraftActionId,
    engine: ContinuationEngine,
    interrupt: bool,
) -> Option<GenericDecision> {
    if input.context.action_uses + 1 >= input.context.action_limit {
        return None;
    }
    let prepared = branch_state(input.recipe, input.crafter, input.state, setup, true)?;
    if prepared.terminal != CraftTerminal::None {
        return None;
    }
    let preview = preview_action(input.recipe, input.crafter, &prepared, consumer);
    if !preview.legal {
        return None;
    }
    let consumes_setup = match setup {
        CraftActionId::Veneration | CraftActionId::MuscleMemory => preview.progress_gain > 0,
        CraftActionId::Innovation
        | CraftActionId::QuickInnovation
        | CraftActionId::GreatStrides => preview.quality_gain > 0,
        CraftActionId::TrainedPerfection => action_definition(consumer).durability_cost > 0,
        CraftActionId::HeartAndSoul => !action_definition(consumer).requires_conditions.is_empty(),
        _ => true,
    };
    if !consumes_setup {
        return None;
    }
    let mut decision = action_decision(setup, engine);
    decision.route = Some(RoutePlan {
        intent: intent(consumer),
        engine,
        setup: Some(setup),
        consumer: Some(consumer),
        interrupt,
    });
    Some(decision)
}

fn expand(
    input: Input<'_>,
    base: GenericDecision,
    engine: ContinuationEngine,
    source: CandidateSource,
    proposals: &mut Vec<CandidateProposal>,
    work: &mut PortfolioWork,
) {
    let mut decision = attach_route(base, engine);
    // A setup proposal owns the action that spends its resource. Its continuation
    // is recomputed from an isolated state/context after that setup.
    if matches!(
        base.action,
        CraftActionId::Innovation
            | CraftActionId::GreatStrides
            | CraftActionId::Veneration
            | CraftActionId::TrainedPerfection
            | CraftActionId::HeartAndSoul
            | CraftActionId::QuickInnovation
    ) {
        if let Some(prepared) =
            branch_state(input.recipe, input.crafter, input.state, base.action, true)
        {
            let mut context = input.context.clone();
            advance_planner_context(
                &mut context,
                GenericSolverVersion::RoutePortfolioV1,
                decision,
                input.state,
                &prepared,
            );
            work.producer_calls += 1;
            if let Some(next) = continuation(
                Input {
                    state: &prepared,
                    context: &context,
                    ..input
                },
                engine,
            ) {
                if let Some(funded) =
                    prepared_decision(input, base.action, next.action, engine, false)
                {
                    decision.route = funded.route;
                }
            }
        }
    }
    add(proposals, decision, source);

    if let Some(setup) = specialist_quality_opportunity_action(
        input.recipe,
        input.crafter,
        input.state,
        input.objective,
        input.context,
        base.action,
        true,
    ) {
        if let Some(prepared) = prepared_decision(input, setup, base.action, engine, false) {
            add(proposals, prepared, CandidateSource::Specialist);
        }
    }
    if let Some(setup) = progress_quality_shield_action(
        input.recipe,
        input.crafter,
        input.state,
        input.objective,
        input.context,
        base.action,
    ) {
        if let Some(prepared) = branch_state(input.recipe, input.crafter, input.state, setup, true)
        {
            if let Some(consumer) = best_quality_action(
                input.recipe,
                input.crafter,
                &prepared,
                input.objective,
                input.risk,
                input.context,
            ) {
                if let Some(funded) = prepared_decision(input, setup, consumer, engine, false) {
                    add(proposals, funded, CandidateSource::Quality);
                }
            }
        }
    }
    if let Some(action) = premature_finish_progress_bank_action(
        input.recipe,
        input.crafter,
        input.state,
        input.objective,
        input.context,
        base.action,
    ) {
        add(
            proposals,
            action_decision(action, engine),
            CandidateSource::Progress,
        );
    }
}

pub(super) fn collect(input: Input<'_>, work: &mut PortfolioWork) -> Vec<CandidateProposal> {
    let mut proposals = Vec::new();
    work.producer_calls += 1;
    let semantic = continuation(input, ContinuationEngine::Semantic);
    if let Some(base) = semantic {
        expand(
            input,
            base,
            ContinuationEngine::Semantic,
            CandidateSource::Semantic,
            &mut proposals,
            work,
        );
    }
    if condition_set_portfolio_uses_budgeted_condition(
        input.recipe,
        input.risk,
        input.random_condition_mask,
    ) {
        work.producer_calls += 1;
        if let Some(base) = continuation(input, ContinuationEngine::Budgeted) {
            expand(
                input,
                base,
                ContinuationEngine::Budgeted,
                CandidateSource::Budgeted,
                &mut proposals,
                work,
            );
        }
    }

    if input.context.route_memory.matches(input.state) {
        for route in [
            input.context.route_memory.active,
            input.context.route_memory.suspended,
        ]
        .into_iter()
        .flatten()
        {
            if let Some(action) = consumer_available(input, route) {
                let mut decision = action_decision(action, route.engine);
                decision.route = Some(RoutePlan {
                    setup: None,
                    consumer: None,
                    interrupt: false,
                    ..route
                });
                add(&mut proposals, decision, CandidateSource::Route);
            }
        }
    }

    let engine = if condition_set_portfolio_uses_budgeted_condition(
        input.recipe,
        input.risk,
        input.random_condition_mask,
    ) {
        ContinuationEngine::Budgeted
    } else {
        ContinuationEngine::Semantic
    };
    // Completion is an independent capability. A funded finish remains visible
    // even when another producer is still preparing quality or recovering CP.
    let finish = CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            let preview = preview_action(input.recipe, input.crafter, input.state, action);
            if !preview.legal || preview.success_rate != 1.0 || preview.progress_gain <= 0 {
                return None;
            }
            let next = branch_state(input.recipe, input.crafter, input.state, action, true)?;
            (next.terminal == CraftTerminal::Completed).then_some((
                action,
                next.quality,
                preview.cp_cost,
                preview.durability_cost,
            ))
        })
        .max_by(|a, b| {
            a.1.cmp(&b.1)
                .then_with(|| b.2.cmp(&a.2))
                .then_with(|| b.3.cmp(&a.3))
                .then_with(|| b.0.cmp(&a.0))
        });
    if let Some((action, ..)) = finish {
        add(
            &mut proposals,
            action_decision(action, engine),
            CandidateSource::Progress,
        );
    }
    if input.state.condition == MaterialCondition::Good {
        for action in [
            CraftActionId::PreciseTouch,
            CraftActionId::IntensiveSynthesis,
            CraftActionId::TricksOfTheTrade,
        ] {
            let preview = preview_action(input.recipe, input.crafter, input.state, action);
            if !preview.legal
                || (action == CraftActionId::TricksOfTheTrade
                    && input.state.cp > input.crafter.max_cp - 20)
                || (action == CraftActionId::PreciseTouch
                    && input.state.quality >= input.recipe.quality_max)
            {
                continue;
            }
            let mut decision = action_decision(action, engine);
            decision.route.as_mut().unwrap().interrupt = true;
            add(&mut proposals, decision, CandidateSource::Condition);
        }
    }
    if let Some(action) = select_recovery(
        input.recipe,
        input.crafter,
        input.state,
        input.objective,
        input.risk,
        input.context,
    ) {
        let mut decision = action_decision(action, engine);
        decision.route.as_mut().unwrap().interrupt = true;
        add(&mut proposals, decision, CandidateSource::Resource);
    }
    if semantic.is_none() {
        if let Some(setup) =
            specialist_null_recovery_action(input.recipe, input.crafter, input.state, input.context)
        {
            if let Some(decision) =
                prepared_decision(input, setup, CraftActionId::TricksOfTheTrade, engine, true)
            {
                add(&mut proposals, decision, CandidateSource::Specialist);
            }
        }
    }
    proposals.retain(|entry| {
        preview_action(
            input.recipe,
            input.crafter,
            input.state,
            entry.decision.action,
        )
        .legal
    });
    // Candidate construction has a finite semantic bound; duplicates merge only
    // when both action and continuation agree. Sources carry no voting weight.
    assert!(proposals.len() <= PORTFOLIO_MAX_CANDIDATES);
    if proposals.is_empty() {
        if let Some(action) = best_effort(input) {
            add(
                &mut proposals,
                action_decision(action, engine),
                CandidateSource::BestEffort,
            );
        }
    }
    proposals
}

pub(super) fn best_effort(input: Input<'_>) -> Option<CraftActionId> {
    legal_actions(input.recipe, input.crafter, input.state)
        .into_iter()
        .max_by(|left, right| {
            let rank = |action| {
                let preview = preview_action(input.recipe, input.crafter, input.state, action);
                let next =
                    branch_state(input.recipe, input.crafter, input.state, action, true).unwrap();
                let value = preview.success_rate
                    * (f64::from(preview.quality_gain)
                        / f64::from(input.recipe.quality_max.max(1))
                        + f64::from(preview.progress_gain)
                            / f64::from(input.recipe.progress_required.max(1)));
                let recovery = (next.cp - input.state.cp).max(0)
                    + (next.durability - input.state.durability).max(0);
                (
                    next.terminal == CraftTerminal::Completed,
                    next.terminal != CraftTerminal::Failed,
                    value,
                    recovery,
                )
            };
            let a = rank(*left);
            let b = rank(*right);
            a.0.cmp(&b.0)
                .then(a.1.cmp(&b.1))
                .then(a.2.total_cmp(&b.2))
                .then(a.3.cmp(&b.3))
                .then_with(|| right.cmp(left))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_consumer_uses_the_funded_effect() {
        let recipe = RecipeProfile {
            canonical_recipe_id: 1,
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
        let input = Input {
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
            condition_weights: None,
        };
        let prepare = |setup, consumer| {
            prepared_decision(input, setup, consumer, ContinuationEngine::Semantic, false)
        };
        assert!(prepare(CraftActionId::Veneration, CraftActionId::BasicSynthesis).is_some());
        assert!(prepare(CraftActionId::Veneration, CraftActionId::BasicTouch).is_none());
        assert!(prepare(CraftActionId::Innovation, CraftActionId::BasicTouch).is_some());
        assert!(prepare(CraftActionId::Innovation, CraftActionId::BasicSynthesis).is_none());
        assert!(prepare(CraftActionId::TrainedPerfection, CraftActionId::BasicTouch).is_some());
        assert!(prepare(CraftActionId::TrainedPerfection, CraftActionId::Innovation).is_none());
    }

    #[test]
    fn same_action_keeps_distinct_consumers_and_merges_only_identical_routes() {
        let mut proposals = Vec::new();
        let mut first =
            action_decision(CraftActionId::QuickInnovation, ContinuationEngine::Semantic);
        first.route.as_mut().unwrap().consumer = Some(CraftActionId::ByregotsBlessing);
        let mut second = first;
        second.route.as_mut().unwrap().consumer = Some(CraftActionId::PreciseTouch);
        add(&mut proposals, first, CandidateSource::Semantic);
        add(&mut proposals, first, CandidateSource::Specialist);
        add(&mut proposals, first, CandidateSource::Semantic);
        add(&mut proposals, second, CandidateSource::Specialist);
        assert_eq!(proposals.len(), 2);
        assert_eq!(
            proposals[0].sources,
            [CandidateSource::Semantic, CandidateSource::Specialist]
        );
        assert_ne!(proposals[0].decision.route, proposals[1].decision.route);
    }
}
