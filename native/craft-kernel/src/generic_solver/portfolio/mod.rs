//! Route proposals share one outcome comparator and observed-event memory.

mod producers;
mod scoring;
mod selection;
mod types;

pub use types::*;

use super::*;

pub const ROUTE_PORTFOLIO_POLICY_VERSION: &str = "generic-craft-route-portfolio-v1.1.0";
pub const ROUTE_PORTFOLIO_CONTEXT_VERSION: &str = "route-portfolio-context-v1";
pub const PORTFOLIO_MAX_CANDIDATES: usize = 16;
pub const PORTFOLIO_SAMPLES: usize = 8;
pub const PORTFOLIO_HORIZON: usize = 64;

#[derive(Clone, Copy)]
pub(super) struct Input<'a> {
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
    mut objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
    condition_weights: Option<&ConditionTransitionWeights>,
) -> PortfolioRecommendation {
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
        recipe: &mechanics,
        crafter,
        state,
        objective,
        risk,
        context,
        random_condition_mask,
        condition_weights,
    };
    let proposals = producers::collect(input, &mut result.work);
    result.work.proposals = proposals.len();
    result.work.distinct_actions = proposals
        .iter()
        .map(|p| p.decision.action)
        .collect::<HashSet<_>>()
        .len();
    result.candidates = scoring::evaluate(input, proposals, &mut result.work);
    selection::select(input, &mut result);
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
