use frozen_rabbit_craft_kernel::*;

fn fixture(required_quality: i32) -> (RecipeProfile, CrafterProfile, GenericObjective) {
    let recipe = RecipeProfile {
        canonical_recipe_id: 36_990,
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
        craftsmanship: 5_408,
        control: 5_237,
        max_cp: 749,
        cosmic_tool_good_bonus: true,
        specialist: true,
    };
    let objective = GenericObjective {
        quality_maximum: recipe.quality_max,
        protected_quality_floor: recipe.quality_max,
        adaptive_completion: required_quality == 0,
        quality_utility_kind: if required_quality > 0 {
            QualityUtilityKind::HardQualityMaximum
        } else {
            QualityUtilityKind::ContinuousCollectability
        },
        quality_milestone_count: 1,
        quality_milestones: [recipe.quality_max, 0, 0, 0],
    };
    (recipe, crafter, objective)
}

fn weights() -> ConditionTransitionWeights {
    let mut result = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut result {
        row[MaterialCondition::Normal.index()] = 1.0;
    }
    result
}

fn recommend(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
) -> PortfolioRecommendation {
    recommend_route_portfolio(
        recipe,
        crafter,
        state,
        objective,
        RiskPreference::Balanced,
        context,
        Some(1),
        Some(&weights()),
    )
}

#[test]
fn forecasts_are_repeatable_isolated_and_recipe_identity_independent() {
    let (recipe, crafter, objective) = fixture(14_900);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.progress = 9_800;
    state.quality = 15_000;
    state.inner_quiet = 10;
    state.durability = 20;
    state.cp = 80;
    state.condition = MaterialCondition::Good;
    let context = PlannerContext {
        action_uses: 19,
        ..PlannerContext::default()
    };
    let before = context.clone();
    let first = recommend(&recipe, &crafter, &state, objective, &context);
    assert!(first.candidates.len() >= 2);
    assert_eq!(context, before, "forecasting is read-only");
    assert_eq!(
        first,
        recommend(&recipe, &crafter, &state, objective, &context)
    );
    let renamed = RecipeProfile {
        canonical_recipe_id: 123_456,
        ..recipe
    };
    assert_eq!(
        first,
        recommend(&renamed, &crafter, &state, objective, &context)
    );
    assert_eq!(
        first.decision,
        recommend_generic_action_with_model(
            GenericSolverVersion::RoutePortfolioV1,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Balanced,
            &context,
            Some(1),
            Some(&weights())
        )
    );
    for candidate in &first.candidates {
        assert!(candidate.preview.legal);
        assert!(candidate.proposal.decision.route.is_some());
        assert!(candidate.score.is_finite());
    }
    assert!(first.work.proposals <= PORTFOLIO_MAX_CANDIDATES);
    assert!(
        first.work.projected_transitions
            <= first.work.proposals * 2 * PORTFOLIO_SAMPLES * PORTFOLIO_HORIZON
    );
}

#[test]
fn risky_first_action_keeps_its_failure_mass() {
    let (mut recipe, crafter, mut objective) = fixture(0);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.quality = recipe.quality_max;
    state.durability = 10;
    state.cp = 0;
    state.trained_perfection_available = false;
    state.heart_and_soul_available = false;
    state.quick_innovation_available = false;
    state.careful_observation_uses_left = 0;
    let rapid = preview_action(&recipe, &crafter, &state, CraftActionId::RapidSynthesis);
    recipe.progress_required = rapid.progress_gain;
    objective.quality_maximum = recipe.quality_max;
    let result = recommend(
        &recipe,
        &crafter,
        &state,
        objective,
        &PlannerContext::default(),
    );
    let selected = result.decision.unwrap();
    assert_eq!(selected.action, CraftActionId::RapidSynthesis);
    let evidence = result
        .candidates
        .iter()
        .find(|entry| entry.proposal.decision == selected)
        .unwrap();
    assert_eq!(evidence.completion_probability, rapid.success_rate);
    assert_eq!(
        evidence.failure.as_ref().unwrap().probability,
        1.0 - rapid.success_rate
    );
    assert_eq!(
        evidence.failure.as_ref().unwrap().completion,
        CompletionEvidence::TerminalFailure
    );
}

fn observe(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    context: &mut PlannerContext,
    before: &CraftState,
    decision: GenericDecision,
    condition: MaterialCondition,
) -> CraftState {
    let after = apply_observed_outcome(
        recipe,
        crafter,
        before,
        decision.action,
        ObservedActionOutcome {
            success: true,
            next_condition: condition,
        },
    )
    .unwrap()
    .next_state;
    advance_planner_context(
        context,
        GenericSolverVersion::RoutePortfolioV1,
        decision,
        before,
        &after,
    );
    after
}

#[test]
fn setup_consumer_survives_a_condition_interrupt_and_manual_deviation_rebuilds() {
    let (recipe, crafter, objective) = fixture(14_900);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 12;
    state.progress = 8_500;
    state.quality = 12_000;
    state.inner_quiet = 10;
    state.cp = 100;
    state.condition = MaterialCondition::Good;
    let mut context = PlannerContext::default();
    let setup = GenericDecision {
        action: CraftActionId::QuickInnovation,
        option: PlannerOption::BuildQuality,
        persona: PlannerPersona::GuideContinuation,
        route: Some(RoutePlan {
            intent: RouteIntent::Burst,
            engine: ContinuationEngine::Semantic,
            setup: Some(CraftActionId::QuickInnovation),
            consumer: Some(CraftActionId::ByregotsBlessing),
            interrupt: false,
        }),
    };
    state = observe(
        &recipe,
        &crafter,
        &mut context,
        &state,
        setup,
        MaterialCondition::Good,
    );
    assert!(context.route_memory.matches(&state));
    let result = recommend(&recipe, &crafter, &state, objective, &context);
    assert!(result.candidates.iter().any(|entry| {
        entry.proposal.sources.contains(&CandidateSource::Route)
            && entry.proposal.decision.action == CraftActionId::ByregotsBlessing
    }));
    let recovery = GenericDecision {
        action: CraftActionId::TricksOfTheTrade,
        option: PlannerOption::ResourceRecovery,
        persona: PlannerPersona::GuideContinuation,
        route: Some(RoutePlan {
            intent: RouteIntent::Recovery,
            engine: ContinuationEngine::Semantic,
            setup: None,
            consumer: None,
            interrupt: true,
        }),
    };
    state = observe(
        &recipe,
        &crafter,
        &mut context,
        &state,
        recovery,
        MaterialCondition::Normal,
    );
    assert_eq!(context.route_memory.suspended, setup.route);
    let mut resumed = setup;
    resumed.action = CraftActionId::ByregotsBlessing;
    resumed.route.as_mut().unwrap().setup = None;
    resumed.route.as_mut().unwrap().consumer = None;
    state = observe(
        &recipe,
        &crafter,
        &mut context,
        &state,
        resumed,
        MaterialCondition::Normal,
    );
    assert_eq!(context.route_memory.resumes, 1);
    assert_eq!(context.route_memory.consumers_used, 1);
    assert_eq!(context.route_memory.suspended, None);
    let manual = GenericDecision {
        action: CraftActionId::BasicTouch,
        route: None,
        ..resumed
    };
    state = observe(
        &recipe,
        &crafter,
        &mut context,
        &state,
        manual,
        MaterialCondition::Normal,
    );
    assert!(context.route_memory.active.is_none());
    assert!(
        recommend(&recipe, &crafter, &state, objective, &context)
            .decision
            .is_some()
    );
    state.cp -= 1;
    assert!(!context.route_memory.matches(&state));
    let _ = observe(
        &recipe,
        &crafter,
        &mut context,
        &state,
        manual,
        MaterialCondition::Normal,
    );
    assert_eq!(context.route_memory.rebuilds, 1);
}

#[test]
fn full_episode_uses_observed_rng_only_and_preserves_required_quality() {
    let (recipe, crafter, objective) = fixture(14_900);
    let mut initial_state = CraftState::initial(&recipe, &crafter);
    initial_state.step = 20;
    initial_state.progress = 9_800;
    initial_state.quality = 14_000;
    initial_state.inner_quiet = 10;
    initial_state.cp = 80;
    let case = GenericEpisodeCase {
        rollout: RolloutCase {
            case_id: "route-v1-replay".to_owned(),
            recipe,
            crafter,
            initial_state,
            seed: 20_260_824,
            initial_cursor: RandomDrawCursor {
                condition_draws: 0,
                success_draws: 0,
            },
            max_steps: 8,
            condition_transition_weights: weights(),
            actions: Vec::new(),
        },
        solver_version: GenericSolverVersion::RoutePortfolioV1,
        risk: RiskPreference::Balanced,
        objective,
        random_condition_mask: 1,
        trace_mode: GenericTraceMode::Full,
    };
    let result = execute_generic_episode(&case).unwrap();
    let mut observed_calls = 0;
    let replay = execute_generic_episode_with_observer(&case, |_, context, decision, report, _| {
        assert_eq!(context.action_uses, observed_calls);
        assert_eq!(decision, report.unwrap().decision);
        observed_calls += 1;
    })
    .unwrap();
    assert_eq!(observed_calls, result.recommendation_calls);
    assert_eq!(result.actions, replay.actions);
    assert_eq!(result.steps, replay.steps);
    assert_eq!(result.planner_context, replay.planner_context);
    assert_eq!(
        result.final_state.terminal,
        CraftTerminal::Completed,
        "actions={:?}, state={:?}",
        result.actions,
        result.final_state
    );
    assert!(result.final_state.quality >= recipe.required_quality);
    let advancing = result
        .actions
        .iter()
        .filter(|action| !action_definition(**action).no_step)
        .count() as u64;
    assert_eq!(result.final_cursor.success_draws, advancing);
    assert_eq!(
        result.planner_context.action_uses as usize,
        result.actions.len()
    );
    assert_eq!(
        ROUTE_PORTFOLIO_POLICY_VERSION
            .parse::<GenericSolverVersion>()
            .unwrap(),
        GenericSolverVersion::RoutePortfolioV1
    );
    assert!(
        planner_context_fingerprint(
            GenericSolverVersion::RoutePortfolioV1,
            &result.planner_context
        )
        .starts_with(ROUTE_PORTFOLIO_CONTEXT_VERSION)
    );
}

#[test]
fn terminal_state_has_no_recommendation() {
    let (recipe, crafter, objective) = fixture(0);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.terminal = CraftTerminal::Completed;
    let result = recommend(
        &recipe,
        &crafter,
        &state,
        objective,
        &PlannerContext::default(),
    );
    assert!(result.decision.is_none());
    assert_eq!(result.work, PortfolioWork::default());
}

#[test]
fn low_progress_requirement_retains_a_funded_quality_route() {
    let (mut recipe, crafter, objective) = fixture(0);
    recipe.progress_required = 100;
    let state = CraftState::initial(&recipe, &crafter);
    let result = recommend(
        &recipe,
        &crafter,
        &state,
        objective,
        &PlannerContext::default(),
    );
    let selected = result.decision.unwrap();
    let after = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        selected.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .unwrap()
    .next_state;
    assert_eq!(
        after.terminal,
        CraftTerminal::None,
        "resources fund quality before the easy finish: {result:?}"
    );
}
