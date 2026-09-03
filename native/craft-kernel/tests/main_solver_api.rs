use frozen_rabbit_craft_kernel::main_solver::{
    AvailableConditions, CraftActionId, CraftState, CrafterProfile, MAIN_SOLVER_API_VERSION,
    MAIN_SOLVER_POLICY_VERSION, MainSolverConfig, MainSolverError, MainSolverObjective,
    MainSolverSession, MainSolverStatus, MaterialCondition, ObservedActionOutcome, RecipeProfile,
};

fn recipe() -> RecipeProfile {
    RecipeProfile {
        canonical_recipe_id: 1,
        recipe_level: 100,
        progress_required: 6_600,
        quality_max: 22_500,
        required_quality: 22_500,
        durability_max: 70,
        progress_divider: 180.0,
        quality_divider: 180.0,
        progress_modifier: 100.0,
        quality_modifier: 100.0,
    }
}

fn crafter() -> CrafterProfile {
    CrafterProfile {
        level: 100,
        craftsmanship: 5_200,
        control: 5_100,
        max_cp: 700,
        cosmic_tool_good_bonus: true,
        specialist: true,
    }
}

fn config(action_limit: u32) -> MainSolverConfig {
    MainSolverConfig::new(
        recipe(),
        crafter(),
        MainSolverObjective::HardQuality {
            quality_maximum: recipe().quality_max,
        },
        AvailableConditions::ALL,
    )
    .unwrap()
    .with_action_limit(action_limit)
    .unwrap()
}

fn recommended_action(status: MainSolverStatus) -> CraftActionId {
    let MainSolverStatus::Recommendation(recommendation) = status else {
        panic!("expected a recommendation");
    };
    assert_eq!(recommendation.api_version, MAIN_SOLVER_API_VERSION);
    assert_eq!(recommendation.policy_version, MAIN_SOLVER_POLICY_VERSION);
    recommendation.action
}

#[test]
fn public_session_supports_the_recommend_observe_loop() {
    let config = config(80);
    let mut session = MainSolverSession::new(config);
    let state = CraftState::initial(config.recipe(), config.crafter());

    let action = recommended_action(session.recommend(&state).unwrap());
    let transition = session
        .observe(
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .unwrap();

    assert!(matches!(
        session.recommend(&transition.next_state).unwrap(),
        MainSolverStatus::Recommendation(_)
    ));
}

#[test]
fn public_session_accepts_legal_player_deviation() {
    let config = config(80);
    let mut session = MainSolverSession::new(config);
    let state = CraftState::initial(config.recipe(), config.crafter());
    let recommended = recommended_action(session.recommend(&state).unwrap());
    let alternative = if recommended == CraftActionId::BasicSynthesis {
        CraftActionId::Observe
    } else {
        CraftActionId::BasicSynthesis
    };

    let transition = session
        .observe(
            alternative,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .unwrap();

    assert!(matches!(
        session.recommend(&transition.next_state).unwrap(),
        MainSolverStatus::Recommendation(_)
    ));
}

#[test]
fn invalid_observed_state_keeps_the_pending_recommendation() {
    let config = config(80);
    let mut session = MainSolverSession::new(config);
    let state = CraftState::initial(config.recipe(), config.crafter());
    let action = recommended_action(session.recommend(&state).unwrap());
    let mut impossible = state.clone();
    impossible.step = 999;

    assert_eq!(
        session.observe_state(action, &impossible),
        Err(MainSolverError::InvalidObservedState)
    );
    assert!(
        session
            .observe(
                action,
                ObservedActionOutcome {
                    success: true,
                    next_condition: MaterialCondition::Normal,
                },
            )
            .is_ok()
    );
}

#[test]
fn action_limit_is_reported_without_requesting_another_action() {
    let config = config(1);
    let mut session = MainSolverSession::new(config);
    let state = CraftState::initial(config.recipe(), config.crafter());
    let action = recommended_action(session.recommend(&state).unwrap());
    let transition = session
        .observe(
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .unwrap();

    assert_eq!(
        session.recommend(&transition.next_state).unwrap(),
        MainSolverStatus::ActionLimitReached
    );
}

#[test]
fn player_deviation_does_not_reset_the_public_action_limit() {
    let config = config(1);
    let mut session = MainSolverSession::new(config);
    let state = CraftState::initial(config.recipe(), config.crafter());
    let recommended = recommended_action(session.recommend(&state).unwrap());
    let alternative = if recommended == CraftActionId::BasicSynthesis {
        CraftActionId::Observe
    } else {
        CraftActionId::BasicSynthesis
    };
    let transition = session
        .observe(
            alternative,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .unwrap();

    assert_eq!(
        session.recommend(&transition.next_state).unwrap(),
        MainSolverStatus::ActionLimitReached
    );
}

#[test]
fn configuration_rejects_a_mismatched_quality_maximum() {
    let result = MainSolverConfig::new(
        recipe(),
        crafter(),
        MainSolverObjective::HardQuality { quality_maximum: 1 },
        AvailableConditions::ALL,
    );

    assert!(matches!(
        result,
        Err(MainSolverError::InvalidConfiguration(_))
    ));
}
