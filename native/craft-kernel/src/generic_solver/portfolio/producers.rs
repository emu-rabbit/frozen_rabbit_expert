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
            continuation_actions: Vec::new(),
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

fn add_funded_suffix(
    proposals: &mut Vec<CandidateProposal>,
    actions: &[CraftActionId],
    engine: ContinuationEngine,
    source: CandidateSource,
) {
    let mut decision = action_decision(actions[0], engine);
    // Unlike a two-action heuristic, a verified whole suffix may legitimately
    // start with setup -> setup. Its subsequent consumer is already funded.
    if let Some(&consumer) = actions.get(1) {
        let route = decision.route.as_mut().unwrap();
        route.setup = Some(actions[0]);
        route.consumer = Some(consumer);
    }
    add(proposals, decision, source);
    proposals
        .iter_mut()
        .find(|p| p.decision == decision)
        .unwrap()
        .continuation_actions = actions[1..].to_vec();
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
    // A legal, certain, one-action maximum-quality delivery attains the upper
    // bound of every objective. No stochastic search can improve its outcome.
    if input.coordinated {
        if let Some(action) = maximum_delivery_action(input) {
            add(
                &mut proposals,
                action_decision(action, ContinuationEngine::Semantic),
                CandidateSource::Progress,
            );
            return proposals;
        }
    }
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
    if input.construction && input.state.step == 1 {
        for action in [CraftActionId::Reflect, CraftActionId::MuscleMemory] {
            if preview_action(input.recipe, input.crafter, input.state, action).legal {
                add(
                    &mut proposals,
                    action_decision(action, engine),
                    CandidateSource::Opening,
                );
            }
        }
    }
    if input.construction
        && input.state.step > 1
        && input.state.quality < input.recipe.quality_max
        && input.state.inner_quiet < 10
    {
        // IQ construction is a shared capability, including Normal. A ball's
        // resource investment must compete with productive uses of that turn.
        for action in [CraftActionId::PreparatoryTouch, CraftActionId::PrudentTouch] {
            if preview_action(input.recipe, input.crafter, input.state, action).legal {
                add(
                    &mut proposals,
                    action_decision(action, engine),
                    CandidateSource::Quality,
                );
            }
        }
        let combo: &[CraftActionId] = match input.state.combo_from {
            Some(CraftActionId::BasicTouch) => {
                &[CraftActionId::StandardTouch, CraftActionId::AdvancedTouch]
            }
            Some(CraftActionId::StandardTouch) => &[CraftActionId::AdvancedTouch],
            _ => &[
                CraftActionId::BasicTouch,
                CraftActionId::StandardTouch,
                CraftActionId::AdvancedTouch,
            ],
        };
        let mut state = input.state.clone();
        let mut prefix = Vec::new();
        let remaining = input
            .context
            .action_limit
            .saturating_sub(input.context.action_uses) as usize;
        for &action in combo.iter().take(remaining) {
            let Some(next) = branch_state(input.recipe, input.crafter, &state, action, true) else {
                break;
            };
            if next.terminal != CraftTerminal::None {
                break;
            }
            prefix.push(action);
            state = next;
            if state.quality >= input.recipe.quality_max {
                break;
            }
        }
        if !prefix.is_empty() {
            // This is an affordable quality prefix, not a delivery certificate.
            // Its remaining craft is evaluated by the common stochastic scorer.
            add_funded_suffix(&mut proposals, &prefix, engine, CandidateSource::Quality);
        }
    }
    // Offer quality together with its funded finish, rather than a locally
    // attractive touch that may strand the craft later.
    let mut funded_maximum = false;
    if input.resource_aware && input.state.quality < input.recipe.quality_max {
        work.producer_calls += 1;
        let remaining = input
            .context
            .action_limit
            .saturating_sub(input.context.action_uses) as usize;
        if let Some(actions) = crate::ts_migration_port::maximum_quality_finish_actions(
            input.recipe,
            input.crafter,
            input.state,
            remaining,
        ) {
            let decision = if input.coordinated {
                add_funded_suffix(&mut proposals, &actions, engine, CandidateSource::Quality);
                funded_maximum = true;
                None
            } else if actions.len() > 1 {
                prepared_decision(input, actions[0], actions[1], engine, false)
            } else {
                Some(action_decision(actions[0], engine))
            };
            if let Some(decision) = decision {
                add(&mut proposals, decision, CandidateSource::Quality);
                proposals
                    .iter_mut()
                    .find(|p| p.decision == decision)
                    .unwrap()
                    .continuation_actions = actions[1..].to_vec();
            }
        }
    }
    // The beam fills gaps where the cheaper complete-quality capability has
    // no witness. Do not search a second Normal suffix after reaching its
    // objective upper bound; the retained witness is still sampled normally.
    if input.coordinated && !funded_maximum {
        work.producer_calls += 1;
        if let Some(actions) = endgame::plan(input, work) {
            add_funded_suffix(&mut proposals, &actions, engine, CandidateSource::Endgame);
        }
    }
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
    if input.resource_aware {
        condition_opportunities(input, engine, &mut proposals, work);
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
            && (!input.resource_aware || !resource_only_noop(input, entry.decision.action))
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

pub(super) fn maximum_delivery_action(input: Input<'_>) -> Option<CraftActionId> {
    CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            if action_definition(action).category != ActionCategory::Progress {
                return None;
            }
            let preview = preview_action(input.recipe, input.crafter, input.state, action);
            if !preview.legal
                || preview.success_rate != 1.0
                || i64::from(input.state.progress) + i64::from(preview.progress_gain)
                    < i64::from(input.recipe.progress_required)
                || i64::from(input.state.quality) + i64::from(preview.quality_gain)
                    < i64::from(input.recipe.quality_max)
            {
                return None;
            }
            let next = branch_state(input.recipe, input.crafter, input.state, action, true)?;
            (next.terminal == CraftTerminal::Completed && next.quality >= input.recipe.quality_max)
                .then_some((action, preview.cp_cost, preview.durability_cost))
        })
        .min_by_key(|&(action, cp, durability)| (cp, durability, action))
        .map(|(action, ..)| action)
}

/// Observed resource opportunities compete on delivered outcomes, not a fixed
/// priority or lifetime use count. The declared condition world still drives
/// their continuation forecasts; no recipe or equipment identity is consulted.
fn condition_opportunities(
    input: Input<'_>,
    engine: ContinuationEngine,
    proposals: &mut Vec<CandidateProposal>,
    work: &mut PortfolioWork,
) {
    let actions: &[CraftActionId] = match input.state.condition {
        MaterialCondition::Pliant => &[
            CraftActionId::Manipulation,
            CraftActionId::WasteNot,
            CraftActionId::WasteNot2,
            CraftActionId::MastersMend,
            CraftActionId::ImmaculateMend,
            CraftActionId::Innovation,
            CraftActionId::Veneration,
            CraftActionId::GreatStrides,
        ],
        MaterialCondition::Primed => &[
            CraftActionId::Manipulation,
            CraftActionId::WasteNot,
            CraftActionId::WasteNot2,
            CraftActionId::Innovation,
            CraftActionId::Veneration,
            CraftActionId::GreatStrides,
        ],
        // Good's IQ-building, CP and progress choices are already independent
        // proposals above; expose the quality cashout alongside them.
        MaterialCondition::Good => &[
            CraftActionId::ByregotsBlessing,
            CraftActionId::PreparatoryTouch,
        ],
        MaterialCondition::GoodOmen => &[
            CraftActionId::GreatStrides,
            CraftActionId::Innovation,
            CraftActionId::Veneration,
            CraftActionId::Observe,
        ],
        MaterialCondition::Centered => &[
            CraftActionId::HastyTouch,
            CraftActionId::DaringTouch,
            CraftActionId::RapidSynthesis,
        ],
        MaterialCondition::Sturdy | MaterialCondition::Robust => &[
            CraftActionId::PreparatoryTouch,
            CraftActionId::Groundwork,
            CraftActionId::DelicateSynthesis,
        ],
        MaterialCondition::Malleable => &[
            CraftActionId::Groundwork,
            CraftActionId::CarefulSynthesis,
            CraftActionId::RapidSynthesis,
            CraftActionId::IntensiveSynthesis,
            CraftActionId::DelicateSynthesis,
        ],
        // Normal uses ordinary quality/progress/resource and funded-route
        // proposals. It receives no fabricated condition bonus.
        MaterialCondition::Normal => return,
    };
    work.producer_calls += 1;
    for &action in actions {
        let preview = preview_action(input.recipe, input.crafter, input.state, action);
        if !preview.legal {
            continue;
        }
        let Some(after) = branch_state(input.recipe, input.crafter, input.state, action, true)
        else {
            continue;
        };
        let useful = match action {
            CraftActionId::Manipulation => {
                after.buffs.manipulation > input.state.buffs.manipulation
            }
            CraftActionId::WasteNot | CraftActionId::WasteNot2 => {
                after.buffs.waste_not > input.state.buffs.waste_not
            }
            CraftActionId::Innovation => {
                input.state.quality < input.recipe.quality_max
                    && after.buffs.innovation > input.state.buffs.innovation
            }
            CraftActionId::Veneration => after.buffs.veneration > input.state.buffs.veneration,
            CraftActionId::GreatStrides => {
                input.state.quality < input.recipe.quality_max
                    && after.buffs.great_strides > input.state.buffs.great_strides
            }
            CraftActionId::MastersMend | CraftActionId::ImmaculateMend => {
                after.durability > input.state.durability
            }
            CraftActionId::Observe => true,
            _ => {
                preview.progress_gain > 0
                    || (preview.quality_gain > 0 && input.state.quality < input.recipe.quality_max)
            }
        };
        if !useful {
            continue;
        }
        let mut decision = action_decision(action, engine);
        decision.route.as_mut().unwrap().interrupt = true;
        add(proposals, decision, CandidateSource::Condition);
    }
}

pub(super) fn best_effort(input: Input<'_>) -> Option<CraftActionId> {
    legal_actions(input.recipe, input.crafter, input.state)
        .into_iter()
        .filter(|action| !input.resource_aware || !resource_only_noop(input, *action))
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

/// A no-step action that changes nothing except spending CP cannot create
/// an opportunity. Keep this independent of action/recipe/equipment identity.
fn resource_only_noop(input: Input<'_>, action: CraftActionId) -> bool {
    let definition = action_definition(action);
    if !definition.no_step {
        return false;
    }
    if definition.rerolls_condition {
        let known_same_condition = input.condition_weights.map_or(
            input.random_condition_mask == Some(1)
                && input.state.condition == MaterialCondition::Normal,
            |weights| {
                let row = &weights[input.state.condition.index()];
                row[input.state.condition.index()] > 0.0
                    && row.iter().enumerate().all(|(index, &weight)| {
                        index == input.state.condition.index() || weight == 0.0
                    })
            },
        );
        if !known_same_condition {
            return false;
        }
        let Ok(after) = apply_observed_outcome(
            input.recipe,
            input.crafter,
            input.state,
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: input.state.condition,
            },
        ) else {
            return false;
        };
        let mut next = after.next_state;
        next.cp = input.state.cp;
        next.careful_observation_uses_left = input.state.careful_observation_uses_left;
        return next == *input.state;
    }
    let Some(mut next) = branch_state(input.recipe, input.crafter, input.state, action, true)
    else {
        return false;
    };
    if next.cp > input.state.cp {
        return false;
    }
    next.cp = input.state.cp;
    next == *input.state
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
            resource_aware: false,
            coordinated: false,
            construction: false,
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
        assert!(!resource_only_noop(input, CraftActionId::FinalAppraisal));
        assert!(resource_only_noop(input, CraftActionId::CarefulObservation));
        assert!(!resource_only_noop(
            Input {
                random_condition_mask: Some(0x1ff),
                ..input
            },
            CraftActionId::CarefulObservation
        ));
        let mut active = state.clone();
        active.buffs.final_appraisal = 5;
        assert!(resource_only_noop(
            Input {
                state: &active,
                ..input
            },
            CraftActionId::FinalAppraisal
        ));
        active.buffs.final_appraisal = 4;
        assert!(!resource_only_noop(
            Input {
                state: &active,
                ..input
            },
            CraftActionId::FinalAppraisal
        ));
        let mut finishing = state.clone();
        finishing.step = 20;
        finishing.progress = recipe.progress_required - 1;
        finishing.quality = recipe.quality_max;
        finishing.cp = 0;
        finishing.durability = 5;
        for &condition in MaterialCondition::ALL {
            finishing.condition = condition;
            let projected = Input {
                state: &finishing,
                resource_aware: true,
                coordinated: true,
                ..input
            };
            let action = maximum_delivery_action(projected).expect("maximum-quality delivery");
            let next = branch_state(&recipe, &crafter, &finishing, action, true).unwrap();
            assert_eq!(next.terminal, CraftTerminal::Completed);
            assert_eq!(next.quality, recipe.quality_max);
            let mut work = PortfolioWork::default();
            let candidates = collect(projected, &mut work);
            assert_eq!(candidates.len(), 1);
            assert_eq!(candidates[0].decision.action, action);
            assert_eq!(work.producer_calls, 0);
        }
        finishing.buffs.final_appraisal = 5;
        assert!(
            maximum_delivery_action(Input {
                state: &finishing,
                ..input
            })
            .is_none()
        );
        finishing.buffs.final_appraisal = 0;
        finishing.quality = 0;
        assert!(
            maximum_delivery_action(Input {
                state: &finishing,
                ..input
            })
            .is_none()
        );
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
