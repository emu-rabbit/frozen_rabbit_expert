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

#[test]
fn resource_portfolio_does_not_repeat_a_resource_only_noop() {
    let (recipe, mut crafter, objective) = fixture(22_500);
    crafter.specialist = false;
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 35;
    state.progress = 8_000;
    state.quality = 15_000;
    state.durability = 5;
    state.cp = 4;
    state.buffs.final_appraisal = 5;
    state.trained_perfection_available = false;
    let context = PlannerContext {
        action_uses: 38,
        ..PlannerContext::default()
    };
    for risk in [
        RiskPreference::Stable,
        RiskPreference::Balanced,
        RiskPreference::Aggressive,
    ] {
        let before = state.clone();
        let result = recommend_resource_portfolio(
            true,
            &recipe,
            &crafter,
            &state,
            objective,
            risk,
            &context,
            Some(1),
            Some(&weights()),
        );
        let decision = result
            .decision
            .expect("valid state must return a legal action");
        assert!(preview_action(&recipe, &crafter, &state, decision.action).legal);
        assert_ne!(decision.action, CraftActionId::FinalAppraisal);
        assert_eq!(state, before);
        let renamed = RecipeProfile {
            canonical_recipe_id: 987_654,
            ..recipe
        };
        assert_eq!(
            result,
            recommend_resource_portfolio(
                true,
                &renamed,
                &crafter,
                &state,
                objective,
                risk,
                &context,
                Some(1),
                Some(&weights())
            )
        );
    }
}

#[test]
fn every_condition_has_legal_opportunities_across_quality_contracts() {
    for version in [
        GenericSolverVersion::ResourcePortfolioV2,
        GenericSolverVersion::CoordinatedPortfolioV3,
        GenericSolverVersion::ConstructionPortfolioV4,
        GenericSolverVersion::CachedPortfolioV5,
        GenericSolverVersion::CompactPortfolioV6,
        GenericSolverVersion::CertifiedPortfolioV7,
    ] {
        for kind in [
            QualityUtilityKind::HardQualityMaximum,
            QualityUtilityKind::CollectabilityTiers,
            QualityUtilityKind::HqChance,
            QualityUtilityKind::ContinuousCollectability,
        ] {
            let (recipe, crafter, mut objective) =
                fixture(if kind == QualityUtilityKind::HardQualityMaximum {
                    22_500
                } else {
                    0
                });
            objective.quality_utility_kind = kind;
            if kind == QualityUtilityKind::CollectabilityTiers {
                objective.quality_milestone_count = 4;
                objective.quality_milestones = [5_000, 10_000, 17_000, 22_500];
            }
            let context = PlannerContext {
                action_uses: 20,
                manipulation_uses: 3,
                waste_not_uses: 1,
                ..PlannerContext::default()
            };
            for &condition in MaterialCondition::ALL {
                let mut state = CraftState::initial(&recipe, &crafter);
                state.step = 20;
                state.progress = 6_000;
                state.quality = 10_000;
                state.inner_quiet = 10;
                state.cp = 300;
                state.durability = 35;
                state.condition = condition;
                let result = recommend_portfolio_version(
                    version,
                    &recipe,
                    &crafter,
                    &state,
                    objective,
                    RiskPreference::Balanced,
                    &context,
                    Some(0x1ff),
                    Some(&weights()),
                );
                let actions: Vec<_> = result
                    .candidates
                    .iter()
                    .map(|c| c.proposal.decision.action)
                    .collect();
                assert!(
                    actions
                        .iter()
                        .all(|&action| preview_action(&recipe, &crafter, &state, action).legal)
                );
                assert!(result.decision.is_some(), "{kind:?}/{condition:?}");
                assert!(
                    result.candidates.iter().any(|entry| !entry.screened_out
                        && Some(entry.proposal.decision) == result.decision)
                );
                if result.work.robust_suffix_certificates > 0 {
                    assert_eq!(version, GenericSolverVersion::CertifiedPortfolioV7);
                    assert_eq!(result.candidates.len(), 1);
                    assert!(
                        result.candidates[0]
                            .proposal
                            .sources
                            .contains(&CandidateSource::CertifiedEndgame)
                    );
                    continue;
                }
                let forced = match condition {
                    MaterialCondition::GoodOmen => {
                        Some((CraftActionId::GreatStrides, MaterialCondition::Good))
                    }
                    MaterialCondition::Robust => {
                        Some((CraftActionId::Groundwork, MaterialCondition::Sturdy))
                    }
                    _ => None,
                };
                if let Some((action, next)) = forced {
                    assert_eq!(
                        result
                            .candidates
                            .iter()
                            .find(|entry| entry.proposal.decision.action == action)
                            .unwrap()
                            .success
                            .reference_state
                            .condition,
                        next
                    );
                }
                let required: &[CraftActionId] = match condition {
                    MaterialCondition::Normal => &[],
                    MaterialCondition::Good => &[
                        CraftActionId::PreciseTouch,
                        CraftActionId::TricksOfTheTrade,
                        CraftActionId::ByregotsBlessing,
                    ],
                    MaterialCondition::GoodOmen => &[
                        CraftActionId::GreatStrides,
                        CraftActionId::Innovation,
                        CraftActionId::Observe,
                    ],
                    MaterialCondition::Centered => {
                        &[CraftActionId::HastyTouch, CraftActionId::RapidSynthesis]
                    }
                    MaterialCondition::Sturdy | MaterialCondition::Robust => {
                        &[CraftActionId::PreparatoryTouch, CraftActionId::Groundwork]
                    }
                    MaterialCondition::Pliant => &[
                        CraftActionId::Manipulation,
                        CraftActionId::WasteNot2,
                        CraftActionId::MastersMend,
                    ],
                    MaterialCondition::Malleable => &[
                        CraftActionId::Groundwork,
                        CraftActionId::CarefulSynthesis,
                        CraftActionId::RapidSynthesis,
                    ],
                    MaterialCondition::Primed => &[
                        CraftActionId::Manipulation,
                        CraftActionId::WasteNot2,
                        CraftActionId::Innovation,
                        CraftActionId::Veneration,
                    ],
                };
                for action in required {
                    assert!(
                        actions.contains(action),
                        "missing {action:?}: {kind:?}/{condition:?}"
                    );
                }
                if condition == MaterialCondition::Pliant {
                    assert_eq!(
                        preview_action(&recipe, &crafter, &state, CraftActionId::Manipulation)
                            .cp_cost,
                        48
                    );
                    assert_eq!(
                        preview_action(&recipe, &crafter, &state, CraftActionId::WasteNot2).cp_cost,
                        49
                    );
                }
                // A manual deviation or a different buff state is evaluated afresh.
                state.quality = recipe.quality_max;
                state.progress = recipe.progress_required - 1;
                let finish = recommend_portfolio_version(
                    version,
                    &recipe,
                    &crafter,
                    &state,
                    objective,
                    RiskPreference::Balanced,
                    &context,
                    Some(0x1ff),
                    Some(&weights()),
                )
                .decision
                .unwrap();
                let after = apply_observed_outcome(
                    &recipe,
                    &crafter,
                    &state,
                    finish.action,
                    ObservedActionOutcome {
                        success: true,
                        next_condition: MaterialCondition::Normal,
                    },
                )
                .unwrap()
                .next_state;
                assert_eq!(
                    after.terminal,
                    CraftTerminal::Completed,
                    "do not buy unused opportunity: {condition:?}/{finish:?}"
                );
                assert_eq!(
                    preview_action(&recipe, &crafter, &state, finish.action).success_rate,
                    1.0
                );
            }
        }
    }
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
fn maximum_quality_proposal_keeps_its_funded_completion_suffix() {
    let (recipe, crafter, objective) = fixture(0);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 20;
    state.progress = 8_000;
    state.quality = 20_000;
    state.inner_quiet = 10;
    state.cp = 200;
    state.durability = 40;
    let context = PlannerContext {
        action_uses: 20,
        ..PlannerContext::default()
    };
    let result = recommend_resource_portfolio(
        true,
        &recipe,
        &crafter,
        &state,
        objective,
        RiskPreference::Balanced,
        &context,
        Some(1),
        Some(&weights()),
    );
    let funded = result
        .candidates
        .iter()
        .find(|c| !c.proposal.continuation_actions.is_empty())
        .expect("funded full-quality route");
    let actions = std::iter::once(funded.proposal.decision.action)
        .chain(funded.proposal.continuation_actions.iter().copied());
    let mut replay = state.clone();
    for action in actions {
        let preview = preview_action(&recipe, &crafter, &replay, action);
        assert!(preview.legal);
        assert_eq!(preview.success_rate, 1.0);
        replay = apply_observed_outcome(
            &recipe,
            &crafter,
            &replay,
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .unwrap()
        .next_state;
    }
    assert_eq!(replay.terminal, CraftTerminal::Completed);
    assert_eq!(replay.quality, recipe.quality_max);
    assert!(
        funded.proposal.continuation_actions.len() + 1
            <= (context.action_limit - context.action_uses) as usize
    );
    assert_eq!(funded.completion_probability, 1.0);
    assert_eq!(funded.delivered_quality_utility, 1.0);
    let short = PlannerContext {
        action_limit: 21,
        ..context
    };
    let result = recommend_resource_portfolio(
        true,
        &recipe,
        &crafter,
        &state,
        objective,
        RiskPreference::Balanced,
        &short,
        Some(1),
        Some(&weights()),
    );
    assert!(
        result
            .candidates
            .iter()
            .all(|c| c.proposal.continuation_actions.is_empty())
    );
}

#[test]
fn construction_compares_legal_openings_without_recipe_identity() {
    for required in [0, 22_500] {
        let (recipe, crafter, objective) = fixture(required);
        let mut state = CraftState::initial(&recipe, &crafter);
        let context = PlannerContext::default();
        let recommend = |state: &CraftState, recipe: &RecipeProfile| {
            recommend_portfolio_version(
                GenericSolverVersion::ConstructionPortfolioV4,
                recipe,
                &crafter,
                state,
                objective,
                RiskPreference::Balanced,
                &context,
                Some(1),
                Some(&weights()),
            )
        };
        let result = recommend(&state, &recipe);
        for action in [CraftActionId::Reflect, CraftActionId::MuscleMemory] {
            assert!(
                result
                    .candidates
                    .iter()
                    .any(|c| c.proposal.decision.action == action)
            );
        }
        assert!(result.decision.is_some());
        let renamed = RecipeProfile {
            canonical_recipe_id: 999_999,
            ..recipe
        };
        assert_eq!(result, recommend(&state, &renamed));
        state.step = 2;
        assert!(
            recommend(&state, &recipe)
                .candidates
                .iter()
                .all(|c| !matches!(
                    c.proposal.decision.action,
                    CraftActionId::Reflect | CraftActionId::MuscleMemory
                ))
        );
        let building = recommend(&state, &recipe);
        for action in [CraftActionId::PreparatoryTouch, CraftActionId::PrudentTouch] {
            assert!(
                building
                    .candidates
                    .iter()
                    .any(|c| c.proposal.decision.action == action)
            );
        }
        let combo = building
            .candidates
            .iter()
            .find(|c| {
                c.proposal.decision.action == CraftActionId::BasicTouch
                    && c.proposal.continuation_actions
                        == [CraftActionId::StandardTouch, CraftActionId::AdvancedTouch]
            })
            .expect("discounted combo owns its affordable continuation");
        let mut replay = state.clone();
        for action in std::iter::once(combo.proposal.decision.action)
            .chain(combo.proposal.continuation_actions.iter().copied())
        {
            assert!(preview_action(&recipe, &crafter, &replay, action).legal);
            replay = apply_observed_outcome(
                &recipe,
                &crafter,
                &replay,
                action,
                ObservedActionOutcome {
                    success: true,
                    next_condition: MaterialCondition::Normal,
                },
            )
            .unwrap()
            .next_state;
        }
        assert_eq!(replay.inner_quiet, 3);
        assert!(replay.cp >= 0 && replay.durability > 0);
    }
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
fn sole_proposal_uses_first_action_evidence_without_suffix_search() {
    let (recipe, crafter, objective) = fixture(0);
    let state = CraftState::initial(&recipe, &crafter);
    let result = recommend(
        &recipe,
        &crafter,
        &state,
        objective,
        &PlannerContext::default(),
    );
    assert_eq!(result.candidates.len(), 1);
    assert_eq!(result.candidates[0].forecast_horizon, 1);
    assert_eq!(result.work.continuation_calls, 0);
    assert_eq!(result.candidates[0].completion_probability, 0.0);
    assert_eq!(result.decision.unwrap().action, CraftActionId::Reflect);
}

#[test]
fn completion_witness_respects_the_remaining_action_budget() {
    let (recipe, crafter, objective) = fixture(0);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.progress = recipe.progress_required - 1;
    state.quality = recipe.quality_max;
    state.condition = MaterialCondition::Good;
    state.cp -= 20;
    let context = PlannerContext {
        action_limit: 1,
        ..PlannerContext::default()
    };
    let result = recommend(&recipe, &crafter, &state, objective, &context);
    let recovery = result
        .candidates
        .iter()
        .find(|entry| entry.proposal.decision.action == CraftActionId::TricksOfTheTrade)
        .unwrap();
    assert_eq!(recovery.success.completion, CompletionEvidence::Unknown);
    let decision = result.decision.unwrap();
    let after = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        decision.action,
        ObservedActionOutcome {
            success: true,
            next_condition: MaterialCondition::Normal,
        },
    )
    .unwrap()
    .next_state;
    assert_eq!(after.terminal, CraftTerminal::Completed);
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
