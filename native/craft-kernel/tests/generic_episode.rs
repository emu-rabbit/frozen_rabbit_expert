use frozen_rabbit_craft_kernel::{
    CraftActionId, CraftState, CrafterProfile, GenericDecision, GenericEpisodeCase,
    GenericObjective, GenericSolverVersion, GenericTraceMode, MATERIAL_CONDITION_COUNT,
    MaterialCondition, ObjectiveEvidence, ObservedActionOutcome, PlannerContext, PlannerOption,
    RandomDrawCursor, RecipeProfile, RiskPreference, RolloutCase, advance_planner_context,
    apply_observed_outcome, execute_generic_episode, recommend_generic_action,
};

fn recipe(required_quality: i32) -> RecipeProfile {
    RecipeProfile {
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
    }
}

fn crafter() -> CrafterProfile {
    CrafterProfile {
        level: 100,
        craftsmanship: 5_408,
        control: 5_237,
        max_cp: 749,
        cosmic_tool_good_bonus: true,
        specialist: true,
    }
}

fn all_normal_weights() -> [[f64; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT] {
    let mut weights = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut weights {
        row[0] = 1.0;
    }
    weights
}

fn objective(recipe: &RecipeProfile) -> GenericObjective {
    GenericObjective {
        quality_target: recipe.quality_max,
        voluntary_quality_floor: recipe.quality_max,
        route_quality_target: recipe.quality_max,
        adaptive_completion: recipe.required_quality == 0,
        evidence: if recipe.required_quality == 0 {
            ObjectiveEvidence::ContinuousSoftQuality
        } else {
            ObjectiveEvidence::HardRequiredQuality
        },
        utility_threshold_count: 1,
        utility_thresholds: [recipe.quality_max, 0, 0, 0],
    }
}

#[test]
fn optional_quality_floor_never_replaces_the_mechanics_completion_rule() {
    let recipe = recipe(0);
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 2;
    state.progress = 9_900;
    state.durability = 10;
    state.cp = 0;
    state.trained_perfection_available = false;
    let decision = recommend_generic_action(
        GenericSolverVersion::RustBaselineV1,
        &recipe,
        &crafter,
        &state,
        objective(&recipe),
        RiskPreference::Balanced,
        &PlannerContext::default(),
    )
    .expect("the optional-quality craft must retain a delivery action");

    assert!(matches!(
        decision.action,
        CraftActionId::BasicSynthesis
            | CraftActionId::CarefulSynthesis
            | CraftActionId::Groundwork
            | CraftActionId::PrudentSynthesis
            | CraftActionId::IntensiveSynthesis
    ));
}

#[test]
fn planner_context_advances_only_from_observed_actions() {
    let recipe = recipe(0);
    let crafter = crafter();
    let before = CraftState::initial(&recipe, &crafter);
    let decision = recommend_generic_action(
        GenericSolverVersion::HardQualityV2,
        &recipe,
        &crafter,
        &before,
        objective(&recipe),
        RiskPreference::Balanced,
        &PlannerContext::default(),
    )
    .expect("initial decision");
    let after = before.clone();
    let mut context = PlannerContext::default();
    advance_planner_context(
        &mut context,
        GenericSolverVersion::HardQualityV2,
        decision,
        &before,
        &after,
    );

    assert_eq!(context.observed_transitions, 1);
    assert_eq!(context.option_steps, 1);
    assert_eq!(context.last_action, Some(decision.action));
}

#[test]
fn whole_episode_compute_is_replay_deterministic() {
    let recipe = recipe(0);
    let crafter = crafter();
    let case = GenericEpisodeCase {
        rollout: RolloutCase {
            case_id: "generic-replay".to_owned(),
            recipe,
            crafter,
            initial_state: CraftState::initial(&recipe, &crafter),
            seed: 20_260_824,
            initial_cursor: RandomDrawCursor {
                condition_draws: 0,
                success_draws: 0,
            },
            max_steps: 80,
            condition_transition_weights: all_normal_weights(),
            actions: Vec::new(),
        },
        solver_version: GenericSolverVersion::RustBaselineV1,
        risk: RiskPreference::Balanced,
        objective: objective(&recipe),
        trace_mode: GenericTraceMode::Full,
    };

    let first = execute_generic_episode(&case).expect("first replay");
    let second = execute_generic_episode(&case).expect("second replay");
    assert_eq!(first.actions, second.actions);
    assert_eq!(first.final_state, second.final_state);
    assert_eq!(first.final_cursor, second.final_cursor);
    assert_eq!(first.planner_context, second.planner_context);
    assert_eq!(first.steps, second.steps);
}

#[test]
fn option_route_counts_risk_failure_without_forgetting_the_active_option() {
    let recipe = recipe(14_900);
    let crafter = crafter();
    let mut before = CraftState::initial(&recipe, &crafter);
    before.step = 4;
    before.condition = MaterialCondition::Normal;
    let transition = apply_observed_outcome(
        &recipe,
        &crafter,
        &before,
        CraftActionId::RapidSynthesis,
        ObservedActionOutcome {
            success: false,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("observed Rapid failure");
    let mut context = PlannerContext {
        active_option: PlannerOption::ProgressWindow,
        ..PlannerContext::default()
    };
    advance_planner_context(
        &mut context,
        GenericSolverVersion::OptionRouteV4,
        GenericDecision {
            action: CraftActionId::RapidSynthesis,
            option: PlannerOption::ProgressWindow,
            persona: frozen_rabbit_craft_kernel::PlannerPersona::OptionRoute,
        },
        &before,
        &transition.next_state,
    );

    assert_eq!(context.active_option, PlannerOption::ProgressWindow);
    assert_eq!(context.risk_attempts, 1);
    assert_eq!(context.progress_risk_attempts, 1);
    assert_eq!(context.risk_failures, 1);
    assert_eq!(context.consecutive_risk_failures, 1);
}

#[test]
fn option_route_recovery_resumes_the_interrupted_quality_option() {
    let recipe = recipe(14_900);
    let crafter = crafter();
    let mut before = CraftState::initial(&recipe, &crafter);
    before.step = 10;
    before.progress = 8_900;
    before.quality = 4_000;
    before.inner_quiet = 5;
    before.durability = 10;
    before.condition = MaterialCondition::Normal;
    let mut context = PlannerContext {
        active_option: PlannerOption::InnerQuietBuild,
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };
    let recovery = recommend_generic_action(
        GenericSolverVersion::OptionRouteV4,
        &recipe,
        &crafter,
        &before,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("recovery decision");
    assert_eq!(recovery.option, PlannerOption::ResourceRecovery);
    assert_eq!(recovery.action, CraftActionId::Manipulation);
    let after = apply_observed_outcome(
        &recipe,
        &crafter,
        &before,
        recovery.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("recovery transition")
    .next_state;
    advance_planner_context(
        &mut context,
        GenericSolverVersion::OptionRouteV4,
        recovery,
        &before,
        &after,
    );
    assert_eq!(context.resume_option, Some(PlannerOption::InnerQuietBuild));

    let resumed = recommend_generic_action(
        GenericSolverVersion::OptionRouteV4,
        &recipe,
        &crafter,
        &after,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("resumed quality decision");
    assert_eq!(resumed.option, PlannerOption::InnerQuietBuild);
}

#[test]
fn bounded_condition_fishing_allows_the_video_supported_second_observe() {
    let recipe = recipe(14_900);
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.progress = 9_800;
    state.quality = 13_000;
    state.inner_quiet = 10;
    state.durability = 20;
    state.cp = 200;
    state.buffs.great_strides = 3;
    state.buffs.innovation = 3;
    state.condition = MaterialCondition::Normal;
    let mut context = PlannerContext {
        active_option: PlannerOption::QualityBurst,
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };

    let first = recommend_generic_action(
        GenericSolverVersion::OptionRouteV4,
        &recipe,
        &crafter,
        &state,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("first fishing roll");
    assert_eq!(first.option, PlannerOption::ConditionFishing);
    assert_eq!(first.action, CraftActionId::Observe);
    let after_first = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        first.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("first Observe transition")
    .next_state;
    advance_planner_context(
        &mut context,
        GenericSolverVersion::OptionRouteV4,
        first,
        &state,
        &after_first,
    );

    let second = recommend_generic_action(
        GenericSolverVersion::OptionRouteV4,
        &recipe,
        &crafter,
        &after_first,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("second fishing roll");
    assert_eq!(second.option, PlannerOption::ConditionFishing);
    assert_eq!(second.action, CraftActionId::Observe);
}

#[test]
fn opportunity_reserve_takes_good_then_resumes_the_progress_program() {
    let recipe = recipe(14_900);
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 5;
    state.progress = 0;
    state.quality = 2_000;
    state.inner_quiet = 4;
    state.durability = 40;
    state.cp = 500;
    state.condition = MaterialCondition::Good;
    let mut context = PlannerContext {
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };

    let opportunity = recommend_generic_action(
        GenericSolverVersion::OpportunityReserveV13,
        &recipe,
        &crafter,
        &state,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("Good opportunity decision");
    assert_eq!(opportunity.action, CraftActionId::PreciseTouch);
    assert_eq!(
        opportunity.persona,
        frozen_rabbit_craft_kernel::PlannerPersona::OpportunityReserveGuide
    );

    let after = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        opportunity.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("Precise Touch transition")
    .next_state;
    advance_planner_context(
        &mut context,
        GenericSolverVersion::OpportunityReserveV13,
        opportunity,
        &state,
        &after,
    );

    let resumed = recommend_generic_action(
        GenericSolverVersion::OpportunityReserveV13,
        &recipe,
        &crafter,
        &after,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("resumed progress decision");
    assert_eq!(resumed.option, PlannerOption::ProgressWindow);
    assert_eq!(
        resumed.persona,
        frozen_rabbit_craft_kernel::PlannerPersona::OpportunityReserveGuide
    );
}
