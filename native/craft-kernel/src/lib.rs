//! Dependency-free Rust mechanics and solver kernel.
//!
//! This crate owns current mechanics and policy evolution. Frozen TypeScript
//! fixtures remain migration evidence only; declared parity and mechanics
//! contracts still require shared, step-level verification before promotion.

#![forbid(unsafe_code)]

mod actions;
mod adaptive_policy_matrix;
mod batch;
mod generic_episode;
mod generic_solver;
mod rollout;
mod root_plan_matrix;
mod simulation;
mod transition;
mod ts_migration_port;
mod types;

pub use actions::action_definition;
pub use adaptive_policy_matrix::{
    ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION, ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
    ADAPTIVE_POLICY_MAX_CASES, ADAPTIVE_POLICY_MAX_NODES, ADAPTIVE_POLICY_MAX_OUTPUT_BYTES,
    ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS, ADAPTIVE_POLICY_MAX_PROJECTED_TRANSITIONS,
    ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES, ADAPTIVE_POLICY_MAX_STEPS_PER_CASE,
    ADAPTIVE_POLICY_PROGRAM_VERSION, ADAPTIVE_POLICY_SAFETY_VERSION,
    ADAPTIVE_POLICY_SCENARIO_IDENTITY_VERSION, AdaptivePolicyCase, AdaptivePolicyDecisionResult,
    AdaptivePolicyFinalStatus, AdaptivePolicyIdentity, AdaptivePolicyMatrixRequest,
    AdaptivePolicyMemory, AdaptivePolicyOutcome, AdaptivePolicyParseError, AdaptivePolicyProgram,
    AdaptivePolicyStopReason, AdaptivePolicyTraceStep, adaptive_policy_output_rows,
    adaptive_policy_rows_fnv1a32, execute_adaptive_policy_case, execute_adaptive_policy_matrix,
    format_adaptive_policy_matrix_output, parse_adaptive_policy_matrix_request,
};
pub use batch::{
    BATCH_PROTOCOL_VERSION, BatchBenchmarkResult, BatchCase, BatchParseError, BatchRequest,
    BatchResponse, BatchTransitionResponse, benchmark_batch_requests, format_batch_response,
    parse_batch_request, process_batch_request,
};
pub use generic_episode::{
    GENERIC_EPISODE_ABI_VERSION, GENERIC_EPISODE_MAX_CASES, GENERIC_EPISODE_MAX_OUTPUT_BYTES,
    GENERIC_EPISODE_MAX_PROJECTED_TRANSITIONS, GENERIC_EPISODE_PROTOCOL_VERSION,
    GenericEpisodeCase, GenericEpisodeParseError, GenericEpisodeResult, GenericTraceMode,
    execute_generic_episode, execute_generic_episode_with_observer, format_generic_episode_error,
    format_generic_episode_result, generic_episode_build_profile, generic_episode_rows_fnv1a64,
    generic_episode_rustc, generic_episode_target, parse_generic_episode_case,
    validate_generic_episode_batch,
};
pub use generic_solver::{
    AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION, BranchEvidence, CACHED_PORTFOLIO_POLICY_VERSION,
    CERTIFIED_PORTFOLIO_POLICY_VERSION, COMPACT_PORTFOLIO_POLICY_VERSION,
    CONSTRUCTION_PORTFOLIO_POLICY_VERSION, COORDINATED_PORTFOLIO_POLICY_VERSION, CandidateEvidence,
    CandidateProposal, CandidateSource, CompletionEvidence, ContinuationEngine,
    EQUIVALENT_PORTFOLIO_POLICY_VERSION, EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
    GENERIC_BUDGETED_CONDITION_POLICY_VERSION,
    GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
    GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION,
    GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION,
    GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION, GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION,
    GENERIC_DELIVERY_SHIELD_POLICY_VERSION, GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION,
    GENERIC_GUIDE_DIRECT_PROBE_VERSION, GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION,
    GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION, GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION,
    GENERIC_HARD_QUALITY_POLICY_VERSION, GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION,
    GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION,
    GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
    GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION, GENERIC_OPTION_MPC_POLICY_VERSION,
    GENERIC_OPTION_ROUTE_POLICY_VERSION, GENERIC_PLANNER_CONTEXT_VERSION,
    GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION, GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
    GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION, GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION,
    GENERIC_RUST_BASELINE_POLICY_VERSION, GENERIC_RUST_PRIMARY_POLICY_VERSION,
    GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
    GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION,
    GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION, GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION,
    GENERIC_TS_MIGRATION_PORT_POLICY_VERSION, GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
    GenericDecision, GenericObjective, GenericSolverVersion, OBJECTIVE_PORTFOLIO_POLICY_VERSION,
    PORTFOLIO_HORIZON, PORTFOLIO_MAX_CANDIDATES, PORTFOLIO_SAMPLES, PlannerContext, PlannerOption,
    PlannerPersona, PortfolioRecommendation, PortfolioWork, QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
    QualityUtilityKind, RESOURCE_PORTFOLIO_POLICY_VERSION, ROUTE_PORTFOLIO_CONTEXT_VERSION,
    ROUTE_PORTFOLIO_POLICY_VERSION, RiskPreference, RouteIntent, RouteMemory, RoutePlan,
    advance_planner_context, planner_context_fingerprint, recommend_generic_action,
    recommend_generic_action_with_model, recommend_portfolio_version, recommend_resource_portfolio,
    recommend_route_portfolio,
};
pub use rollout::{
    ConditionTransitionWeights, ROLLOUT_BATCH_PROTOCOL_VERSION, ROLLOUT_MAX_STEPS,
    RolloutBenchmarkResult, RolloutCase, RolloutParseError, RolloutRequest, RolloutResponse,
    RolloutResult, RolloutStopReason, RolloutTraceStep, benchmark_rollout_requests,
    execute_rollout, format_rollout_response, parse_rollout_request, process_rollout_request,
};
pub use root_plan_matrix::{
    FIXED_CONTINUATION_PLAN_VERSION, ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS,
    ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES, ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS,
    ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS,
    ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS, ROOT_PLAN_MATRIX_MAX_CANDIDATES,
    ROOT_PLAN_MATRIX_MAX_OPERATIONS, ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS,
    ROOT_PLAN_MATRIX_MAX_SAMPLES, ROOT_PLAN_MATRIX_PROTOCOL_VERSION, RootPlanCandidate,
    RootPlanMatrixBatchProjection, RootPlanMatrixBenchmarkResult, RootPlanMatrixOutcome,
    RootPlanMatrixParseError, RootPlanMatrixRequest, RootPlanSample, RootPlanTraceMode,
    SCENARIO_MODEL_IDENTITY_VERSION, benchmark_root_plan_matrices, execute_root_plan_matrix,
    fixed_continuation_plan_hash, format_root_plan_matrix_outcome, parse_root_plan_matrix_request,
    validate_root_plan_matrix_batch, validate_root_plan_matrix_benchmark,
};
pub use simulation::{
    ConditionWeights, RandomDrawCursor, SimulatedActionOutcome, draw_simulated_action_outcome,
    sample_condition,
};
pub use transition::{apply_observed_outcome, legal_actions, preview_action};
pub use types::*;

/// Version of the native/TypeScript parity contract.
pub const ORACLE_PARITY_VERSION: &str = "oracle-parity-v0.3";

const CONDITION_SEED_SALT: u32 = 0x43a9_b2f1;
const SUCCESS_SEED_SALT: u32 = 0x9e37_79b9;
const MULBERRY_INCREMENT: u32 = 0x6d2b_79f5;
const LEVEL_TABLE_100: u32 = 690;

fn mix_seed(mut value: u32) -> u32 {
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846c_a68b);
    value ^= value >> 16;
    value
}

/// Mulberry32 state with the same seed mixing and 32-bit wrapping as the
/// TypeScript oracle's `Math.imul` pipeline.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: u32) -> Self {
        let mixed = mix_seed(seed);
        Self {
            state: if mixed == 0 {
                MULBERRY_INCREMENT
            } else {
                mixed
            },
        }
    }

    /// Returns the raw unsigned output before the TypeScript oracle divides by
    /// `2^32` to form a unit-interval `number`.
    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(MULBERRY_INCREMENT);
        let mut next = self.state;
        next = (next ^ (next >> 15)).wrapping_mul(next | 1);
        next ^= next.wrapping_add((next ^ (next >> 7)).wrapping_mul(next | 61));
        next ^ (next >> 14)
    }

    pub fn next_unit_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4_294_967_296.0
    }

    fn advance(&mut self, draws: u64) {
        self.state = self
            .state
            .wrapping_add(MULBERRY_INCREMENT.wrapping_mul(draws as u32));
    }
}

/// Independent condition and success streams derived exactly as in
/// `packages/simulator/src/randomStreams.ts`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EpisodeRandomStream {
    condition: Mulberry32,
    success: Mulberry32,
}

impl EpisodeRandomStream {
    pub fn new(seed: u32) -> Self {
        Self {
            condition: Mulberry32::new(seed ^ CONDITION_SEED_SALT),
            success: Mulberry32::new(seed ^ SUCCESS_SEED_SALT),
        }
    }

    pub fn next_condition_u32(&mut self) -> u32 {
        self.condition.next_u32()
    }

    pub fn next_success_u32(&mut self) -> u32 {
        self.success.next_u32()
    }

    pub fn next_condition(&mut self) -> f64 {
        self.condition.next_unit_f64()
    }

    pub fn next_success(&mut self) -> f64 {
        self.success.next_unit_f64()
    }

    /// Advances the condition generator without iterating through every
    /// discarded output. Mulberry32 changes only by its fixed increment, so
    /// this is exactly equivalent modulo its 32-bit state.
    pub fn advance_condition_draws(&mut self, draws: u64) {
        self.condition.advance(draws);
    }

    /// Advances the independent success generator to a supplied cursor.
    pub fn advance_success_draws(&mut self, draws: u64) {
        self.success.advance(draws);
    }
}

/// Input subset consumed by the TypeScript base-gain formulas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RecipeFormulaInput {
    pub recipe_level: u32,
    pub progress_divider: f64,
    pub quality_divider: f64,
    pub progress_modifier: f64,
    pub quality_modifier: f64,
}

/// Crafter stat subset consumed by the TypeScript base-gain formulas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CrafterFormulaInput {
    pub craftsmanship: f64,
    pub control: f64,
}

fn apply_level_modifier(base_value: f64, modifier: f64, recipe_level: u32) -> f64 {
    if LEVEL_TABLE_100 <= recipe_level {
        // Preserve the TS ordering exactly:
        // Math.fround(baseValue * modifier * Math.fround(0.01))
        let adjusted = base_value * modifier;
        let hundredth = f64::from(0.01_f32);
        f64::from((adjusted * hundredth) as f32)
    } else {
        base_value.floor()
    }
}

pub fn calculate_base_progress(recipe: &RecipeFormulaInput, crafter: &CrafterFormulaInput) -> f64 {
    let base_value = (crafter.craftsmanship * 10.0) / recipe.progress_divider + 2.0;
    apply_level_modifier(base_value, recipe.progress_modifier, recipe.recipe_level)
}

pub fn calculate_base_quality(recipe: &RecipeFormulaInput, crafter: &CrafterFormulaInput) -> f64 {
    let base_value = (crafter.control * 10.0) / recipe.quality_divider + 35.0;
    apply_level_modifier(base_value, recipe.quality_modifier, recipe.recipe_level)
}
