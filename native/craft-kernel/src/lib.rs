//! Dependency-free Rust mechanics and solver kernel.
//!
//! This crate owns current mechanics and policy evolution. Frozen TypeScript
//! fixtures remain migration evidence only; declared parity and mechanics
//! contracts still require shared, step-level verification before promotion.

#![forbid(unsafe_code)]

mod actions;
mod adaptive_policy_matrix;
mod artisan_expert;
mod batch;
mod candidate_dataset;
mod candidate_teacher;
mod generic_episode;
mod generic_solver;
mod kernel_support;
pub mod main_solver;
mod rollout;
mod root_plan_matrix;
mod simulation;
mod transition;
mod ts_migration_port;
mod types;
mod web_bridge;

mod research_exports {
    pub use crate::actions::action_definition;
    pub use crate::adaptive_policy_matrix::{
        ADAPTIVE_POLICY_FEATURE_SCHEMA_VERSION, ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        ADAPTIVE_POLICY_MAX_CASES, ADAPTIVE_POLICY_MAX_NODES, ADAPTIVE_POLICY_MAX_OUTPUT_BYTES,
        ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS, ADAPTIVE_POLICY_MAX_PROJECTED_TRANSITIONS,
        ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES, ADAPTIVE_POLICY_MAX_STEPS_PER_CASE,
        ADAPTIVE_POLICY_PROGRAM_VERSION, ADAPTIVE_POLICY_SAFETY_VERSION,
        ADAPTIVE_POLICY_SCENARIO_IDENTITY_VERSION, AdaptivePolicyCase,
        AdaptivePolicyDecisionResult, AdaptivePolicyFinalStatus, AdaptivePolicyIdentity,
        AdaptivePolicyMatrixRequest, AdaptivePolicyMemory, AdaptivePolicyOutcome,
        AdaptivePolicyParseError, AdaptivePolicyProgram, AdaptivePolicyStopReason,
        AdaptivePolicyTraceStep, adaptive_policy_output_rows, adaptive_policy_rows_fnv1a32,
        execute_adaptive_policy_case, execute_adaptive_policy_matrix,
        format_adaptive_policy_matrix_output, parse_adaptive_policy_matrix_request,
    };
    pub use crate::batch::{
        BATCH_PROTOCOL_VERSION, BatchBenchmarkResult, BatchCase, BatchParseError, BatchRequest,
        BatchResponse, BatchTransitionResponse, benchmark_batch_requests, format_batch_response,
        parse_batch_request, process_batch_request,
    };
    pub use crate::candidate_dataset::{
        CANDIDATE_DATASET_CANDIDATE_COLUMNS, CANDIDATE_DATASET_DECISION_COLUMNS,
        CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION, CANDIDATE_DATASET_MAX_OUTPUT_BYTES,
        CANDIDATE_DATASET_SCHEMA_VERSION, CandidateDatasetDecisionRecord, CandidateDatasetExport,
        CandidateDatasetRow, candidate_dataset_candidate_header, candidate_dataset_decision_header,
        candidate_dataset_rows_fnv1a64, execute_candidate_dataset_episode,
        execute_candidate_dataset_episode_with_ordinal, parse_candidate_dataset_row,
    };
    pub use crate::candidate_teacher::{
        CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION,
        CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION, CANDIDATE_TEACHER_PROBE_COLUMNS,
        CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION, CandidateTeacherConsensusChoice,
        CandidateTeacherConsensusConfig, CandidateTeacherConsensusCounts,
        CandidateTeacherConsensusDisposition, CandidateTeacherConsensusEpisodeExport,
        CandidateTeacherPreferenceExport, CandidateTeacherPreferenceRecord,
        candidate_teacher_consensus_identity, candidate_teacher_episode_identity,
        candidate_teacher_probe_header, execute_candidate_teacher_consensus_episode,
        execute_candidate_teacher_preference_episode,
        format_candidate_teacher_consensus_episode_error,
        format_candidate_teacher_consensus_episode_result,
        format_candidate_teacher_consensus_outcome_signature,
        format_candidate_teacher_episode_error, format_candidate_teacher_episode_outcome_signature,
        format_candidate_teacher_episode_result, recommend_candidate_teacher_consensus,
    };
    pub use crate::generic_episode::{
        GENERIC_EPISODE_ABI_VERSION, GENERIC_EPISODE_MAX_CASES, GENERIC_EPISODE_MAX_OUTPUT_BYTES,
        GENERIC_EPISODE_MAX_PROJECTED_TRANSITIONS, GENERIC_EPISODE_PROTOCOL_VERSION,
        GenericEpisodeCase, GenericEpisodeParseError, GenericEpisodeResult, GenericTraceMode,
        execute_generic_episode, execute_generic_episode_with_observer,
        execute_generic_episode_with_portfolio_budget, format_generic_episode_error,
        format_generic_episode_result, generic_episode_build_profile, generic_episode_rows_fnv1a64,
        generic_episode_rustc, generic_episode_target, parse_generic_episode_case,
        validate_generic_episode_batch,
    };
    pub use crate::generic_solver::{
        AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION, ARTISAN_EXPERT_REFERENCE_POLICY_VERSION,
        BranchEvidence, CACHED_PORTFOLIO_POLICY_VERSION, CERTIFIED_PORTFOLIO_POLICY_VERSION,
        COMPACT_PORTFOLIO_POLICY_VERSION, COMPLETION_AWARE_PORTFOLIO_EXPERIMENT_VERSION,
        COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION,
        CONDITION_OPPORTUNITY_ABLATION_EXPERIMENT_VERSION,
        CONDITION_WORK_COMPLETION_GUARD_POLICY_VERSION, CONDITION_WORK_SCHEDULER_POLICY_VERSION,
        CONSTRUCTION_PORTFOLIO_POLICY_VERSION, COORDINATED_PORTFOLIO_POLICY_VERSION,
        CandidateEvidence, CandidateProposal, CandidateSource, CompletionEvidence,
        ConditionAssignmentEvidence, ConditionWork, ContinuationEngine,
        EQUIVALENT_PORTFOLIO_POLICY_VERSION, EXPANDED_FULL_QUALITY_CERTIFICATE_EXPERIMENT_VERSION,
        EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
        EXTERNAL_REFERENCE_CERTIFIED_FINISH_EXPERIMENT_VERSION,
        EXTERNAL_REFERENCE_FULL_QUALITY_CERTIFICATE_EXPERIMENT_VERSION,
        FULL_QUALITY_CERTIFICATE_DEPTH5_EXPERIMENT_VERSION,
        FULL_QUALITY_CERTIFICATE_DEPTH6_EXPERIMENT_VERSION,
        FULL_QUALITY_CERTIFICATE_DEPTH7_EXPERIMENT_VERSION,
        GENERIC_BUDGETED_CONDITION_POLICY_VERSION,
        GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
        GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION,
        GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION,
        GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION, GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION,
        GENERIC_DELIVERY_SHIELD_POLICY_VERSION, GENERIC_EXTERNAL_REFERENCE_POLICY_VERSION,
        GENERIC_EXTERNAL_REFERENCE_V2_POLICY_VERSION,
        GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION, GENERIC_GUIDE_DIRECT_PROBE_VERSION,
        GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION, GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION,
        GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION, GENERIC_HARD_QUALITY_POLICY_VERSION,
        GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION,
        GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION,
        GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
        GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION, GENERIC_OPTION_MPC_POLICY_VERSION,
        GENERIC_OPTION_ROUTE_POLICY_VERSION, GENERIC_PLANNER_CONTEXT_VERSION,
        GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION,
        GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
        GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
        GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION, GENERIC_RUST_BASELINE_POLICY_VERSION,
        GENERIC_RUST_PRIMARY_POLICY_VERSION, GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
        GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION,
        GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION, GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION,
        GENERIC_TS_MIGRATION_PORT_POLICY_VERSION, GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
        GenericDecision, GenericObjective, GenericSolverVersion,
        OBJECTIVE_PORTFOLIO_POLICY_VERSION, PORTFOLIO_HORIZON, PORTFOLIO_MAX_CANDIDATES,
        PORTFOLIO_SAMPLES, PORTFOLIO_TEACHER_MAX_HORIZON, PORTFOLIO_TEACHER_MAX_SAMPLES,
        PlannerContext, PlannerOption, PlannerPersona, PortfolioEvaluationBudget,
        PortfolioRecommendation, PortfolioWork, QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
        QualityUtilityKind, RESOURCE_PORTFOLIO_POLICY_VERSION, ROUTE_PORTFOLIO_CONTEXT_VERSION,
        ROUTE_PORTFOLIO_POLICY_VERSION, RiskPreference, RouteIntent, RouteMemory, RoutePlan,
        advance_planner_context, planner_context_fingerprint, recommend_generic_action,
        recommend_generic_action_with_model, recommend_portfolio_version,
        recommend_portfolio_with_evaluation_budget, recommend_resource_portfolio,
        recommend_route_portfolio,
    };
    pub use crate::kernel_support::*;
    pub use crate::rollout::{
        ConditionTransitionWeights, ROLLOUT_BATCH_PROTOCOL_VERSION, ROLLOUT_MAX_STEPS,
        RolloutBenchmarkResult, RolloutCase, RolloutParseError, RolloutRequest, RolloutResponse,
        RolloutResult, RolloutStopReason, RolloutTraceStep, benchmark_rollout_requests,
        execute_rollout, format_rollout_response, parse_rollout_request, process_rollout_request,
    };
    pub use crate::root_plan_matrix::{
        FIXED_CONTINUATION_PLAN_VERSION, ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS,
        ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES, ROOT_PLAN_MATRIX_MAX_BATCH_PROJECTED_TRANSITIONS,
        ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS,
        ROOT_PLAN_MATRIX_MAX_BENCHMARK_PROJECTED_TRANSITIONS, ROOT_PLAN_MATRIX_MAX_CANDIDATES,
        ROOT_PLAN_MATRIX_MAX_OPERATIONS, ROOT_PLAN_MATRIX_MAX_PROJECTED_TRANSITIONS,
        ROOT_PLAN_MATRIX_MAX_SAMPLES, ROOT_PLAN_MATRIX_PROTOCOL_VERSION, RootPlanCandidate,
        RootPlanMatrixBatchProjection, RootPlanMatrixBenchmarkResult, RootPlanMatrixOutcome,
        RootPlanMatrixParseError, RootPlanMatrixRequest, RootPlanSample, RootPlanTraceMode,
        SCENARIO_MODEL_IDENTITY_VERSION, benchmark_root_plan_matrices, execute_root_plan_matrix,
        fixed_continuation_plan_hash, format_root_plan_matrix_outcome,
        parse_root_plan_matrix_request, validate_root_plan_matrix_batch,
        validate_root_plan_matrix_benchmark,
    };
    pub use crate::simulation::{
        ConditionWeights, RandomDrawCursor, SimulatedActionOutcome, draw_simulated_action_outcome,
        sample_condition,
    };
    pub use crate::transition::{apply_observed_outcome, legal_actions, preview_action};
    pub use crate::types::*;
    pub use crate::web_bridge::{
        WEB_PLANNER_ABI_VERSION, WEB_PLANNER_MAX_INPUT_BYTES, WEB_PLANNER_MAX_OUTPUT_BYTES,
        WebPlannerAdvance, WebPlannerReply, WebPlannerSession, format_web_planner_reply,
        parse_web_planner_request,
    };
}

pub(crate) use research_exports::*;

/// Repository-internal evaluation and compatibility surface.
///
/// This namespace is not part of the supported integration API.
#[doc(hidden)]
pub mod research {
    pub use crate::research_exports::*;
}
