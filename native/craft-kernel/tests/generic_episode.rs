use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::research::{
    CraftActionId, CraftState, CrafterProfile, GENERIC_EPISODE_PROTOCOL_VERSION,
    GENERIC_EXTERNAL_REFERENCE_POLICY_VERSION, GENERIC_EXTERNAL_REFERENCE_V2_POLICY_VERSION,
    GenericDecision, GenericEpisodeCase, GenericObjective, GenericSolverVersion, GenericTraceMode,
    MATERIAL_CONDITION_COUNT, MaterialCondition, ObservedActionOutcome, PlannerContext,
    PlannerOption, QualityUtilityKind, RandomDrawCursor, RecipeProfile, RiskPreference,
    RolloutCase, advance_planner_context, apply_observed_outcome, execute_generic_episode,
    preview_action, recommend_generic_action, recommend_generic_action_with_model,
};

#[test]
fn generic_episode_handshake_advertises_current_v2() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-generic-episode"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn generic episode binary");
    writeln!(
        child.stdin.as_mut().expect("stdin"),
        "{GENERIC_EPISODE_PROTOCOL_VERSION}\t__handshake__\thandshake"
    )
    .expect("write handshake");
    let output = child.wait_with_output().expect("read handshake");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 handshake");
    assert!(
        stdout
            .trim()
            .split('\t')
            .any(|cell| cell == GENERIC_EXTERNAL_REFERENCE_POLICY_VERSION)
    );
    assert!(
        stdout
            .trim()
            .split('\t')
            .any(|cell| cell == GENERIC_EXTERNAL_REFERENCE_V2_POLICY_VERSION)
    );
}

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

fn declared_set_weights(
    normal: f64,
    other: f64,
) -> [[f64; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT] {
    let mut weights = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut weights {
        for (index, weight) in row.iter_mut().enumerate() {
            *weight = if index == MaterialCondition::Normal.index() {
                normal
            } else {
                other
            };
        }
    }
    weights
}

fn objective(recipe: &RecipeProfile) -> GenericObjective {
    GenericObjective {
        quality_maximum: recipe.quality_max,
        protected_quality_floor: recipe.quality_max,
        adaptive_completion: recipe.required_quality == 0,
        quality_utility_kind: if recipe.required_quality == 0 {
            QualityUtilityKind::ContinuousCollectability
        } else {
            QualityUtilityKind::HardQualityMaximum
        },
        quality_milestone_count: 1,
        quality_milestones: [recipe.quality_max, 0, 0, 0],
    }
}

#[test]
fn protected_quality_floor_never_replaces_the_mechanics_completion_rule() {
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
fn delivery_shield_uses_only_the_declared_last_chance_risk_budget() {
    for required_quality in [0, 14_900] {
        let mut recipe = recipe(required_quality);
        let crafter = crafter();
        let probe_state = CraftState::initial(&recipe, &crafter);
        let probe = preview_action(
            &recipe,
            &crafter,
            &probe_state,
            CraftActionId::RapidSynthesis,
        );
        recipe.progress_required = probe.progress_gain * 3;
        let mut objective = objective(&recipe);
        objective.quality_maximum = recipe.quality_max;
        objective.protected_quality_floor = objective.quality_maximum;
        objective.quality_milestones[0] = objective.quality_maximum;

        let mut state = CraftState::initial(&recipe, &crafter);
        state.step = 12;
        state.quality = objective.protected_quality_floor;
        state.durability = 10;
        state.cp = 0;
        state.trained_perfection_available = false;
        state.careful_observation_uses_left = 0;
        state.heart_and_soul_available = false;
        state.quick_innovation_available = false;
        let rapid = preview_action(&recipe, &crafter, &state, CraftActionId::RapidSynthesis);
        let basic = preview_action(&recipe, &crafter, &state, CraftActionId::BasicSynthesis);
        assert!(rapid.legal && rapid.success_rate > 0.0 && rapid.success_rate < 1.0);
        assert!(rapid.progress_gain > basic.progress_gain);
        state.progress = recipe.progress_required - rapid.progress_gain;

        let old = recommend_generic_action(
            GenericSolverVersion::OpportunityReserveV13,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Balanced,
            &PlannerContext {
                reliable_quality_first_route_index: -1,
                ..PlannerContext::default()
            },
        );
        assert_eq!(old, None, "v0.18 must reproduce the policy-null gap");

        let balanced = recommend_generic_action(
            GenericSolverVersion::DeliveryShieldV14,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Balanced,
            &PlannerContext {
                reliable_quality_first_route_index: -1,
                ..PlannerContext::default()
            },
        )
        .expect("balanced may spend the final delivery chance");
        assert_eq!(balanced.action, CraftActionId::RapidSynthesis);

        let stable = recommend_generic_action(
            GenericSolverVersion::DeliveryShieldV14,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Stable,
            &PlannerContext {
                reliable_quality_first_route_index: -1,
                ..PlannerContext::default()
            },
        );
        assert_eq!(
            stable, None,
            "stable must remain fail-closed without a certificate"
        );

        if required_quality == 0 {
            let mut final_appraisal_state = state.clone();
            final_appraisal_state.cp = 1;
            let old = recommend_generic_action(
                GenericSolverVersion::OpportunityReserveV13,
                &recipe,
                &crafter,
                &final_appraisal_state,
                objective,
                RiskPreference::Balanced,
                &PlannerContext {
                    reliable_quality_first_route_index: -1,
                    ..PlannerContext::default()
                },
            )
            .expect("v0.18 spends the last CP on Final Appraisal");
            assert_eq!(old.action, CraftActionId::FinalAppraisal);

            let shielded = recommend_generic_action(
                GenericSolverVersion::DeliveryShieldV14,
                &recipe,
                &crafter,
                &final_appraisal_state,
                objective,
                RiskPreference::Balanced,
                &PlannerContext {
                    reliable_quality_first_route_index: -1,
                    ..PlannerContext::default()
                },
            )
            .expect("v0.19 must preserve the observed completion chance");
            assert_eq!(shielded.action, CraftActionId::RapidSynthesis);

            let mut sampling_state = final_appraisal_state.clone();
            sampling_state.careful_observation_uses_left = 1;
            let withdrawn_spacer = recommend_generic_action(
                GenericSolverVersion::DeliveryShieldV14,
                &recipe,
                &crafter,
                &sampling_state,
                objective,
                RiskPreference::Stable,
                &PlannerContext {
                    reliable_quality_first_route_index: -1,
                    ..PlannerContext::default()
                },
            )
            .expect("v0.19 preserves its withdrawn no-step spacer behavior");
            assert_eq!(withdrawn_spacer.action, CraftActionId::FinalAppraisal);

            let corrected = recommend_generic_action(
                GenericSolverVersion::BudgetedConditionV15,
                &recipe,
                &crafter,
                &sampling_state,
                objective,
                RiskPreference::Stable,
                &PlannerContext {
                    reliable_quality_first_route_index: -1,
                    ..PlannerContext::default()
                },
            );
            assert!(
                corrected.is_none_or(|decision| decision.action != CraftActionId::FinalAppraisal),
                "v0.20 must not treat Final Appraisal as a condition sample"
            );
        }
    }
}

#[test]
fn budgeted_delivery_recovery_uses_two_direct_observes_without_a_no_step_spacer() {
    let mut recipe = recipe(0);
    let crafter = crafter();
    let probe_state = CraftState::initial(&recipe, &crafter);
    let rapid = preview_action(
        &recipe,
        &crafter,
        &probe_state,
        CraftActionId::RapidSynthesis,
    );
    recipe.progress_required = rapid.progress_gain * 3;
    let mut objective = objective(&recipe);
    objective.protected_quality_floor = recipe.quality_max / 2;
    objective.quality_maximum = recipe.quality_max;

    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.progress = recipe.progress_required - rapid.progress_gain;
    state.quality = objective.protected_quality_floor - 1;
    state.durability = 10;
    state.cp = 15;
    state.trained_perfection_available = false;
    state.careful_observation_uses_left = 0;
    state.heart_and_soul_available = false;
    state.quick_innovation_available = false;
    let mut context = PlannerContext {
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };

    let first = recommend_generic_action(
        GenericSolverVersion::BudgetedConditionV15,
        &recipe,
        &crafter,
        &state,
        objective,
        RiskPreference::Balanced,
        &context,
    )
    .expect("the first recovery Observe is funded");
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
        GenericSolverVersion::BudgetedConditionV15,
        first,
        &state,
        &after_first,
    );
    assert_eq!(context.fishing_rolls_remaining, 1);

    let second = recommend_generic_action(
        GenericSolverVersion::BudgetedConditionV15,
        &recipe,
        &crafter,
        &after_first,
        objective,
        RiskPreference::Balanced,
        &context,
    )
    .expect("the second direct Observe remains inside the budget");
    assert_eq!(second.option, PlannerOption::ConditionFishing);
    assert_eq!(second.action, CraftActionId::Observe);
    let after_second = apply_observed_outcome(
        &recipe,
        &crafter,
        &after_first,
        second.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("second Observe transition")
    .next_state;
    advance_planner_context(
        &mut context,
        GenericSolverVersion::BudgetedConditionV15,
        second,
        &after_first,
        &after_second,
    );
    assert_eq!(context.fishing_rolls_remaining, 0);

    let exhausted = recommend_generic_action(
        GenericSolverVersion::BudgetedConditionV15,
        &recipe,
        &crafter,
        &after_second,
        objective,
        RiskPreference::Balanced,
        &context,
    );
    assert_eq!(
        exhausted, None,
        "the sampler must stop after its explicit budget when the protected quality floor is not met"
    );
}

#[test]
fn budgeted_delivery_recovery_prefers_free_careful_observation() {
    let mut recipe = recipe(0);
    let crafter = crafter();
    let probe_state = CraftState::initial(&recipe, &crafter);
    let rapid = preview_action(
        &recipe,
        &crafter,
        &probe_state,
        CraftActionId::RapidSynthesis,
    );
    recipe.progress_required = rapid.progress_gain * 3;
    let mut objective = objective(&recipe);
    objective.protected_quality_floor = recipe.quality_max / 2;

    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.progress = recipe.progress_required - rapid.progress_gain;
    state.quality = objective.protected_quality_floor;
    state.durability = 10;
    state.cp = 15;
    state.trained_perfection_available = false;
    state.careful_observation_uses_left = 2;
    state.heart_and_soul_available = true;
    state.quick_innovation_available = false;
    let context = PlannerContext {
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };

    let decision = recommend_generic_action(
        GenericSolverVersion::BudgetedConditionV15,
        &recipe,
        &crafter,
        &state,
        objective,
        RiskPreference::Balanced,
        &context,
    )
    .expect("the free specialist condition sample is funded before a no-step buff");
    assert_eq!(decision.option, PlannerOption::ConditionFishing);
    assert_eq!(decision.action, CraftActionId::CarefulObservation);
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
        random_condition_mask: 1,
        trace_mode: GenericTraceMode::Full,
    };

    let first = execute_generic_episode(&case).expect("first replay");
    let second = execute_generic_episode(&case).expect("second replay");
    assert_eq!(first.actions, second.actions);
    assert_eq!(first.final_state, second.final_state);
    assert_eq!(first.final_cursor, second.final_cursor);
    assert_eq!(first.planner_context, second.planner_context);
    assert_eq!(first.steps, second.steps);
    for result in [&first, &second] {
        assert_eq!(
            result.recommendation_durations_ns.len(),
            result.recommendation_calls as usize
        );
        assert_eq!(
            result.recommendation_durations_ns.iter().sum::<u128>(),
            result.recommendation_ns
        );
        assert_eq!(
            result
                .recommendation_durations_ns
                .iter()
                .max()
                .copied()
                .unwrap_or(0),
            result.recommendation_max_ns
        );
        let encoded = frozen_rabbit_craft_kernel::research::format_generic_episode_result(result);
        let cells: Vec<_> = encoded.split('\t').collect();
        assert_eq!(cells.len(), 51);
        let durations: Vec<u128> = cells[50]
            .split(',')
            .map(|value| value.parse().unwrap())
            .collect();
        assert_eq!(durations, result.recommendation_durations_ns);
    }
    let mut experiment_case = case.clone();
    experiment_case.solver_version = GenericSolverVersion::ExternalReferenceFullQualityCertificate;
    let experiment = execute_generic_episode(&experiment_case).expect("experiment replay");
    experiment_case.solver_version = GenericSolverVersion::ExternalReferenceV2;
    let adopted = execute_generic_episode(&experiment_case).expect("v2 replay");
    assert_eq!(adopted.actions, experiment.actions);
    assert_eq!(adopted.final_state, experiment.final_state);
    assert_eq!(adopted.final_cursor, experiment.final_cursor);
    assert_eq!(adopted.planner_context, experiment.planner_context);
    assert_eq!(adopted.steps, experiment.steps);

    experiment_case.solver_version = GenericSolverVersion::ExpandedFullQualityCertificate;
    let depth4_experiment = execute_generic_episode(&experiment_case).expect("depth4 replay");
    experiment_case.solver_version = GenericSolverVersion::ExternalReferenceV21;
    let adopted_v21 = execute_generic_episode(&experiment_case).expect("v2.1 replay");
    assert_eq!(adopted_v21.actions, depth4_experiment.actions);
    assert_eq!(adopted_v21.final_state, depth4_experiment.final_state);
    assert_eq!(adopted_v21.final_cursor, depth4_experiment.final_cursor);
    assert_eq!(
        adopted_v21.planner_context,
        depth4_experiment.planner_context
    );
    assert_eq!(adopted_v21.steps, depth4_experiment.steps);

    let mut terminal = case;
    terminal.rollout.initial_state = first.final_state;
    let result = execute_generic_episode(&terminal).expect("already terminal");
    assert_eq!(result.recommendation_calls, 0);
    assert!(result.recommendation_durations_ns.is_empty());
    assert!(
        frozen_rabbit_craft_kernel::research::format_generic_episode_result(&result)
            .ends_with("\t-")
    );
}

#[test]
fn evaluator_private_condition_weights_cannot_change_any_first_recommendation() {
    const VERSIONS: &[GenericSolverVersion] = &[
        GenericSolverVersion::ExternalReferenceCertifiedFinish,
        GenericSolverVersion::ExternalReferenceFullQualityCertificate,
        GenericSolverVersion::ExternalReferenceV2,
        GenericSolverVersion::ExternalReferenceV21,
        GenericSolverVersion::ExpandedFullQualityCertificate,
        GenericSolverVersion::FullQualityCertificateDepth5,
        GenericSolverVersion::FullQualityCertificateDepth6,
        GenericSolverVersion::FullQualityCertificateDepth7,
        GenericSolverVersion::RustBaselineV1,
        GenericSolverVersion::HardQualityV2,
        GenericSolverVersion::RustPrimaryV3,
        GenericSolverVersion::OptionRouteV4,
        GenericSolverVersion::OptionMpcV5,
        GenericSolverVersion::GuideOptionMpcV6,
        GenericSolverVersion::GuideLeaseMpcV7,
        GenericSolverVersion::GuidePhaseMpcV8,
        GenericSolverVersion::StrategyPortfolioMpcV9,
        GenericSolverVersion::CapabilityPortfolioMpcV10,
        GenericSolverVersion::DeepPortfolioMpcV11,
        GenericSolverVersion::StrategyProgramMpcV12,
        GenericSolverVersion::OpportunityReserveV13,
        GenericSolverVersion::DeliveryShieldV14,
        GenericSolverVersion::BudgetedConditionV15,
        GenericSolverVersion::TsMigrationPortV16,
        GenericSolverVersion::ConditionSetPortfolioV17,
        GenericSolverVersion::CapabilityConditionSetPortfolioV18,
        GenericSolverVersion::ConditionContinuationPortfolioV19,
        GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
        GenericSolverVersion::ProgressQualityShieldV21,
        GenericSolverVersion::SpecialistResourcePortfolioV22,
        GenericSolverVersion::ProgressBankPortfolioV23,
        GenericSolverVersion::FlatOpportunityPortfolioV24,
        GenericSolverVersion::SpecialistResourceGuardV25,
        GenericSolverVersion::RoutePortfolioV1,
        GenericSolverVersion::ResourcePortfolioV2,
        GenericSolverVersion::CoordinatedPortfolioV3,
        GenericSolverVersion::ConstructionPortfolioV4,
        GenericSolverVersion::CachedPortfolioV5,
        GenericSolverVersion::CompactPortfolioV6,
        GenericSolverVersion::CertifiedPortfolioV7,
        GenericSolverVersion::QualityBoundPortfolioV8,
        GenericSolverVersion::EquivalentPortfolioV9,
        GenericSolverVersion::ObjectivePortfolioV10,
        GenericSolverVersion::AggressiveResourcePortfolioV11,
        GenericSolverVersion::CompletionAwarePortfolioV12,
        GenericSolverVersion::CompletionAwarePortfolioExperiment,
        GenericSolverVersion::ConditionOpportunityAblationExperiment,
        GenericSolverVersion::ConditionWorkSchedulerV13,
        GenericSolverVersion::ExperimentalPortfolio,
        GenericSolverVersion::GuideDirectProbe,
        GenericSolverVersion::IntegratedGuideDirectProbe,
        GenericSolverVersion::ProgressReserveGuideDirectProbe,
        GenericSolverVersion::OpportunityReserveGuideDirectProbe,
        GenericSolverVersion::RiskForwardDirectProbe,
    ];

    let recipe = recipe(14_900);
    let crafter = crafter();
    let base = GenericEpisodeCase {
        rollout: RolloutCase {
            case_id: "condition-information-boundary".to_owned(),
            recipe,
            crafter,
            initial_state: CraftState::initial(&recipe, &crafter),
            seed: 20_260_831,
            initial_cursor: RandomDrawCursor {
                condition_draws: 0,
                success_draws: 0,
            },
            max_steps: 1,
            condition_transition_weights: declared_set_weights(1.0, 1.0),
            actions: Vec::new(),
        },
        solver_version: GenericSolverVersion::CompletionAwarePortfolioV12,
        risk: RiskPreference::Balanced,
        objective: objective(&recipe),
        random_condition_mask: 0x1ff,
        trace_mode: GenericTraceMode::None,
    };

    for &version in VERSIONS {
        let actions = [(1.0, 1.0), (6.0, 1.0), (12.0, 0.35)].map(|(normal, other)| {
            let mut case = base.clone();
            case.solver_version = version;
            case.rollout.condition_transition_weights = declared_set_weights(normal, other);
            execute_generic_episode(&case)
                .unwrap_or_else(|error| panic!("{version} boundary probe failed: {error}"))
                .actions
                .first()
                .copied()
        });
        assert_eq!(
            actions[0], actions[1],
            "{version} read normal-heavy weights"
        );
        assert_eq!(actions[0], actions[2], "{version} read scarce weights");
    }
}

#[test]
fn legacy_mpc_sampling_is_recipe_identity_independent() {
    const MPC_VERSIONS: &[GenericSolverVersion] = &[
        GenericSolverVersion::OptionMpcV5,
        GenericSolverVersion::GuideOptionMpcV6,
        GenericSolverVersion::GuideLeaseMpcV7,
        GenericSolverVersion::GuidePhaseMpcV8,
        GenericSolverVersion::StrategyPortfolioMpcV9,
        GenericSolverVersion::CapabilityPortfolioMpcV10,
        GenericSolverVersion::DeepPortfolioMpcV11,
        GenericSolverVersion::StrategyProgramMpcV12,
    ];
    let recipe = recipe(14_900);
    let mut aliased_recipe = recipe;
    aliased_recipe.canonical_recipe_id = 999_999;
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 8;
    state.progress = 2_500;
    state.quality = 3_000;
    state.condition = MaterialCondition::Malleable;
    let context = PlannerContext {
        action_limit: 80,
        action_uses: 7,
        observed_transitions: 7,
        ..PlannerContext::default()
    };

    for &version in MPC_VERSIONS {
        let original = recommend_generic_action_with_model(
            version,
            &recipe,
            &crafter,
            &state,
            objective(&recipe),
            RiskPreference::Balanced,
            &context,
            Some(0x1ff),
        );
        let aliased = recommend_generic_action_with_model(
            version,
            &aliased_recipe,
            &crafter,
            &state,
            objective(&aliased_recipe),
            RiskPreference::Balanced,
            &context,
            Some(0x1ff),
        );
        assert_eq!(
            original, aliased,
            "{version} read canonical recipe identity"
        );
    }
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
            route: None,
            action: CraftActionId::RapidSynthesis,
            option: PlannerOption::ProgressWindow,
            persona: frozen_rabbit_craft_kernel::research::PlannerPersona::OptionRoute,
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
        frozen_rabbit_craft_kernel::research::PlannerPersona::OpportunityReserveGuide
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
        frozen_rabbit_craft_kernel::research::PlannerPersona::OpportunityReserveGuide
    );
}

#[test]
fn opportunity_reserve_may_refresh_a_useful_buff_on_pliant() {
    let recipe = recipe(14_900);
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 5;
    state.progress = 0;
    state.quality = 2_000;
    state.inner_quiet = 4;
    state.durability = 30;
    state.cp = 500;
    state.buffs.manipulation = 2;
    state.condition = MaterialCondition::Pliant;
    let context = PlannerContext {
        manipulation_uses: 1,
        reliable_quality_first_route_index: -1,
        ..PlannerContext::default()
    };

    let refresh = recommend_generic_action(
        GenericSolverVersion::BudgetedConditionV15,
        &recipe,
        &crafter,
        &state,
        objective(&recipe),
        RiskPreference::Balanced,
        &context,
    )
    .expect("Pliant can justify refreshing an expiring Manipulation");
    assert_eq!(refresh.action, CraftActionId::Manipulation);
    assert_eq!(refresh.option, PlannerOption::ProgressWindow);

    let after = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        refresh.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .expect("buff refresh transition")
    .next_state;
    assert_eq!(after.step, state.step + 1);
    assert_eq!(after.condition, MaterialCondition::Normal);
    assert!(after.buffs.manipulation > state.buffs.manipulation);
}
