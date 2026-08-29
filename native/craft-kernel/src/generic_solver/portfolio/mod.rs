//! Route proposals share one outcome comparator and observed-event memory.

mod endgame;
mod producers;
mod robust;
mod scoring;
mod selection;
mod types;

pub use types::*;

use super::*;

pub const ROUTE_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.1.0";
pub const RESOURCE_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.2.0";
pub const COORDINATED_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.3.0";
pub const CONSTRUCTION_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.4.0";
pub const CACHED_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.5.0";
pub const COMPACT_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.6.0";
pub const CERTIFIED_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.7.0";
pub const QUALITY_BOUND_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.8.0";
pub const EQUIVALENT_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.9.0";
pub const OBJECTIVE_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.10.0";
pub const AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-route-portfolio-v1.11.0";
pub const COMPLETION_AWARE_PORTFOLIO_EXPERIMENT_VERSION: &str =
    "generic-craft-route-portfolio-exp-completion-aware";
pub const CONDITION_OPPORTUNITY_ABLATION_EXPERIMENT_VERSION: &str =
    "generic-craft-route-portfolio-exp-condition-opportunity-ablation";
pub const EXPERIMENTAL_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-route-portfolio-exp-condition-route-risk";
pub const ROUTE_PORTFOLIO_CONTEXT_VERSION: &str = "route-portfolio-context-v1";
pub const PORTFOLIO_MAX_CANDIDATES: usize = 28;
pub const PORTFOLIO_SAMPLES: usize = 8;
pub const PORTFOLIO_HORIZON: usize = 64;

#[derive(Clone, Copy)]
pub(super) struct Input<'a> {
    pub resource_aware: bool,
    pub completion_aware: bool,
    pub condition_opportunities: bool,
    pub condition_coordination: bool,
    pub coordinated: bool,
    pub construction: bool,
    pub compact_comparison: bool,
    pub robust_suffix: bool,
    pub recipe: &'a RecipeProfile,
    pub crafter: &'a CrafterProfile,
    pub state: &'a CraftState,
    pub objective: GenericObjective,
    pub risk: RiskPreference,
    pub context: &'a PlannerContext,
    pub random_condition_mask: Option<u16>,
    pub condition_weights: Option<&'a ConditionTransitionWeights>,
}

/// Diagnostic and ordinary recommendation use the same decision path.
pub fn recommend_route_portfolio(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
    condition_weights: Option<&ConditionTransitionWeights>,
) -> PortfolioRecommendation {
    recommend_resource_portfolio(
        false,
        recipe,
        crafter,
        state,
        objective,
        risk,
        context,
        random_condition_mask,
        condition_weights,
    )
}

/// Versioned research path; v1.1 remains an exact comparison arm.
pub fn recommend_resource_portfolio(
    resource_aware: bool,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
    condition_weights: Option<&ConditionTransitionWeights>,
) -> PortfolioRecommendation {
    recommend_portfolio_version(
        if resource_aware {
            GenericSolverVersion::ResourcePortfolioV2
        } else {
            GenericSolverVersion::RoutePortfolioV1
        },
        recipe,
        crafter,
        state,
        objective,
        risk,
        context,
        random_condition_mask,
        condition_weights,
    )
}

pub fn recommend_portfolio_version(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    mut objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
    condition_weights: Option<&ConditionTransitionWeights>,
) -> PortfolioRecommendation {
    assert!(version.is_route_portfolio());
    let v111_family = matches!(
        version,
        GenericSolverVersion::AggressiveResourcePortfolioV11
            | GenericSolverVersion::CompletionAwarePortfolioExperiment
            | GenericSolverVersion::ConditionOpportunityAblationExperiment
    );
    let completion_aware = matches!(
        version,
        GenericSolverVersion::CompletionAwarePortfolioExperiment
            | GenericSolverVersion::ConditionOpportunityAblationExperiment
    );
    if v111_family
        && (risk == RiskPreference::Stable
            || recipe.required_quality > 0
            || objective.quality_utility_kind == QualityUtilityKind::HardQualityMaximum)
    {
        // Stable remains the exact established route, and mandatory quality is
        // never traded for optional-quality uplift. The coordinated candidate
        // is reserved for Balanced/Aggressive optional-quality play.
        return recommend_portfolio_version(
            GenericSolverVersion::RoutePortfolioV1,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
            condition_weights,
        );
    }
    if completion_aware
        && (matches!(
            objective.quality_utility_kind,
            QualityUtilityKind::HqChance | QualityUtilityKind::ContinuousCollectability
        ) || context.action_uses
            >= context
                .action_limit
                .saturating_sub(SHARED_CONTINUATION_MIN_ACTION_RUNWAY))
    {
        // HQ and Master have no repeatable v1.11 full-quality tail return.
        // When little action runway remains, every optional-quality objective
        // also uses the established continuation instead of paying for another
        // opportunity.
        return recommend_portfolio_version(
            GenericSolverVersion::RoutePortfolioV1,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
            condition_weights,
        );
    }
    if version == GenericSolverVersion::ObjectivePortfolioV10 {
        // Capability choice follows the product's quality contract, never IDs.
        // Keep the established hard-quality/HQ policy; use coordinated complete
        // suffixes only for the two collectability objectives with useful gains.
        let selected = if recipe.required_quality > 0
            || matches!(
                objective.quality_utility_kind,
                QualityUtilityKind::HardQualityMaximum | QualityUtilityKind::HqChance
            ) {
            GenericSolverVersion::RoutePortfolioV1
        } else {
            GenericSolverVersion::CoordinatedPortfolioV3
        };
        return recommend_portfolio_version(
            selected,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
            condition_weights,
        );
    }
    let mut result = PortfolioRecommendation {
        decision: None,
        candidates: Vec::new(),
        work: PortfolioWork::default(),
    };
    if state.terminal != CraftTerminal::None {
        return result;
    }
    // Adapters receive mechanics only; recipe identity never seeds planning.
    let mechanics = RecipeProfile {
        canonical_recipe_id: 0,
        ..*recipe
    };
    objective.quality_maximum = mechanics.quality_max;
    let input = Input {
        resource_aware: version != GenericSolverVersion::RoutePortfolioV1,
        completion_aware,
        condition_opportunities: version
            != GenericSolverVersion::ConditionOpportunityAblationExperiment,
        condition_coordination: matches!(
            version,
            GenericSolverVersion::AggressiveResourcePortfolioV11
                | GenericSolverVersion::CompletionAwarePortfolioExperiment
                | GenericSolverVersion::ExperimentalPortfolio
        ),
        coordinated: matches!(
            version,
            GenericSolverVersion::CoordinatedPortfolioV3
                | GenericSolverVersion::ConstructionPortfolioV4
                | GenericSolverVersion::CachedPortfolioV5
                | GenericSolverVersion::CompactPortfolioV6
                | GenericSolverVersion::CertifiedPortfolioV7
                | GenericSolverVersion::QualityBoundPortfolioV8
                | GenericSolverVersion::EquivalentPortfolioV9
                | GenericSolverVersion::AggressiveResourcePortfolioV11
                | GenericSolverVersion::CompletionAwarePortfolioExperiment
                | GenericSolverVersion::ConditionOpportunityAblationExperiment
                | GenericSolverVersion::ExperimentalPortfolio
        ),
        construction: version == GenericSolverVersion::ConstructionPortfolioV4,
        compact_comparison: version == GenericSolverVersion::CompactPortfolioV6,
        robust_suffix: version == GenericSolverVersion::CertifiedPortfolioV7,
        recipe: &mechanics,
        crafter,
        state,
        objective,
        risk,
        context,
        random_condition_mask,
        condition_weights,
    };
    // v1.5 restores v1.3 policy semantics and only reuses exact pure queries.
    let search_cache = (version == GenericSolverVersion::CachedPortfolioV5)
        .then(crate::ts_migration_port::SemanticSearchCacheScope::new);
    let quality_bound = (version == GenericSolverVersion::QualityBoundPortfolioV8)
        .then(crate::ts_migration_port::QualityBoundScope::new);
    let proposals = producers::collect(input, &mut result.work);
    result.work.proposals = proposals.len();
    result.work.distinct_actions = proposals
        .iter()
        .map(|p| p.decision.action)
        .collect::<HashSet<_>>()
        .len();
    result.candidates = scoring::evaluate(
        input,
        proposals,
        &mut result.work,
        input.construction || version == GenericSolverVersion::EquivalentPortfolioV9,
    );
    selection::select(input, &mut result);
    if let Some(scope) = &quality_bound {
        (
            result.work.quality_bound_checks,
            result.work.quality_bound_prunes,
            result.work.progress_bound_checks,
            result.work.progress_bound_prunes,
        ) = scope.stats();
    }
    if let Some(scope) = &search_cache {
        (
            result.work.semantic_query_lookups,
            result.work.semantic_query_hits,
        ) = scope.stats();
    }
    result
}

pub(super) fn context_fingerprint(context: &PlannerContext) -> String {
    format!(
        "{}:{:016x}",
        ROUTE_PORTFOLIO_CONTEXT_VERSION,
        types::hash_bytes(format!("{context:?}").as_bytes())
    )
}

pub(super) fn continuation(
    input: Input<'_>,
    engine: ContinuationEngine,
) -> Option<GenericDecision> {
    if input.coordinated && input.state.quality >= input.recipe.quality_max {
        if let Some(action) = producers::maximum_delivery_action(input) {
            return Some(action_decision(action, engine));
        }
    }
    match engine {
        ContinuationEngine::Semantic => crate::ts_migration_port::recommend_ts_migration_port(
            input.recipe,
            input.crafter,
            input.state,
            input.objective,
            input.risk,
            input.context,
        ),
        ContinuationEngine::Budgeted => recommend_generic_action_with_model(
            GenericSolverVersion::BudgetedConditionV15,
            input.recipe,
            input.crafter,
            input.state,
            input.objective,
            input.risk,
            input.context,
            input.random_condition_mask,
            input.condition_weights,
        )
        .filter(|decision| {
            shared_continuation_allows_condition_sample(input.context, decision.action)
        })
        .or_else(|| {
            bounded_shared_continuation_decision(
                input.recipe,
                input.crafter,
                input.state,
                input.objective,
                input.risk,
                input.context,
            )
        }),
    }
}

pub(super) fn intent(action: CraftActionId) -> RouteIntent {
    match action {
        CraftActionId::Veneration | CraftActionId::MuscleMemory => RouteIntent::ProgressSetup,
        CraftActionId::Innovation
        | CraftActionId::QuickInnovation
        | CraftActionId::GreatStrides => RouteIntent::BurstSetup,
        CraftActionId::ByregotsBlessing => RouteIntent::Burst,
        _ => match action_definition(action).category {
            ActionCategory::Progress => RouteIntent::Finish,
            ActionCategory::Quality => RouteIntent::QualityBuild,
            ActionCategory::Repair | ActionCategory::Utility | ActionCategory::Buff => {
                RouteIntent::Recovery
            }
        },
    }
}

pub(super) fn attach_route(
    mut decision: GenericDecision,
    engine: ContinuationEngine,
) -> GenericDecision {
    decision.route = Some(RoutePlan {
        intent: intent(decision.action),
        engine,
        setup: None,
        consumer: None,
        interrupt: false,
    });
    decision
}

pub(super) fn consumer_available(input: Input<'_>, route: RoutePlan) -> Option<CraftActionId> {
    let consumer = route.consumer?;
    let setup_active = match route.setup {
        Some(CraftActionId::Veneration) => input.state.buffs.veneration > 0,
        Some(CraftActionId::MuscleMemory) => input.state.buffs.muscle_memory > 0,
        Some(CraftActionId::QuickInnovation | CraftActionId::Innovation) => {
            input.state.buffs.innovation > 0
        }
        Some(CraftActionId::GreatStrides) => input.state.buffs.great_strides > 0,
        Some(CraftActionId::TrainedPerfection) => input.state.trained_perfection_active,
        Some(CraftActionId::HeartAndSoul) => input.state.heart_and_soul_active,
        _ => true,
    };
    (setup_active && preview_action(input.recipe, input.crafter, input.state, consumer).legal)
        .then_some(consumer)
}

pub(super) fn action_decision(
    action: CraftActionId,
    engine: ContinuationEngine,
) -> GenericDecision {
    attach_route(
        GenericDecision {
            action,
            option: match action_definition(action).category {
                ActionCategory::Progress => PlannerOption::FinishProgress,
                ActionCategory::Quality => PlannerOption::BuildQuality,
                _ => PlannerOption::ResourceRecovery,
            },
            persona: match engine {
                ContinuationEngine::Semantic => PlannerPersona::GuideContinuation,
                ContinuationEngine::Budgeted => PlannerPersona::OpportunityReserveGuide,
            },
            route: None,
        },
        engine,
    )
}
