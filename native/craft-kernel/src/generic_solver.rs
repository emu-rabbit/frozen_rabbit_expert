use std::collections::HashSet;
use std::fmt;
use std::str::FromStr;

mod portfolio;
pub use portfolio::*;

use crate::{
    ActionCategory, ActionPreview, ConditionTransitionWeights, CraftActionId, CraftState,
    CraftTerminal, CrafterProfile, EpisodeRandomStream, MATERIAL_CONDITION_COUNT,
    MaterialCondition, ObservedActionOutcome, RandomDrawCursor, RecipeProfile, action_definition,
    apply_observed_outcome, draw_simulated_action_outcome, legal_actions, preview_action,
};

pub const GENERIC_RUST_BASELINE_POLICY_VERSION: &str = "generic-craft-rust-bootstrap-v0.6.0";
pub const GENERIC_HARD_QUALITY_POLICY_VERSION: &str = "generic-craft-hard-quality-context-v0.7.0";
pub const GENERIC_RUST_PRIMARY_POLICY_VERSION: &str = "generic-craft-rust-primary-v0.8.0";
pub const GENERIC_OPTION_ROUTE_POLICY_VERSION: &str = "generic-craft-option-route-v0.9.0";
pub const GENERIC_OPTION_MPC_POLICY_VERSION: &str = "generic-craft-option-mpc-v0.10.0";
pub const GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION: &str = "generic-craft-guide-option-mpc-v0.11.0";
pub const GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION: &str = "generic-craft-guide-lease-mpc-v0.12.0";
pub const GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION: &str = "generic-craft-guide-phase-mpc-v0.13.0";
pub const GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION: &str =
    "generic-craft-strategy-portfolio-mpc-v0.14.0";
pub const GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION: &str =
    "generic-craft-capability-portfolio-mpc-v0.15.0";
pub const GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION: &str =
    "generic-craft-deep-portfolio-mpc-v0.16.0";
pub const GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION: &str =
    "generic-craft-strategy-program-mpc-v0.17.0";
pub const GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION: &str =
    "generic-craft-opportunity-reserve-v0.18.0";
pub const GENERIC_DELIVERY_SHIELD_POLICY_VERSION: &str = "generic-craft-delivery-shield-v0.19.0";
pub const GENERIC_BUDGETED_CONDITION_POLICY_VERSION: &str =
    "generic-craft-budgeted-condition-v0.20.0";
pub const GENERIC_TS_MIGRATION_PORT_POLICY_VERSION: &str =
    "generic-craft-ts-v0.6-semantic-port-v0.21.0";
pub const GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-condition-set-portfolio-v0.22.0";
pub const GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-capability-condition-set-portfolio-v0.23.0";
pub const GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-condition-continuation-portfolio-v0.24.0";
pub const GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-objective-capability-portfolio-v0.25.0";
pub const GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION: &str =
    "generic-craft-progress-quality-shield-v0.26.0";
pub const GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-specialist-resource-portfolio-v0.27.0";
pub const GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-progress-bank-portfolio-v0.28.0";
pub const GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION: &str =
    "generic-craft-flat-opportunity-portfolio-v0.29.0";
pub const GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION: &str =
    "generic-craft-specialist-resource-guard-v0.30.0";
pub const GENERIC_GUIDE_DIRECT_PROBE_VERSION: &str = "research-guide-direct-v0.1.0";
pub const GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION: &str =
    "research-integrated-guide-direct-v0.1.0";
pub const GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION: &str =
    "research-progress-reserve-guide-direct-v0.1.0";
pub const GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION: &str =
    "research-opportunity-reserve-guide-direct-v0.1.0";
pub const GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION: &str = "research-risk-forward-direct-v0.1.0";
pub const GENERIC_PLANNER_CONTEXT_VERSION: &str = "generic-planner-context-v3";
pub const GUIDE_INTEGRATED_DECISION_MEMORY_VERSION: &str =
    "guide-integrated-decision-memory-v0.5.0";

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum GenericSolverVersion {
    RustBaselineV1,
    HardQualityV2,
    RustPrimaryV3,
    OptionRouteV4,
    OptionMpcV5,
    GuideOptionMpcV6,
    GuideLeaseMpcV7,
    GuidePhaseMpcV8,
    StrategyPortfolioMpcV9,
    CapabilityPortfolioMpcV10,
    DeepPortfolioMpcV11,
    StrategyProgramMpcV12,
    OpportunityReserveV13,
    DeliveryShieldV14,
    BudgetedConditionV15,
    TsMigrationPortV16,
    ConditionSetPortfolioV17,
    CapabilityConditionSetPortfolioV18,
    ConditionContinuationPortfolioV19,
    ObjectiveCapabilityPortfolioV20,
    ProgressQualityShieldV21,
    SpecialistResourcePortfolioV22,
    ProgressBankPortfolioV23,
    FlatOpportunityPortfolioV24,
    SpecialistResourceGuardV25,
    RoutePortfolioV1,
    ResourcePortfolioV2,
    CoordinatedPortfolioV3,
    ConstructionPortfolioV4,
    CachedPortfolioV5,
    CompactPortfolioV6,
    CertifiedPortfolioV7,
    QualityBoundPortfolioV8,
    EquivalentPortfolioV9,
    ObjectivePortfolioV10,
    AggressiveResourcePortfolioV11,
    CompletionAwarePortfolioV12,
    CompletionAwarePortfolioExperiment,
    ConditionOpportunityAblationExperiment,
    ExperimentalPortfolio,
    GuideDirectProbe,
    IntegratedGuideDirectProbe,
    ProgressReserveGuideDirectProbe,
    OpportunityReserveGuideDirectProbe,
    RiskForwardDirectProbe,
}

impl GenericSolverVersion {
    pub const fn is_route_portfolio(self) -> bool {
        matches!(
            self,
            Self::RoutePortfolioV1
                | Self::ResourcePortfolioV2
                | Self::CoordinatedPortfolioV3
                | Self::ConstructionPortfolioV4
                | Self::CachedPortfolioV5
                | Self::CompactPortfolioV6
                | Self::CertifiedPortfolioV7
                | Self::QualityBoundPortfolioV8
                | Self::EquivalentPortfolioV9
                | Self::ObjectivePortfolioV10
                | Self::AggressiveResourcePortfolioV11
                | Self::CompletionAwarePortfolioV12
                | Self::CompletionAwarePortfolioExperiment
                | Self::ConditionOpportunityAblationExperiment
                | Self::ExperimentalPortfolio
        )
    }
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RustBaselineV1 => GENERIC_RUST_BASELINE_POLICY_VERSION,
            Self::HardQualityV2 => GENERIC_HARD_QUALITY_POLICY_VERSION,
            Self::RustPrimaryV3 => GENERIC_RUST_PRIMARY_POLICY_VERSION,
            Self::OptionRouteV4 => GENERIC_OPTION_ROUTE_POLICY_VERSION,
            Self::OptionMpcV5 => GENERIC_OPTION_MPC_POLICY_VERSION,
            Self::GuideOptionMpcV6 => GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION,
            Self::GuideLeaseMpcV7 => GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION,
            Self::GuidePhaseMpcV8 => GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION,
            Self::StrategyPortfolioMpcV9 => GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION,
            Self::CapabilityPortfolioMpcV10 => GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION,
            Self::DeepPortfolioMpcV11 => GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION,
            Self::StrategyProgramMpcV12 => GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION,
            Self::OpportunityReserveV13 => GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION,
            Self::DeliveryShieldV14 => GENERIC_DELIVERY_SHIELD_POLICY_VERSION,
            Self::BudgetedConditionV15 => GENERIC_BUDGETED_CONDITION_POLICY_VERSION,
            Self::TsMigrationPortV16 => GENERIC_TS_MIGRATION_PORT_POLICY_VERSION,
            Self::ConditionSetPortfolioV17 => GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
            Self::CapabilityConditionSetPortfolioV18 => {
                GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION
            }
            Self::ConditionContinuationPortfolioV19 => {
                GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION
            }
            Self::ObjectiveCapabilityPortfolioV20 => {
                GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION
            }
            Self::ProgressQualityShieldV21 => GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
            Self::SpecialistResourcePortfolioV22 => {
                GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION
            }
            Self::ProgressBankPortfolioV23 => GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION,
            Self::FlatOpportunityPortfolioV24 => GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION,
            Self::SpecialistResourceGuardV25 => GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
            Self::RoutePortfolioV1 => ROUTE_PORTFOLIO_POLICY_VERSION,
            Self::ResourcePortfolioV2 => RESOURCE_PORTFOLIO_POLICY_VERSION,
            Self::CoordinatedPortfolioV3 => COORDINATED_PORTFOLIO_POLICY_VERSION,
            Self::ConstructionPortfolioV4 => CONSTRUCTION_PORTFOLIO_POLICY_VERSION,
            Self::CachedPortfolioV5 => CACHED_PORTFOLIO_POLICY_VERSION,
            Self::CompactPortfolioV6 => COMPACT_PORTFOLIO_POLICY_VERSION,
            Self::CertifiedPortfolioV7 => CERTIFIED_PORTFOLIO_POLICY_VERSION,
            Self::QualityBoundPortfolioV8 => QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
            Self::EquivalentPortfolioV9 => EQUIVALENT_PORTFOLIO_POLICY_VERSION,
            Self::ObjectivePortfolioV10 => OBJECTIVE_PORTFOLIO_POLICY_VERSION,
            Self::AggressiveResourcePortfolioV11 => AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION,
            Self::CompletionAwarePortfolioV12 => COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION,
            Self::CompletionAwarePortfolioExperiment => {
                COMPLETION_AWARE_PORTFOLIO_EXPERIMENT_VERSION
            }
            Self::ConditionOpportunityAblationExperiment => {
                CONDITION_OPPORTUNITY_ABLATION_EXPERIMENT_VERSION
            }
            Self::ExperimentalPortfolio => EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
            Self::GuideDirectProbe => GENERIC_GUIDE_DIRECT_PROBE_VERSION,
            Self::IntegratedGuideDirectProbe => GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION,
            Self::ProgressReserveGuideDirectProbe => {
                GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION
            }
            Self::OpportunityReserveGuideDirectProbe => {
                GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION
            }
            Self::RiskForwardDirectProbe => GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION,
        }
    }
}

impl fmt::Display for GenericSolverVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for GenericSolverVersion {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            GENERIC_RUST_BASELINE_POLICY_VERSION => Ok(Self::RustBaselineV1),
            GENERIC_HARD_QUALITY_POLICY_VERSION => Ok(Self::HardQualityV2),
            GENERIC_RUST_PRIMARY_POLICY_VERSION => Ok(Self::RustPrimaryV3),
            GENERIC_OPTION_ROUTE_POLICY_VERSION => Ok(Self::OptionRouteV4),
            GENERIC_OPTION_MPC_POLICY_VERSION => Ok(Self::OptionMpcV5),
            GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION => Ok(Self::GuideOptionMpcV6),
            GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION => Ok(Self::GuideLeaseMpcV7),
            GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION => Ok(Self::GuidePhaseMpcV8),
            GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION => Ok(Self::StrategyPortfolioMpcV9),
            GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION => Ok(Self::CapabilityPortfolioMpcV10),
            GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION => Ok(Self::DeepPortfolioMpcV11),
            GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION => Ok(Self::StrategyProgramMpcV12),
            GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION => Ok(Self::OpportunityReserveV13),
            GENERIC_DELIVERY_SHIELD_POLICY_VERSION => Ok(Self::DeliveryShieldV14),
            GENERIC_BUDGETED_CONDITION_POLICY_VERSION => Ok(Self::BudgetedConditionV15),
            GENERIC_TS_MIGRATION_PORT_POLICY_VERSION => Ok(Self::TsMigrationPortV16),
            GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION => Ok(Self::ConditionSetPortfolioV17),
            GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::CapabilityConditionSetPortfolioV18)
            }
            GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::ConditionContinuationPortfolioV19)
            }
            GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::ObjectiveCapabilityPortfolioV20)
            }
            GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION => Ok(Self::ProgressQualityShieldV21),
            GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::SpecialistResourcePortfolioV22)
            }
            GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION => Ok(Self::ProgressBankPortfolioV23),
            GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::FlatOpportunityPortfolioV24)
            }
            GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION => {
                Ok(Self::SpecialistResourceGuardV25)
            }
            GENERIC_GUIDE_DIRECT_PROBE_VERSION => Ok(Self::GuideDirectProbe),
            ROUTE_PORTFOLIO_POLICY_VERSION => Ok(Self::RoutePortfolioV1),
            RESOURCE_PORTFOLIO_POLICY_VERSION => Ok(Self::ResourcePortfolioV2),
            COORDINATED_PORTFOLIO_POLICY_VERSION => Ok(Self::CoordinatedPortfolioV3),
            CONSTRUCTION_PORTFOLIO_POLICY_VERSION => Ok(Self::ConstructionPortfolioV4),
            CACHED_PORTFOLIO_POLICY_VERSION => Ok(Self::CachedPortfolioV5),
            COMPACT_PORTFOLIO_POLICY_VERSION => Ok(Self::CompactPortfolioV6),
            CERTIFIED_PORTFOLIO_POLICY_VERSION => Ok(Self::CertifiedPortfolioV7),
            QUALITY_BOUND_PORTFOLIO_POLICY_VERSION => Ok(Self::QualityBoundPortfolioV8),
            EQUIVALENT_PORTFOLIO_POLICY_VERSION => Ok(Self::EquivalentPortfolioV9),
            OBJECTIVE_PORTFOLIO_POLICY_VERSION => Ok(Self::ObjectivePortfolioV10),
            AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION => {
                Ok(Self::AggressiveResourcePortfolioV11)
            }
            COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION => Ok(Self::CompletionAwarePortfolioV12),
            COMPLETION_AWARE_PORTFOLIO_EXPERIMENT_VERSION => {
                Ok(Self::CompletionAwarePortfolioExperiment)
            }
            CONDITION_OPPORTUNITY_ABLATION_EXPERIMENT_VERSION => {
                Ok(Self::ConditionOpportunityAblationExperiment)
            }
            EXPERIMENTAL_PORTFOLIO_POLICY_VERSION => Ok(Self::ExperimentalPortfolio),
            GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION => Ok(Self::IntegratedGuideDirectProbe),
            GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION => {
                Ok(Self::ProgressReserveGuideDirectProbe)
            }
            GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION => {
                Ok(Self::OpportunityReserveGuideDirectProbe)
            }
            GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION => Ok(Self::RiskForwardDirectProbe),
            _ => Err(format!("unknown generic solver version: {value}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RiskPreference {
    Stable,
    Balanced,
    Aggressive,
}

impl RiskPreference {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Balanced => "balanced",
            Self::Aggressive => "aggressive",
        }
    }
}

impl fmt::Display for RiskPreference {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for RiskPreference {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "stable" => Ok(Self::Stable),
            "balanced" => Ok(Self::Balanced),
            "aggressive" => Ok(Self::Aggressive),
            _ => Err(format!("unknown risk preference: {value}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum PlannerOption {
    SecureProgress,
    BuildQuality,
    HardQualityCashout,
    FinishProgress,
    Recovery,
    ProgressWindow,
    InnerQuietBuild,
    QualityCycle,
    QualityBurst,
    SafeFinish,
    ResourceRecovery,
    ConditionFishing,
    CertifiedSuffix,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum PlannerPersona {
    GuideContinuation,
    SharedContinuation,
    IntegratedGuideContinuation,
    ProgressReserveGuide,
    OpportunityReserveGuide,
    LegacyContinuation,
    OptionRoute,
    RiskForward,
}

impl PlannerPersona {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::GuideContinuation => "guide-continuation",
            Self::SharedContinuation => "shared-continuation",
            Self::IntegratedGuideContinuation => "integrated-guide-continuation",
            Self::ProgressReserveGuide => "progress-reserve-guide",
            Self::OpportunityReserveGuide => "opportunity-reserve-guide",
            Self::LegacyContinuation => "legacy-continuation",
            Self::OptionRoute => "option-route",
            Self::RiskForward => "risk-forward",
        }
    }
}

impl PlannerOption {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SecureProgress => "secure-progress",
            Self::BuildQuality => "build-quality",
            Self::HardQualityCashout => "hard-quality-cashout",
            Self::FinishProgress => "finish-progress",
            Self::Recovery => "recovery",
            Self::ProgressWindow => "progress-window",
            Self::InnerQuietBuild => "inner-quiet-build",
            Self::QualityCycle => "quality-cycle",
            Self::QualityBurst => "quality-burst",
            Self::SafeFinish => "safe-finish",
            Self::ResourceRecovery => "resource-recovery",
            Self::ConditionFishing => "bounded-condition-fishing",
            Self::CertifiedSuffix => "certified-suffix",
        }
    }
}

impl fmt::Display for PlannerOption {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct PlannerContext {
    pub route_memory: RouteMemory,
    pub active_option: PlannerOption,
    pub option_steps: u32,
    pub observed_transitions: u32,
    pub manipulation_uses: u8,
    pub waste_not_uses: u8,
    pub innovation_uses: u8,
    pub great_strides_uses: u8,
    pub cashout_cycles: u8,
    pub action_uses: u32,
    pub last_quality_action_use: u32,
    pub last_precise_touch_action_use: u32,
    pub reliable_quality_first_route_index: i8,
    pub active_persona: PlannerPersona,
    pub resume_persona: Option<PlannerPersona>,
    pub resume_option: Option<PlannerOption>,
    pub fishing_used: bool,
    pub fishing_rolls_remaining: u8,
    pub shared_continuation_used: bool,
    pub action_limit: u32,
    pub risk_attempts: u8,
    pub progress_risk_attempts: u8,
    pub quality_risk_attempts: u8,
    pub risk_failures: u8,
    pub consecutive_risk_failures: u8,
    pub last_action: Option<CraftActionId>,
}

impl Default for PlannerContext {
    fn default() -> Self {
        Self {
            route_memory: RouteMemory::default(),
            active_option: PlannerOption::SecureProgress,
            option_steps: 0,
            observed_transitions: 0,
            manipulation_uses: 0,
            waste_not_uses: 0,
            innovation_uses: 0,
            great_strides_uses: 0,
            cashout_cycles: 0,
            action_uses: 0,
            last_quality_action_use: 0,
            last_precise_touch_action_use: 0,
            reliable_quality_first_route_index: 0,
            active_persona: PlannerPersona::OptionRoute,
            resume_persona: None,
            resume_option: None,
            fishing_used: false,
            fishing_rolls_remaining: 0,
            shared_continuation_used: false,
            action_limit: 80,
            risk_attempts: 0,
            progress_risk_attempts: 0,
            quality_risk_attempts: 0,
            risk_failures: 0,
            consecutive_risk_failures: 0,
            last_action: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QualityUtilityKind {
    HardQualityMaximum,
    CollectabilityTiers,
    ContinuousCollectability,
    HqChance,
}

impl QualityUtilityKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HardQualityMaximum => "hard-quality-max",
            Self::CollectabilityTiers => "collectability-tiers",
            Self::ContinuousCollectability => "continuous-collectability",
            Self::HqChance => "hq-chance",
        }
    }
}

impl FromStr for QualityUtilityKind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "hard-quality-max" => Ok(Self::HardQualityMaximum),
            "collectability-tiers" => Ok(Self::CollectabilityTiers),
            "continuous-collectability" => Ok(Self::ContinuousCollectability),
            "hq-chance" => Ok(Self::HqChance),
            _ => Err(format!("unknown objective evidence: {value}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GenericObjective {
    pub quality_maximum: i32,
    pub protected_quality_floor: i32,
    pub adaptive_completion: bool,
    pub quality_utility_kind: QualityUtilityKind,
    pub quality_milestone_count: u8,
    pub quality_milestones: [i32; 4],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GenericDecision {
    pub route: Option<RoutePlan>,
    pub action: CraftActionId,
    pub option: PlannerOption,
    pub persona: PlannerPersona,
}

const PROGRESS_FINISH_ORDER: &[CraftActionId] = &[
    CraftActionId::IntensiveSynthesis,
    CraftActionId::Groundwork,
    CraftActionId::CarefulSynthesis,
    CraftActionId::PrudentSynthesis,
    CraftActionId::BasicSynthesis,
    CraftActionId::RapidSynthesis,
];

const QUALITY_GAIN_ORDER: &[CraftActionId] = &[
    CraftActionId::PreciseTouch,
    CraftActionId::PreparatoryTouch,
    CraftActionId::AdvancedTouch,
    CraftActionId::StandardTouch,
    CraftActionId::PrudentTouch,
    CraftActionId::TrainedFinesse,
    CraftActionId::DaringTouch,
    CraftActionId::HastyTouch,
    CraftActionId::BasicTouch,
];

const COMPLETION_ROUTE_ACTIONS: &[CraftActionId] = &[
    CraftActionId::IntensiveSynthesis,
    CraftActionId::Groundwork,
    CraftActionId::CarefulSynthesis,
    CraftActionId::PrudentSynthesis,
    CraftActionId::BasicSynthesis,
    CraftActionId::Veneration,
    CraftActionId::TrainedPerfection,
    CraftActionId::ImmaculateMend,
    CraftActionId::MastersMend,
    CraftActionId::Manipulation,
    CraftActionId::WasteNot2,
    CraftActionId::WasteNot,
];

const JOINT_ROUTE_ACTIONS: &[CraftActionId] = &[
    CraftActionId::Reflect,
    CraftActionId::PreciseTouch,
    CraftActionId::BasicTouch,
    CraftActionId::StandardTouch,
    CraftActionId::AdvancedTouch,
    CraftActionId::PrudentTouch,
    CraftActionId::PreparatoryTouch,
    CraftActionId::TrainedFinesse,
    CraftActionId::HastyTouch,
    CraftActionId::DaringTouch,
    CraftActionId::Innovation,
    CraftActionId::GreatStrides,
    CraftActionId::ByregotsBlessing,
    CraftActionId::Manipulation,
    CraftActionId::WasteNot2,
    CraftActionId::WasteNot,
    CraftActionId::TrainedPerfection,
    CraftActionId::ImmaculateMend,
    CraftActionId::MastersMend,
    CraftActionId::Veneration,
    CraftActionId::IntensiveSynthesis,
    CraftActionId::Groundwork,
    CraftActionId::CarefulSynthesis,
    CraftActionId::PrudentSynthesis,
    CraftActionId::BasicSynthesis,
    CraftActionId::RapidSynthesis,
    CraftActionId::DelicateSynthesis,
];

const RELIABLE_QUALITY_FIRST_ROUTE: &[CraftActionId] = &[
    CraftActionId::Reflect,
    CraftActionId::Manipulation,
    CraftActionId::BasicTouch,
    CraftActionId::RefinedTouch,
    CraftActionId::Innovation,
    CraftActionId::DelicateSynthesis,
    CraftActionId::BasicTouch,
    CraftActionId::StandardTouch,
    CraftActionId::AdvancedTouch,
    CraftActionId::TrainedPerfection,
    CraftActionId::GreatStrides,
    CraftActionId::Innovation,
    CraftActionId::PreparatoryTouch,
    CraftActionId::GreatStrides,
    CraftActionId::ByregotsBlessing,
    CraftActionId::Veneration,
    CraftActionId::WasteNot2,
    CraftActionId::Groundwork,
    CraftActionId::ImmaculateMend,
    CraftActionId::Groundwork,
    CraftActionId::Veneration,
    CraftActionId::Groundwork,
    CraftActionId::Groundwork,
    CraftActionId::Groundwork,
    CraftActionId::Groundwork,
    CraftActionId::BasicSynthesis,
];
const RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX: i8 = 15;

fn replay_reliable_quality_first_suffix(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    route_index: usize,
    first_action: CraftActionId,
) -> Option<usize> {
    let mut projected = state.clone();
    let mut actions_used = 0usize;
    for action in std::iter::once(first_action).chain(
        RELIABLE_QUALITY_FIRST_ROUTE
            .iter()
            .copied()
            .skip(route_index + 1),
    ) {
        let preview = preview_action(recipe, crafter, &projected, action);
        if !preview.legal || preview.success_rate != 1.0 {
            return None;
        }
        projected = apply_observed_outcome(
            recipe,
            crafter,
            &projected,
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .ok()?
        .next_state;
        actions_used += 1;
        if projected.terminal != CraftTerminal::None {
            return (projected.terminal == CraftTerminal::Completed
                && projected.quality >= objective.quality_maximum)
                .then_some(actions_used);
        }
    }
    None
}

/// Replays the complete observable-state suffix before committing its first
/// action. Future conditions are deliberately Normal; the already observed
/// root condition is kept. This preserves the route's continuation identity
/// without reading the episode RNG stream or blindly following a macro.
fn reliable_quality_first_route_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    let recorded_index = context.reliable_quality_first_route_index;
    let route_index = if state.quality >= objective.quality_maximum
        && (0..RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX).contains(&recorded_index)
    {
        usize::try_from(RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX).ok()?
    } else {
        usize::try_from(recorded_index).ok()?
    };
    let expected = *RELIABLE_QUALITY_FIRST_ROUTE.get(route_index)?;
    let expected_actions = replay_reliable_quality_first_suffix(
        recipe,
        crafter,
        state,
        objective,
        route_index,
        expected,
    )?;

    if state.condition == MaterialCondition::Good
        && state.quality < objective.quality_maximum
        && action_definition(expected).category == ActionCategory::Quality
    {
        let expected_preview = preview_action(recipe, crafter, state, expected);
        let precise_preview = preview_action(recipe, crafter, state, CraftActionId::PreciseTouch);
        if precise_preview.legal
            && precise_preview.success_rate == 1.0
            && precise_preview.quality_gain > expected_preview.quality_gain
            && precise_preview.cp_cost <= expected_preview.cp_cost
            && precise_preview.durability_cost <= expected_preview.durability_cost
            && replay_reliable_quality_first_suffix(
                recipe,
                crafter,
                state,
                objective,
                route_index,
                CraftActionId::PreciseTouch,
            )
            .is_some()
        {
            return Some(CraftActionId::PreciseTouch);
        }
    }

    if state.quality >= objective.quality_maximum && expected_actions > 1 {
        let shortcuts = if state.condition == MaterialCondition::Good {
            &[CraftActionId::IntensiveSynthesis][..]
        } else if state.condition == MaterialCondition::Malleable {
            &[
                CraftActionId::Groundwork,
                CraftActionId::CarefulSynthesis,
                CraftActionId::PrudentSynthesis,
                CraftActionId::BasicSynthesis,
            ][..]
        } else {
            &[][..]
        };
        for candidate in shortcuts.iter().copied() {
            if candidate == expected {
                continue;
            }
            let preview = preview_action(recipe, crafter, state, candidate);
            if !preview.legal || preview.success_rate != 1.0 || preview.progress_gain <= 0 {
                continue;
            }
            let Some(candidate_actions) = replay_reliable_quality_first_suffix(
                recipe,
                crafter,
                state,
                objective,
                route_index,
                candidate,
            ) else {
                continue;
            };
            let expected_preview = preview_action(recipe, crafter, state, expected);
            let locally_dominates = action_definition(expected).category
                == ActionCategory::Progress
                && preview.progress_gain > expected_preview.progress_gain
                && preview.cp_cost <= expected_preview.cp_cost
                && preview.durability_cost <= expected_preview.durability_cost;
            if candidate_actions < expected_actions
                || locally_dominates && candidate_actions <= expected_actions
            {
                return Some(candidate);
            }
        }
    }

    Some(expected)
}

fn is_reliable_quality_first_condition_shortcut(action: CraftActionId) -> bool {
    matches!(
        action,
        CraftActionId::IntensiveSynthesis
            | CraftActionId::Groundwork
            | CraftActionId::CarefulSynthesis
            | CraftActionId::PrudentSynthesis
            | CraftActionId::BasicSynthesis
    )
}

fn completion_state_key(state: &CraftState) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        state.step,
        state.progress,
        state.quality,
        state.durability,
        state.cp,
        state.condition,
        state.inner_quiet,
        state.buffs.waste_not,
        state.buffs.veneration,
        state.buffs.great_strides,
        state.buffs.innovation,
        state.buffs.final_appraisal,
        state.buffs.manipulation,
        state.buffs.muscle_memory,
        state.buffs.expedience,
        i32::from(state.trained_perfection_available),
        i32::from(state.trained_perfection_active),
        state.careful_observation_uses_left,
        i32::from(state.heart_and_soul_available),
        i32::from(state.heart_and_soul_active),
        i32::from(state.quick_innovation_available),
        state.combo_from.map_or("-", CraftActionId::as_str),
    )
}

/// Finds the first action of a bounded, all-success, Normal-continuation route
/// that satisfies the real mechanics completion rule. This is a certificate,
/// not a stochastic success claim: it is used only to avoid spending away the
/// deterministic delivery route of an optional-quality craft.
fn deterministic_completion_first(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    max_actions: usize,
) -> Option<CraftActionId> {
    if state.terminal == CraftTerminal::Completed {
        return None;
    }
    let mut frontier = vec![(state.clone(), None)];
    let mut visited = HashSet::from([completion_state_key(state)]);
    let mut expanded = 0usize;
    for _ in 0..max_actions {
        let mut next_frontier = Vec::new();
        for (current, first) in frontier {
            for action in COMPLETION_ROUTE_ACTIONS.iter().copied() {
                let preview = preview_action(recipe, crafter, &current, action);
                if !preview.legal || preview.success_rate != 1.0 {
                    continue;
                }
                let Ok(result) = apply_observed_outcome(
                    recipe,
                    crafter,
                    &current,
                    action,
                    ObservedActionOutcome {
                        success: true,
                        next_condition: MaterialCondition::Normal,
                    },
                ) else {
                    continue;
                };
                let next = result.next_state;
                if next.terminal == CraftTerminal::Completed {
                    return Some(first.unwrap_or(action));
                }
                if next.terminal != CraftTerminal::None {
                    continue;
                }
                expanded += 1;
                if expanded >= 4_096 {
                    return None;
                }
                let key = completion_state_key(&next);
                if visited.insert(key) {
                    next_frontier.push((next, Some(first.unwrap_or(action))));
                }
            }
        }
        if next_frontier.is_empty() {
            return None;
        }
        frontier = next_frontier;
    }
    None
}

fn joint_route_score(recipe: &RecipeProfile, state: &CraftState) -> i64 {
    let quality = i64::from(state.quality.min(recipe.required_quality.max(1))) * 1_000_000
        / i64::from(recipe.required_quality.max(1));
    let progress = i64::from(state.progress.min(recipe.progress_required)) * 550_000
        / i64::from(recipe.progress_required);
    let setup = i64::from(state.inner_quiet) * 18_000
        + i64::from(state.buffs.innovation) * 4_000
        + i64::from(state.buffs.great_strides) * 7_000
        + i64::from(state.buffs.veneration) * 2_000
        + i64::from(state.buffs.manipulation) * 2_000;
    quality + progress + setup + i64::from(state.durability) * 500 + i64::from(state.cp) * 60
}

fn redundant_joint_setup(state: &CraftState, action: CraftActionId) -> bool {
    matches!(
        action,
        CraftActionId::Innovation | CraftActionId::QuickInnovation
    ) && state.buffs.innovation > 1
        || action == CraftActionId::GreatStrides && state.buffs.great_strides > 1
        || action == CraftActionId::Veneration && state.buffs.veneration > 1
        || matches!(action, CraftActionId::WasteNot | CraftActionId::WasteNot2)
            && state.buffs.waste_not > 1
        || action == CraftActionId::Manipulation && state.buffs.manipulation > 2
}

/// Bounded joint route search for hard-quality crafts. It treats
/// the already observed root condition exactly and future conditions as
/// Normal, then replans after every real observation. Stable only admits
/// deterministic actions; balanced/aggressive may use an all-success route as
/// a bounded-risk proposal, penalized by its cumulative success probability.
fn bounded_joint_completion_first(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    risk: RiskPreference,
) -> Option<CraftActionId> {
    #[derive(Clone)]
    struct Node {
        state: CraftState,
        first: Option<CraftActionId>,
        score: i64,
        route_probability: f64,
    }

    let mut frontier = vec![Node {
        state: state.clone(),
        first: None,
        score: joint_route_score(recipe, state),
        route_probability: 1.0,
    }];
    let mut visited = HashSet::from([completion_state_key(state)]);
    let mut expanded = 0usize;
    for _ in 0..32 {
        let mut next_frontier = Vec::new();
        let mut completions = Vec::new();
        for node in frontier {
            for action in JOINT_ROUTE_ACTIONS.iter().copied() {
                if redundant_joint_setup(&node.state, action) {
                    continue;
                }
                let preview = preview_action(recipe, crafter, &node.state, action);
                if !preview.legal
                    || preview.success_rate <= 0.0
                    || risk == RiskPreference::Stable && preview.success_rate != 1.0
                {
                    continue;
                }
                let Ok(result) = apply_observed_outcome(
                    recipe,
                    crafter,
                    &node.state,
                    action,
                    ObservedActionOutcome {
                        success: true,
                        next_condition: MaterialCondition::Normal,
                    },
                ) else {
                    continue;
                };
                let next = result.next_state;
                let first = Some(node.first.unwrap_or(action));
                let route_probability = node.route_probability * preview.success_rate;
                let score = joint_route_score(recipe, &next)
                    - ((1.0 - route_probability) * 180_000.0) as i64;
                if next.terminal == CraftTerminal::Completed {
                    completions.push(Node {
                        score,
                        state: next,
                        first,
                        route_probability,
                    });
                    continue;
                }
                if next.terminal != CraftTerminal::None {
                    continue;
                }
                expanded += 1;
                if expanded >= 40_000 {
                    break;
                }
                let key = completion_state_key(&next);
                if visited.insert(key) {
                    next_frontier.push(Node {
                        score,
                        state: next,
                        first,
                        route_probability,
                    });
                }
            }
            if expanded >= 40_000 {
                break;
            }
        }
        if !completions.is_empty() {
            completions.sort_by(|left, right| right.score.cmp(&left.score));
            return completions[0].first;
        }
        if next_frontier.is_empty() || expanded >= 40_000 {
            return None;
        }
        next_frontier.sort_by(|left, right| right.score.cmp(&left.score));
        next_frontier.truncate(192);
        frontier = next_frontier;
    }
    None
}

fn preserves_deterministic_completion(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
    risk: RiskPreference,
) -> bool {
    let preview = preview_action(recipe, crafter, state, action);
    if !preview.legal {
        return false;
    }
    let branches = if preview.success_rate < 1.0 && risk == RiskPreference::Stable {
        &[true, false][..]
    } else {
        &[true][..]
    };
    branches.iter().copied().all(|success| {
        let Some(next) = branch_state(recipe, crafter, state, action, success) else {
            return false;
        };
        next.terminal == CraftTerminal::Completed
            || next.terminal == CraftTerminal::None
                && deterministic_completion_first(recipe, crafter, &next, 8).is_some()
    })
}

/// Once the policy has reached its protected fallback floor and no ordinary
/// route survives, balanced/aggressive may spend the final durability action
/// on a progress skill whose observed success completes immediately. This is
/// intentionally outside `safe_preview`: that common shield rejects a branch
/// whose failure is terminal, while this bounded fallback exists precisely for
/// the state where there is no remaining route to protect.
fn contingent_completion_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
) -> Option<CraftActionId> {
    if state.quality < objective.protected_quality_floor || risk == RiskPreference::Stable {
        return None;
    }
    let mut candidates = PROGRESS_FINISH_ORDER
        .iter()
        .copied()
        .filter_map(|action| {
            let preview = preview_action(recipe, crafter, state, action);
            if !preview.legal || preview.success_rate <= 0.0 || preview.success_rate >= 1.0 {
                return None;
            }
            let success = branch_state(recipe, crafter, state, action, true)?;
            if success.terminal != CraftTerminal::Completed {
                return None;
            }
            Some((action, preview.success_rate, preview.progress_gain))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .total_cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn delivery_shield_decision(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
) -> Option<GenericDecision> {
    if state.quality < objective.protected_quality_floor {
        return None;
    }
    if let Some(action) = deterministic_completion_first(recipe, crafter, state, 8) {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::SafeFinish,
            persona: PlannerPersona::OpportunityReserveGuide,
        });
    }
    contingent_completion_action(recipe, crafter, state, objective, risk).map(|action| {
        GenericDecision {
            route: None,
            action,
            option: PlannerOption::SafeFinish,
            persona: PlannerPersona::OpportunityReserveGuide,
        }
    })
}

fn uses_delivery_shield(version: GenericSolverVersion) -> bool {
    matches!(
        version,
        GenericSolverVersion::DeliveryShieldV14 | GenericSolverVersion::BudgetedConditionV15
    )
}

fn excludes_fallback_final_appraisal(
    version: GenericSolverVersion,
    careful_observation_uses_left: i32,
    last_action: Option<CraftActionId>,
    cp: i32,
    action: CraftActionId,
) -> bool {
    action == CraftActionId::FinalAppraisal
        && (matches!(
            version,
            GenericSolverVersion::RustPrimaryV3
                | GenericSolverVersion::OptionRouteV4
                | GenericSolverVersion::OptionMpcV5
        ) || version == GenericSolverVersion::DeliveryShieldV14
            && !(careful_observation_uses_left > 0
                || last_action == Some(CraftActionId::Observe) && cp >= 8)
            || version == GenericSolverVersion::BudgetedConditionV15)
}

fn normal_preview(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
) -> ActionPreview {
    let mut normalized = state.clone();
    normalized.condition = MaterialCondition::Normal;
    normalized.buffs.veneration = 0;
    normalized.buffs.muscle_memory = 0;
    normalized.buffs.waste_not = 0;
    normalized.trained_perfection_active = false;
    normalized.durability = normalized.durability.max(20);
    normalized.cp = normalized.cp.max(120).min(crafter.max_cp);
    preview_action(recipe, crafter, &normalized, action)
}

fn deterministic_finish_gain(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
) -> i32 {
    [
        CraftActionId::CarefulSynthesis,
        CraftActionId::PrudentSynthesis,
        CraftActionId::BasicSynthesis,
    ]
    .into_iter()
    .map(|action| normal_preview(recipe, crafter, state, action))
    .filter(|preview| preview.legal && preview.success_rate == 1.0)
    .map(|preview| preview.progress_gain)
    .max()
    .unwrap_or(1)
    .max(1)
}

fn progress_reserve_target(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    risk: RiskPreference,
) -> i32 {
    if recipe.required_quality == 0 {
        let initial = CraftState::initial(recipe, crafter);
        let rapid = preview_action(recipe, crafter, &initial, CraftActionId::RapidSynthesis);
        if rapid.legal && rapid.progress_gain > 0 {
            return (recipe.progress_required - rapid.progress_gain * 2).clamp(
                0,
                (f64::from(recipe.progress_required) * 0.9).round() as i32,
            );
        }
        return 0;
    }
    if version == GenericSolverVersion::RustBaselineV1 {
        return ((f64::from(recipe.progress_required) * 0.55).round() as i32)
            .min(recipe.progress_required - 1)
            .max(0);
    }
    let actions = match risk {
        RiskPreference::Stable => 3,
        RiskPreference::Balanced => 2,
        RiskPreference::Aggressive => 2,
    };
    let discrete =
        recipe.progress_required - deterministic_finish_gain(recipe, crafter, state) * actions;
    let ratio_floor = (f64::from(recipe.progress_required) * 0.62).round() as i32;
    discrete
        .max(ratio_floor)
        .min(recipe.progress_required - 1)
        .max(0)
}

fn branch_state(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    action: CraftActionId,
    success: bool,
) -> Option<CraftState> {
    apply_observed_outcome(
        recipe,
        crafter,
        state,
        action,
        ObservedActionOutcome {
            success,
            next_condition: MaterialCondition::Normal,
        },
    )
    .ok()
    .map(|result| result.next_state)
}

fn completion_floor(recipe: &RecipeProfile, _objective: GenericObjective) -> i32 {
    // The policy quality floor shapes utility; it must never replace the
    // mechanics completion rule. In particular, required_quality == 0 crafts
    // remain deliverable even when the protected fallback floor is missed.
    recipe.required_quality
}

fn safe_preview(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    action: CraftActionId,
) -> Option<ActionPreview> {
    let preview = preview_action(recipe, crafter, state, action);
    if !preview.legal {
        return None;
    }
    if action == CraftActionId::FinalAppraisal && state.buffs.final_appraisal > 0 {
        return None;
    }
    if action == CraftActionId::Observe && context.last_action == Some(CraftActionId::Observe) {
        return None;
    }
    let floor = completion_floor(recipe, objective);
    let success = branch_state(recipe, crafter, state, action, true)?;
    if success.terminal == CraftTerminal::Failed
        || success.terminal == CraftTerminal::Completed && success.quality < floor
    {
        return None;
    }
    if preview.success_rate < 1.0 {
        let failure = branch_state(recipe, crafter, state, action, false)?;
        if failure.terminal == CraftTerminal::Failed {
            return None;
        }
        if risk == RiskPreference::Stable && failure.durability <= 0 {
            return None;
        }
    }
    Some(preview)
}

fn first_safe(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    actions: &[CraftActionId],
) -> Option<CraftActionId> {
    actions.iter().copied().find(|action| {
        safe_preview(recipe, crafter, state, objective, risk, context, *action).is_some()
    })
}

/// Validate one condition-sampling fallback without changing the ordinary
/// legal-action order. The first sample preserves historical recovery coverage;
/// a second consecutive Observe is allowed only inside this explicit budget.
fn budgeted_condition_sample_preview(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    action: CraftActionId,
) -> Option<ActionPreview> {
    if !matches!(
        action,
        CraftActionId::CarefulObservation | CraftActionId::Observe
    ) || state.condition == MaterialCondition::Good
    {
        return None;
    }

    let continuing = context.active_option == PlannerOption::ConditionFishing;
    if continuing && context.fishing_rolls_remaining == 0 {
        return None;
    }

    let mut bounded_context = context.clone();
    // The old common gate rejects consecutive Observe by last action alone.
    // This version owns a finite ConditionFishing budget, so it bypasses that
    // historical gate without allowing a no-step action to reset the budget.
    if action == CraftActionId::Observe && continuing {
        bounded_context.last_action = None;
    }
    safe_preview(
        recipe,
        crafter,
        state,
        objective,
        risk,
        &bounded_context,
        action,
    )
}

fn delivery_recovery_condition_sample(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    [CraftActionId::CarefulObservation, CraftActionId::Observe]
        .into_iter()
        .find(|action| {
            budgeted_condition_sample_preview(
                recipe, crafter, state, objective, risk, context, *action,
            )
            .is_some()
        })
}

fn best_progress_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    allow_completion: bool,
) -> Option<CraftActionId> {
    let mut candidates = PROGRESS_FINISH_ORDER
        .iter()
        .copied()
        .filter_map(|action| {
            let preview = safe_preview(recipe, crafter, state, objective, risk, context, action)?;
            let completes = state.progress + preview.progress_gain >= recipe.progress_required;
            if completes && !allow_completion {
                return None;
            }
            let deterministic = i32::from(preview.success_rate == 1.0);
            let expected = f64::from(preview.progress_gain) * preview.success_rate;
            Some((action, completes, deterministic, expected, preview.cp_cost))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| right.3.total_cmp(&left.3))
            .then_with(|| left.4.cmp(&right.4))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn best_quality_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    let cashout_reserve =
        24 + if state.buffs.great_strides == 0 {
            32
        } else {
            0
        } + if state.buffs.innovation == 0 { 18 } else { 0 };
    let mut candidates = QUALITY_GAIN_ORDER
        .iter()
        .copied()
        .filter_map(|action| {
            let preview = safe_preview(recipe, crafter, state, objective, risk, context, action)?;
            if preview.quality_gain <= 0 {
                return None;
            }
            if state.inner_quiet >= 5
                && state.cp - preview.cp_cost < cashout_reserve
                && preview.cp_cost > 0
                && action != CraftActionId::TrainedFinesse
            {
                return None;
            }
            let condition_priority = i32::from(
                state.condition == MaterialCondition::Good && action == CraftActionId::PreciseTouch,
            );
            let deterministic = i32::from(preview.success_rate == 1.0);
            let expected = f64::from(preview.quality_gain) * preview.success_rate;
            Some((
                action,
                condition_priority,
                deterministic,
                expected,
                preview.cp_cost,
                preview.durability_cost,
            ))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| right.2.cmp(&left.2))
            .then_with(|| right.3.total_cmp(&left.3))
            .then_with(|| left.4.cmp(&right.4))
            .then_with(|| left.5.cmp(&right.5))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn select_recovery(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.durability > 20 || state.buffs.manipulation > 0 {
        return None;
    }
    if state.durability <= 10
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::TrainedPerfection],
        )
    {
        return Some(action);
    }
    let pliant = state.condition == MaterialCondition::Pliant;
    if context.manipulation_uses < 3
        && (pliant || state.durability <= 15)
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(action);
    }
    if state.durability <= 10
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::ImmaculateMend, CraftActionId::MastersMend],
        )
    {
        return Some(action);
    }
    None
}

fn hard_quality_cashout(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.inner_quiet < 8 || state.quality >= objective.quality_maximum {
        return None;
    }
    if state.condition == MaterialCondition::Good
        && state.inner_quiet < 10
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreciseTouch],
        )
    {
        return Some(action);
    }
    if state.buffs.innovation == 0
        && state.cp >= 74
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Innovation],
        )
    {
        return Some(action);
    }
    if state.buffs.great_strides == 0
        && state.cp >= 56
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::GreatStrides],
        )
    {
        return Some(action);
    }
    first_safe(
        recipe,
        crafter,
        state,
        objective,
        risk,
        context,
        &[CraftActionId::ByregotsBlessing],
    )
}

fn select_quality(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.condition == MaterialCondition::Good {
        if state.inner_quiet == 10
            && state.buffs.great_strides > 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::ByregotsBlessing],
            )
        {
            return Some(action);
        }
        if state.inner_quiet < 10
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::PreciseTouch],
            )
        {
            return Some(action);
        }
    }

    if matches!(
        version,
        GenericSolverVersion::HardQualityV2
            | GenericSolverVersion::RustPrimaryV3
            | GenericSolverVersion::OptionRouteV4
            | GenericSolverVersion::OptionMpcV5
    ) && recipe.required_quality > 0
        && (context.active_option == PlannerOption::HardQualityCashout || state.inner_quiet == 10)
        && let Some(action) = hard_quality_cashout(recipe, crafter, state, objective, risk, context)
    {
        return Some(action);
    }

    if state.inner_quiet == 10 {
        if state.buffs.innovation > 0
            && state.buffs.great_strides == 0
            && state.cp >= 56
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::GreatStrides],
            )
        {
            return Some(action);
        }
        if state.buffs.great_strides > 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::ByregotsBlessing],
            )
        {
            return Some(action);
        }
        if state.buffs.innovation > 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::TrainedFinesse],
            )
        {
            return Some(action);
        }
    }

    if state.condition == MaterialCondition::Pliant {
        if context.manipulation_uses < 2
            && state.buffs.manipulation == 0
            && state.durability <= 30
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Manipulation],
            )
        {
            return Some(action);
        }
        if state.buffs.innovation == 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Innovation],
            )
        {
            return Some(action);
        }
    }

    if context.waste_not_uses < 2
        && state.buffs.waste_not == 0
        && (state.durability >= 30
            || matches!(
                version,
                GenericSolverVersion::RustPrimaryV3
                    | GenericSolverVersion::OptionRouteV4
                    | GenericSolverVersion::OptionMpcV5
            ) && recipe.required_quality > 0
                && state.durability >= 10
                && (state.buffs.manipulation > 0 || state.trained_perfection_active))
        && state.cp >= 130
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::WasteNot2],
        )
    {
        return Some(action);
    }
    if state.buffs.innovation == 0
        && state.cp >= 92
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Innovation],
        )
    {
        return Some(action);
    }

    if (state.buffs.waste_not > 0
        || matches!(
            state.condition,
            MaterialCondition::Sturdy | MaterialCondition::Robust
        ))
        && state.inner_quiet <= 8
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreparatoryTouch],
        )
    {
        return Some(action);
    }

    let preferred = match risk {
        RiskPreference::Stable => &[
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
            CraftActionId::HastyTouch,
        ][..],
        RiskPreference::Balanced => &[
            CraftActionId::HastyTouch,
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
        ][..],
        RiskPreference::Aggressive => &[
            CraftActionId::DaringTouch,
            CraftActionId::HastyTouch,
            CraftActionId::PrudentTouch,
        ][..],
    };
    first_safe(recipe, crafter, state, objective, risk, context, preferred)
        .or_else(|| best_quality_action(recipe, crafter, state, objective, risk, context))
}

fn select_progress(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.condition == MaterialCondition::Good
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::IntensiveSynthesis],
        )
    {
        return Some(action);
    }
    if state.buffs.veneration == 0
        && state.buffs.muscle_memory == 0
        && state.cp >= 40
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Veneration],
        )
    {
        return Some(action);
    }
    let actions = if state.condition == MaterialCondition::Malleable {
        &[
            CraftActionId::RapidSynthesis,
            CraftActionId::Groundwork,
            CraftActionId::CarefulSynthesis,
        ][..]
    } else if state.condition == MaterialCondition::Centered {
        &[
            CraftActionId::RapidSynthesis,
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
        ][..]
    } else if risk == RiskPreference::Stable {
        &[
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
            CraftActionId::BasicSynthesis,
        ][..]
    } else {
        &[
            CraftActionId::RapidSynthesis,
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
        ][..]
    };
    first_safe(recipe, crafter, state, objective, risk, context, actions)
        .or_else(|| best_progress_action(recipe, crafter, state, objective, risk, context, false))
}

fn is_progress_risk(action: CraftActionId) -> bool {
    action == CraftActionId::RapidSynthesis
}

fn is_quality_risk(action: CraftActionId) -> bool {
    matches!(
        action,
        CraftActionId::HastyTouch | CraftActionId::DaringTouch
    )
}

fn risk_budgets(risk: RiskPreference) -> (u8, u8, u8, u8) {
    match risk {
        RiskPreference::Stable => (4, 3, 6, 2),
        // The released-guide extraction observed up to 12 progress bets,
        // eight quality bets and 17 total bets in a completed episode. These
        // are permissive audit boundaries, not a goal of zero failures.
        RiskPreference::Balanced => (12, 8, 17, 5),
        RiskPreference::Aggressive => (14, 10, 22, 7),
    }
}

fn risk_available(
    context: &PlannerContext,
    risk: RiskPreference,
    category: ActionCategory,
) -> bool {
    let (progress_budget, quality_budget, total_budget, failure_streak_budget) = risk_budgets(risk);
    context.risk_attempts < total_budget
        && context.consecutive_risk_failures < failure_streak_budget
        && match category {
            ActionCategory::Progress => context.progress_risk_attempts < progress_budget,
            ActionCategory::Quality => context.quality_risk_attempts < quality_budget,
            _ => false,
        }
}

fn progress_headroom_ready(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    risk: RiskPreference,
) -> bool {
    if state.progress <= 0 {
        return false;
    }
    let finish_actions = match risk {
        RiskPreference::Stable => 3,
        RiskPreference::Balanced | RiskPreference::Aggressive => 2,
    };
    let remaining = recipe.progress_required.saturating_sub(state.progress);
    remaining <= deterministic_finish_gain(recipe, crafter, state) * finish_actions
}

fn needs_option_recovery(state: &CraftState) -> bool {
    state.durability <= 10 && state.buffs.manipulation == 0 && !state.trained_perfection_active
}

fn project_deterministic_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: &[CraftActionId],
) -> Option<CraftState> {
    let mut projected = state.clone();
    for action in actions.iter().copied() {
        let preview = preview_action(recipe, crafter, &projected, action);
        if !preview.legal || preview.success_rate != 1.0 {
            return None;
        }
        projected = apply_observed_outcome(
            recipe,
            crafter,
            &projected,
            action,
            ObservedActionOutcome {
                success: true,
                next_condition: MaterialCondition::Normal,
            },
        )
        .ok()?
        .next_state;
        if projected.terminal != CraftTerminal::None {
            break;
        }
    }
    Some(projected)
}

fn quality_burst_sequences(state: &CraftState) -> Vec<Vec<CraftActionId>> {
    let mut candidates = Vec::<Vec<CraftActionId>>::new();
    if state.condition == MaterialCondition::Good {
        candidates.push(vec![CraftActionId::ByregotsBlessing]);
    }
    let mut innovation_first = Vec::new();
    if state.buffs.innovation == 0 {
        innovation_first.push(CraftActionId::Innovation);
    }
    if state.buffs.great_strides == 0 {
        innovation_first.push(CraftActionId::GreatStrides);
    }
    innovation_first.push(CraftActionId::ByregotsBlessing);
    candidates.push(innovation_first);

    if state.buffs.innovation == 0 && state.buffs.great_strides == 0 {
        candidates.push(vec![
            CraftActionId::GreatStrides,
            CraftActionId::Innovation,
            CraftActionId::ByregotsBlessing,
        ]);
    }

    candidates.sort_by_key(Vec::len);
    candidates
}

fn certified_quality_burst_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
) -> Option<Vec<CraftActionId>> {
    if state.inner_quiet < 8 || state.quality >= objective.quality_maximum {
        return None;
    }
    let candidates = quality_burst_sequences(state);
    candidates.into_iter().find(|actions| {
        let Some(projected) = project_deterministic_actions(recipe, crafter, state, actions) else {
            return false;
        };
        if projected.terminal == CraftTerminal::Completed {
            return projected.quality >= objective.quality_maximum;
        }
        projected.terminal == CraftTerminal::None
            && projected.quality >= objective.quality_maximum
            && deterministic_completion_first(recipe, crafter, &projected, 8).is_some()
    })
}

fn intermediate_quality_burst_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<Vec<CraftActionId>> {
    if state.inner_quiet < 10
        || context.cashout_cycles > 0
        || !progress_headroom_ready(recipe, crafter, state, risk)
    {
        return None;
    }
    quality_burst_sequences(state).into_iter().find(|actions| {
        let Some(projected) = project_deterministic_actions(recipe, crafter, state, actions) else {
            return false;
        };
        if projected.terminal != CraftTerminal::None || projected.inner_quiet != 0 {
            return false;
        }
        let gain = projected.quality.saturating_sub(state.quality);
        let meaningful_gain =
            i64::from(gain) * 100 >= i64::from(objective.quality_maximum.max(1)) * 12;
        let reaches_rebuild_band =
            i64::from(projected.quality) * 100 >= i64::from(objective.quality_maximum.max(1)) * 42;
        let rebuild_funded = projected.cp >= 96
            || projected.buffs.manipulation > 0
            || projected.trained_perfection_available
            || projected.trained_perfection_active;
        meaningful_gain && reaches_rebuild_band && rebuild_funded && projected.durability > 0
    })
}

fn quality_burst_actions(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<Vec<CraftActionId>> {
    certified_quality_burst_actions(recipe, crafter, state, objective).or_else(|| {
        intermediate_quality_burst_actions(recipe, crafter, state, objective, risk, context)
    })
}

fn option_budget(option: PlannerOption) -> u32 {
    match option {
        PlannerOption::ProgressWindow => 14,
        PlannerOption::InnerQuietBuild => 18,
        PlannerOption::QualityCycle => 16,
        PlannerOption::QualityBurst => 8,
        PlannerOption::SafeFinish => 10,
        PlannerOption::ResourceRecovery => 5,
        PlannerOption::ConditionFishing => 2,
        PlannerOption::CertifiedSuffix => RELIABLE_QUALITY_FIRST_ROUTE.len() as u32,
        _ => 16,
    }
}

fn option_after_recovery(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    risk: RiskPreference,
) -> PlannerOption {
    if state.quality >= recipe.required_quality {
        PlannerOption::SafeFinish
    } else if !progress_headroom_ready(recipe, crafter, state, risk) {
        PlannerOption::ProgressWindow
    } else if state.inner_quiet < 10 {
        PlannerOption::InnerQuietBuild
    } else {
        PlannerOption::QualityCycle
    }
}

fn should_enter_condition_fishing(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> bool {
    if context.fishing_used
        || state.inner_quiet < 10
        || state.condition == MaterialCondition::Good
        || state.buffs.great_strides == 0
        || !progress_headroom_ready(recipe, crafter, state, risk)
        || f64::from(state.quality) / f64::from(objective.quality_maximum.max(1)) < 0.5
        || state.cp < 80
        || state.durability < 20
    {
        return false;
    }
    safe_preview(
        recipe,
        crafter,
        state,
        objective,
        risk,
        context,
        CraftActionId::Observe,
    )
    .is_some()
}

fn settle_option_route(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> PlannerOption {
    let mut option = match context.active_option {
        PlannerOption::ProgressWindow
        | PlannerOption::InnerQuietBuild
        | PlannerOption::QualityCycle
        | PlannerOption::QualityBurst
        | PlannerOption::SafeFinish
        | PlannerOption::ResourceRecovery
        | PlannerOption::ConditionFishing
        | PlannerOption::CertifiedSuffix => context.active_option,
        _ => PlannerOption::ProgressWindow,
    };
    for _ in 0..12 {
        if option != PlannerOption::ResourceRecovery
            && option != PlannerOption::ConditionFishing
            && needs_option_recovery(state)
        {
            return PlannerOption::ResourceRecovery;
        }
        if state.quality >= objective.quality_maximum {
            return PlannerOption::SafeFinish;
        }
        let next = match option {
            PlannerOption::ProgressWindow
                if progress_headroom_ready(recipe, crafter, state, risk)
                    || context.option_steps >= option_budget(option) =>
            {
                PlannerOption::InnerQuietBuild
            }
            PlannerOption::InnerQuietBuild
                if state.inner_quiet >= 10 || context.option_steps >= option_budget(option) =>
            {
                PlannerOption::QualityCycle
            }
            PlannerOption::QualityCycle if state.inner_quiet < 10 => PlannerOption::InnerQuietBuild,
            PlannerOption::QualityCycle
                if quality_burst_actions(recipe, crafter, state, objective, risk, context)
                    .is_some() =>
            {
                PlannerOption::QualityBurst
            }
            PlannerOption::QualityBurst if state.inner_quiet < 8 => PlannerOption::InnerQuietBuild,
            PlannerOption::QualityBurst
                if should_enter_condition_fishing(
                    recipe, crafter, state, objective, risk, context,
                ) =>
            {
                PlannerOption::ConditionFishing
            }
            PlannerOption::ResourceRecovery
                if state.durability >= 20
                    || state.buffs.manipulation > 0
                    || state.trained_perfection_active =>
            {
                context
                    .resume_option
                    .unwrap_or_else(|| option_after_recovery(recipe, crafter, state, risk))
            }
            PlannerOption::ConditionFishing
                if state.condition == MaterialCondition::Good
                    || state.buffs.great_strides == 0
                    || context.fishing_rolls_remaining == 0 =>
            {
                context.resume_option.unwrap_or(PlannerOption::QualityBurst)
            }
            PlannerOption::CertifiedSuffix
                if reliable_quality_first_route_action(
                    recipe, crafter, state, objective, context,
                )
                .is_none() =>
            {
                option_after_recovery(recipe, crafter, state, risk)
            }
            _ => return option,
        };
        if next == option {
            return option;
        }
        if next == PlannerOption::ConditionFishing {
            // Entering a suboption is itself the settled decision. Its action
            // budget is initialized only after the first observed action;
            // continuing this zero-step loop would immediately mistake the
            // not-yet-entered suboption for an exhausted one.
            return next;
        }
        option = next;
    }
    option_after_recovery(recipe, crafter, state, risk)
}

fn select_progress_window_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.condition == MaterialCondition::Good {
        let opportunities = if state.inner_quiet < 10 {
            &[
                CraftActionId::PreciseTouch,
                CraftActionId::IntensiveSynthesis,
            ][..]
        } else {
            &[
                CraftActionId::IntensiveSynthesis,
                CraftActionId::TricksOfTheTrade,
            ][..]
        };
        if let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            opportunities,
        ) {
            return Some(action);
        }
    }
    if state.condition == MaterialCondition::Pliant {
        if context.manipulation_uses < 3
            && state.buffs.manipulation <= 2
            && state.durability <= 25
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Manipulation],
            )
        {
            return Some(action);
        }
        if context.waste_not_uses < 2
            && state.buffs.waste_not <= 1
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::WasteNot2],
            )
        {
            return Some(action);
        }
    }
    if state.condition != MaterialCondition::Malleable
        && state.buffs.veneration == 0
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Veneration],
        )
    {
        return Some(action);
    }
    let risky = risk_available(context, risk, ActionCategory::Progress);
    let actions = if risky && state.condition == MaterialCondition::Malleable {
        &[
            CraftActionId::RapidSynthesis,
            CraftActionId::Groundwork,
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
        ][..]
    } else if risky {
        &[
            CraftActionId::RapidSynthesis,
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
        ][..]
    } else {
        &[
            CraftActionId::CarefulSynthesis,
            CraftActionId::PrudentSynthesis,
            CraftActionId::BasicSynthesis,
        ][..]
    };
    first_safe(recipe, crafter, state, objective, risk, context, actions)
}

fn select_inner_quiet_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.condition == MaterialCondition::Good
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade],
        )
    {
        return Some(action);
    }
    if state.condition == MaterialCondition::Pliant
        && context.manipulation_uses < 3
        && state.buffs.manipulation <= 2
        && state.durability <= 30
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(action);
    }
    if context.waste_not_uses < 2
        && state.buffs.waste_not == 0
        && state.durability >= 20
        && state.cp >= 130
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::WasteNot2],
        )
    {
        return Some(action);
    }
    if state.buffs.innovation == 0
        && state.cp >= 92
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Innovation],
        )
    {
        return Some(action);
    }
    if (state.buffs.waste_not > 0
        || matches!(
            state.condition,
            MaterialCondition::Sturdy | MaterialCondition::Robust
        ))
        && state.inner_quiet <= 8
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreparatoryTouch],
        )
    {
        return Some(action);
    }
    let risky = risk_available(context, risk, ActionCategory::Quality);
    let actions = if risky
        && (risk == RiskPreference::Aggressive || state.condition == MaterialCondition::Centered)
    {
        &[
            CraftActionId::DaringTouch,
            CraftActionId::HastyTouch,
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
        ][..]
    } else if risky {
        &[
            CraftActionId::HastyTouch,
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
        ][..]
    } else {
        &[
            CraftActionId::PrudentTouch,
            CraftActionId::BasicTouch,
            CraftActionId::PreparatoryTouch,
        ][..]
    };
    first_safe(recipe, crafter, state, objective, risk, context, actions)
}

fn select_quality_cycle_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if state.condition == MaterialCondition::Good
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade],
        )
    {
        return Some(action);
    }
    if state.condition == MaterialCondition::Pliant
        && context.manipulation_uses < 3
        && state.buffs.manipulation <= 2
        && state.durability <= 25
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(action);
    }
    if state.buffs.innovation == 0
        && state.cp >= 124
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Innovation],
        )
    {
        return Some(action);
    }
    if state.inner_quiet == 10
        && state.cp >= 106
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::TrainedFinesse],
        )
    {
        return Some(action);
    }
    let risky = risk_available(context, risk, ActionCategory::Quality);
    let actions = if risky && risk == RiskPreference::Aggressive {
        &[CraftActionId::DaringTouch, CraftActionId::HastyTouch][..]
    } else if risky {
        &[CraftActionId::HastyTouch, CraftActionId::PrudentTouch][..]
    } else {
        &[CraftActionId::PrudentTouch, CraftActionId::BasicTouch][..]
    };
    first_safe(recipe, crafter, state, objective, risk, context, actions)
        .or_else(|| best_quality_action(recipe, crafter, state, objective, risk, context))
}

fn select_option_route_action(
    option: PlannerOption,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    match option {
        PlannerOption::ProgressWindow => {
            select_progress_window_action(recipe, crafter, state, objective, risk, context)
        }
        PlannerOption::InnerQuietBuild => {
            select_inner_quiet_action(recipe, crafter, state, objective, risk, context)
        }
        PlannerOption::QualityCycle => {
            select_quality_cycle_action(recipe, crafter, state, objective, risk, context)
        }
        PlannerOption::QualityBurst => {
            quality_burst_actions(recipe, crafter, state, objective, risk, context)
                .and_then(|actions| actions.first().copied())
        }
        PlannerOption::SafeFinish => {
            best_progress_action(recipe, crafter, state, objective, risk, context, true)
        }
        PlannerOption::ResourceRecovery => {
            if context.manipulation_uses < 3
                && state.buffs.manipulation == 0
                && let Some(action) = first_safe(
                    recipe,
                    crafter,
                    state,
                    objective,
                    risk,
                    context,
                    &[CraftActionId::Manipulation],
                )
            {
                Some(action)
            } else {
                select_recovery(recipe, crafter, state, objective, risk, context).or_else(|| {
                    first_safe(
                        recipe,
                        crafter,
                        state,
                        objective,
                        risk,
                        context,
                        &[CraftActionId::TricksOfTheTrade],
                    )
                })
            }
        }
        PlannerOption::ConditionFishing => {
            let mut bounded_context = context.clone();
            bounded_context.last_action = None;
            safe_preview(
                recipe,
                crafter,
                state,
                objective,
                risk,
                &bounded_context,
                CraftActionId::Observe,
            )
            .map(|_| CraftActionId::Observe)
        }
        PlannerOption::CertifiedSuffix => {
            reliable_quality_first_route_action(recipe, crafter, state, objective, context)
        }
        _ => None,
    }
}

/// Rust-native continuation persona distilled from the historical generic guide:
/// progress and quality remain coupled, condition opportunities interrupt the
/// same route, and resource/cashout decisions keep their cross-step memory.
fn select_guide_continuation_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    specialist_support: bool,
) -> Option<CraftActionId> {
    if state.quality >= objective.quality_maximum {
        return best_progress_action(recipe, crafter, state, objective, risk, context, true);
    }
    if context.manipulation_uses == 0
        && state.step <= 4
        && state.condition != MaterialCondition::Good
        && state.buffs.manipulation == 0
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(action);
    }

    let progress_ratio = f64::from(state.progress) / f64::from(recipe.progress_required.max(1));
    let quality_ratio = f64::from(state.quality) / f64::from(objective.quality_maximum.max(1));
    let quality_wanted = progress_ratio > quality_ratio || progress_ratio >= 0.9;
    let progress_wanted = quality_ratio > progress_ratio || progress_ratio < 0.55;
    let free_quality_cp_floor = ((f64::from(crafter.max_cp) * 0.14).round() as i32).clamp(60, 140);

    if specialist_support && crafter.specialist {
        if state.heart_and_soul_active && context.last_action == Some(CraftActionId::HeartAndSoul) {
            let bridge = if state.inner_quiet <= 8 && quality_wanted {
                &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade][..]
            } else {
                &[CraftActionId::TricksOfTheTrade, CraftActionId::PreciseTouch][..]
            };
            if let Some(action) =
                first_safe(recipe, crafter, state, objective, risk, context, bridge)
            {
                return Some(action);
            }
        }
        if state.condition != MaterialCondition::Good
            && state.cp <= 16
            && state.cp <= crafter.max_cp - 20
            && state.heart_and_soul_available
            && !state.heart_and_soul_active
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::HeartAndSoul],
            )
        {
            return Some(action);
        }

        let blessing = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
        let mature_cashout = state.inner_quiet == 10
            && state.buffs.great_strides > 0
            && blessing.legal
            && (state.quality + blessing.quality_gain >= objective.quality_maximum
                || quality_ratio >= 0.72)
            && progress_headroom_ready(recipe, crafter, state, risk);
        if mature_cashout {
            if state.buffs.innovation == 0
                && state.quick_innovation_available
                && let Some(action) = first_safe(
                    recipe,
                    crafter,
                    state,
                    objective,
                    risk,
                    context,
                    &[CraftActionId::QuickInnovation],
                )
            {
                return Some(action);
            }
            if state.condition != MaterialCondition::Good
                && state.careful_observation_uses_left > 0
                && let Some(action) = first_safe(
                    recipe,
                    crafter,
                    state,
                    objective,
                    risk,
                    context,
                    &[CraftActionId::CarefulObservation],
                )
            {
                return Some(action);
            }
        }
    }

    if state.inner_quiet >= 8
        && quality_ratio >= 0.5
        && let Some(actions) = certified_quality_burst_actions(recipe, crafter, state, objective)
        && let Some(action) = actions.first().copied()
    {
        return Some(action);
    }

    if state.condition == MaterialCondition::Good {
        if state.buffs.great_strides > 0 {
            let blessing = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
            if blessing.legal
                && (state.quality + blessing.quality_gain >= objective.quality_maximum
                    || quality_ratio >= 0.95)
                && safe_preview(
                    recipe,
                    crafter,
                    state,
                    objective,
                    risk,
                    context,
                    CraftActionId::ByregotsBlessing,
                )
                .is_some()
            {
                return Some(CraftActionId::ByregotsBlessing);
            }
        }
        let actions = if state.inner_quiet < 10 || quality_wanted {
            &[
                CraftActionId::PreciseTouch,
                CraftActionId::DelicateSynthesis,
                CraftActionId::TricksOfTheTrade,
            ][..]
        } else if progress_wanted {
            &[
                CraftActionId::IntensiveSynthesis,
                CraftActionId::PreciseTouch,
                CraftActionId::TricksOfTheTrade,
            ][..]
        } else {
            &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade][..]
        };
        if let Some(action) = first_safe(recipe, crafter, state, objective, risk, context, actions)
        {
            return Some(action);
        }
    }

    if state.condition == MaterialCondition::GoodOmen && quality_wanted {
        if state.inner_quiet == 10
            && state.buffs.great_strides == 0
            && state.cp >= 56
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::GreatStrides],
            )
        {
            return Some(action);
        }
        if context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Innovation],
            )
        {
            return Some(action);
        }
    }

    if state.condition == MaterialCondition::Primed {
        if context.manipulation_uses < 3
            && state.buffs.manipulation <= 2
            && state.durability <= 30
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Manipulation],
            )
        {
            return Some(action);
        }
        if progress_wanted
            && state.buffs.veneration == 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Veneration],
            )
        {
            return Some(action);
        }
        if quality_wanted
            && context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Innovation],
            )
        {
            return Some(action);
        }
    }

    if state.condition == MaterialCondition::Pliant {
        if context.manipulation_uses < 3
            && state.durability <= 25
            && state.buffs.manipulation <= 2
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Manipulation],
            )
        {
            return Some(action);
        }
        if context.waste_not_uses < 1
            && state.buffs.waste_not <= 1
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::WasteNot2],
            )
        {
            return Some(action);
        }
        if quality_wanted
            && context.innovation_uses < 6
            && state.buffs.innovation <= 1
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Innovation],
            )
        {
            return Some(action);
        }
    }

    if state.durability <= 10 {
        if state.buffs.manipulation > 0 {
            let actions = if quality_wanted && state.inner_quiet == 10 {
                &[CraftActionId::TrainedFinesse, CraftActionId::Innovation][..]
            } else if progress_wanted {
                &[CraftActionId::Veneration][..]
            } else {
                &[][..]
            };
            if let Some(action) =
                first_safe(recipe, crafter, state, objective, risk, context, actions)
            {
                return Some(action);
            }
        }
        if let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[
                CraftActionId::TrainedPerfection,
                CraftActionId::Manipulation,
                CraftActionId::MastersMend,
            ],
        ) {
            return Some(action);
        }
    }
    if context.manipulation_uses < 3
        && state.buffs.manipulation == 0
        && state.durability <= 20
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(action);
    }
    if context.waste_not_uses < 1
        && state.buffs.waste_not == 0
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::WasteNot2],
        )
    {
        return Some(action);
    }
    if quality_wanted
        && context.innovation_uses < 6
        && state.buffs.innovation <= 1
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Innovation],
        )
    {
        return Some(action);
    }
    if quality_wanted
        && state.inner_quiet >= 8
        && quality_ratio >= 0.72
        && context.great_strides_uses < 3
        && state.buffs.great_strides == 0
        && state.buffs.innovation > 0
        && state.cp >= 56
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::GreatStrides],
        )
    {
        return Some(action);
    }
    if state.buffs.great_strides > 0 && quality_wanted {
        let blessing = preview_action(recipe, crafter, state, CraftActionId::ByregotsBlessing);
        if blessing.legal
            && (state.quality + blessing.quality_gain >= objective.quality_maximum
                || quality_ratio >= 0.95)
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::ByregotsBlessing],
            )
        {
            return Some(action);
        }
        if let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[
                CraftActionId::PreparatoryTouch,
                CraftActionId::TrainedFinesse,
                CraftActionId::PrudentTouch,
                CraftActionId::HastyTouch,
            ],
        ) {
            return Some(action);
        }
    }

    if quality_wanted {
        let actions = if state.buffs.expedience > 0 && risk != RiskPreference::Stable {
            &[CraftActionId::DaringTouch, CraftActionId::HastyTouch][..]
        } else if state.condition == MaterialCondition::Centered {
            &[
                CraftActionId::HastyTouch,
                CraftActionId::DaringTouch,
                CraftActionId::TrainedFinesse,
            ][..]
        } else if state.condition == MaterialCondition::Sturdy || state.buffs.waste_not > 0 {
            if state.cp < free_quality_cp_floor {
                &[
                    CraftActionId::HastyTouch,
                    CraftActionId::DaringTouch,
                    CraftActionId::PreparatoryTouch,
                    CraftActionId::TrainedFinesse,
                ][..]
            } else {
                &[
                    CraftActionId::PreparatoryTouch,
                    CraftActionId::HastyTouch,
                    CraftActionId::TrainedFinesse,
                ][..]
            }
        } else if state.inner_quiet == 10 && state.buffs.innovation > 0 {
            if state.cp < free_quality_cp_floor {
                &[CraftActionId::HastyTouch, CraftActionId::TrainedFinesse][..]
            } else {
                &[CraftActionId::TrainedFinesse, CraftActionId::HastyTouch][..]
            }
        } else {
            &[
                CraftActionId::HastyTouch,
                CraftActionId::PrudentTouch,
                CraftActionId::BasicTouch,
            ][..]
        };
        if let Some(action) = first_safe(recipe, crafter, state, objective, risk, context, actions)
        {
            return Some(action);
        }
    }

    if progress_wanted {
        if state.condition != MaterialCondition::Malleable
            && state.buffs.veneration == 0
            && let Some(action) = first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Veneration],
            )
        {
            return Some(action);
        }
        let actions = if state.condition == MaterialCondition::Malleable {
            &[
                CraftActionId::RapidSynthesis,
                CraftActionId::Groundwork,
                CraftActionId::CarefulSynthesis,
            ][..]
        } else {
            &[
                CraftActionId::RapidSynthesis,
                CraftActionId::CarefulSynthesis,
                CraftActionId::PrudentSynthesis,
            ][..]
        };
        if let Some(action) = first_safe(recipe, crafter, state, objective, risk, context, actions)
        {
            return Some(action);
        }
    }

    if state.inner_quiet < 10 {
        first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[
                CraftActionId::HastyTouch,
                CraftActionId::RapidSynthesis,
                CraftActionId::PrudentTouch,
            ],
        )
    } else if state.buffs.innovation > 0 {
        first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[
                CraftActionId::TrainedFinesse,
                CraftActionId::HastyTouch,
                CraftActionId::RapidSynthesis,
            ],
        )
    } else {
        first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[
                CraftActionId::RapidSynthesis,
                CraftActionId::HastyTouch,
                CraftActionId::TrainedFinesse,
            ],
        )
    }
}

/// High-value observed conditions may temporarily interrupt progress banking,
/// but they do not replace the surrounding reserve -> quality -> finish plan.
/// The caller resumes progress banking immediately after the opportunity.
fn select_progress_reserve_opportunity(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    match state.condition {
        MaterialCondition::Good => {
            let actions = if state.inner_quiet < 10 {
                &[CraftActionId::PreciseTouch, CraftActionId::TricksOfTheTrade][..]
            } else {
                &[CraftActionId::TricksOfTheTrade, CraftActionId::PreciseTouch][..]
            };
            first_safe(recipe, crafter, state, objective, risk, context, actions)
        }
        MaterialCondition::Pliant => {
            let actions = if context.manipulation_uses < 3
                && state.buffs.manipulation <= 2
                && state.durability <= 30
            {
                &[CraftActionId::Manipulation, CraftActionId::WasteNot2][..]
            } else if context.waste_not_uses == 0 && state.buffs.waste_not <= 1 {
                &[CraftActionId::WasteNot2][..]
            } else {
                &[][..]
            };
            first_safe(recipe, crafter, state, objective, risk, context, actions)
        }
        MaterialCondition::Primed
            if context.manipulation_uses < 3
                && state.buffs.manipulation <= 2
                && state.durability <= 30 =>
        {
            first_safe(
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                &[CraftActionId::Manipulation],
            )
        }
        _ => None,
    }
}

fn option_persona_decision(
    persona: PlannerPersona,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<GenericDecision> {
    if persona != PlannerPersona::LegacyContinuation
        && let Some(action) =
            reliable_quality_first_route_action(recipe, crafter, state, objective, context)
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::CertifiedSuffix,
            persona,
        });
    }
    let option = settle_option_route(recipe, crafter, state, objective, risk, context);
    let resumed_persona = if matches!(
        context.active_option,
        PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
    ) && context.resume_option == Some(option)
    {
        context.resume_persona.unwrap_or(persona)
    } else {
        persona
    };
    let effective_persona = if matches!(
        option,
        PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
    ) {
        PlannerPersona::OptionRoute
    } else {
        resumed_persona
    };
    let effective_risk = if effective_persona == PlannerPersona::RiskForward {
        RiskPreference::Aggressive
    } else {
        risk
    };
    let action = if effective_persona == PlannerPersona::GuideContinuation {
        select_guide_continuation_action(
            recipe,
            crafter,
            state,
            objective,
            effective_risk,
            context,
            false,
        )
    } else if effective_persona == PlannerPersona::IntegratedGuideContinuation {
        select_guide_continuation_action(
            recipe,
            crafter,
            state,
            objective,
            effective_risk,
            context,
            true,
        )
    } else if effective_persona == PlannerPersona::ProgressReserveGuide {
        if progress_headroom_ready(recipe, crafter, state, effective_risk) {
            select_guide_continuation_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
                true,
            )
        } else {
            select_progress_window_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
            )
            .or_else(|| {
                select_guide_continuation_action(
                    recipe,
                    crafter,
                    state,
                    objective,
                    effective_risk,
                    context,
                    true,
                )
            })
        }
    } else if effective_persona == PlannerPersona::OpportunityReserveGuide {
        if progress_headroom_ready(recipe, crafter, state, effective_risk) {
            select_guide_continuation_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
                true,
            )
        } else {
            select_progress_reserve_opportunity(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
            )
            .or_else(|| {
                select_progress_window_action(
                    recipe,
                    crafter,
                    state,
                    objective,
                    effective_risk,
                    context,
                )
            })
            .or_else(|| {
                select_guide_continuation_action(
                    recipe,
                    crafter,
                    state,
                    objective,
                    effective_risk,
                    context,
                    true,
                )
            })
        }
    } else if effective_persona == PlannerPersona::LegacyContinuation {
        recommend_generic_action(
            GenericSolverVersion::RustPrimaryV3,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
        )
        .map(|decision| decision.action)
    } else {
        select_option_route_action(
            option,
            recipe,
            crafter,
            state,
            objective,
            effective_risk,
            context,
        )
        .or_else(|| match option {
            PlannerOption::ProgressWindow => best_progress_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
                false,
            ),
            PlannerOption::InnerQuietBuild | PlannerOption::QualityCycle => {
                best_quality_action(recipe, crafter, state, objective, effective_risk, context)
            }
            PlannerOption::QualityBurst => select_quality_cycle_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
            ),
            PlannerOption::SafeFinish => best_progress_action(
                recipe,
                crafter,
                state,
                objective,
                effective_risk,
                context,
                true,
            ),
            _ => None,
        })
    }?;
    Some(GenericDecision {
        route: None,
        action,
        option,
        persona: effective_persona,
    })
}

fn planner_seed_base(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    context: &PlannerContext,
    option: PlannerOption,
    condition_weights: &ConditionTransitionWeights,
) -> u32 {
    fn mix(hash: &mut u32, value: u32) {
        *hash ^= value;
        *hash = hash.wrapping_mul(16_777_619);
    }
    let mut hash = 2_166_136_261_u32;
    for value in [
        recipe.recipe_level,
        recipe.progress_required as u32,
        recipe.required_quality as u32,
        crafter.level,
        crafter.craftsmanship as u32,
        crafter.control as u32,
        crafter.max_cp as u32,
        state.step as u32,
        state.progress as u32,
        state.quality as u32,
        state.durability as u32,
        state.cp as u32,
        state.inner_quiet as u32,
        state.condition.index() as u32,
        context.observed_transitions,
        context.cashout_cycles as u32,
        option as u32,
    ] {
        mix(&mut hash, value);
    }
    for row in condition_weights {
        for weight in row {
            let bits = weight.to_bits();
            mix(&mut hash, bits as u32);
            mix(&mut hash, (bits >> 32) as u32);
        }
    }
    hash
}

fn option_rollout_score(
    recipe: &RecipeProfile,
    state: &CraftState,
    objective: GenericObjective,
) -> i64 {
    if state.terminal == CraftTerminal::Completed {
        return 1_000_000;
    }
    if state.terminal == CraftTerminal::Failed {
        return -500_000;
    }
    let quality = i64::from(state.quality.min(objective.quality_maximum)) * 520_000
        / i64::from(objective.quality_maximum.max(1));
    let progress = i64::from(state.progress.min(recipe.progress_required)) * 320_000
        / i64::from(recipe.progress_required.max(1));
    let setup = i64::from(state.inner_quiet) * 5_000
        + i64::from(state.buffs.innovation) * 1_000
        + i64::from(state.buffs.manipulation) * 800;
    quality
        + progress
        + setup
        + i64::from(state.durability.max(0)) * 300
        + i64::from(state.cp.max(0)) * 80
        - 120_000
}

fn rollout_option_persona(
    solver_version: GenericSolverVersion,
    persona: PlannerPersona,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    condition_weights: &ConditionTransitionWeights,
    seed: u32,
    horizon: usize,
) -> i64 {
    let mut projected = state.clone();
    let mut projected_context = context.clone();
    projected_context.active_persona = persona;
    let mut random = EpisodeRandomStream::new(seed);
    let mut cursor = RandomDrawCursor {
        condition_draws: 0,
        success_draws: 0,
    };
    for _ in 0..horizon {
        if projected.terminal != CraftTerminal::None {
            break;
        }
        let Some(decision) = option_persona_decision(
            persona,
            recipe,
            crafter,
            &projected,
            objective,
            risk,
            &projected_context,
        ) else {
            break;
        };
        let preview = preview_action(recipe, crafter, &projected, decision.action);
        if !preview.legal {
            return -500_000;
        }
        let before = projected.clone();
        let weights = &condition_weights[projected.condition.index()];
        let simulated =
            draw_simulated_action_outcome(&preview, &projected, weights, &mut random, cursor);
        let Ok(result) = apply_observed_outcome(
            recipe,
            crafter,
            &projected,
            decision.action,
            simulated.observed,
        ) else {
            return -500_000;
        };
        cursor = simulated.cursor_after;
        projected = result.next_state;
        advance_planner_context(
            &mut projected_context,
            solver_version,
            decision,
            &before,
            &projected,
        );
    }
    option_rollout_score(recipe, &projected, objective)
}

fn select_option_persona(
    solver_version: GenericSolverVersion,
    option: PlannerOption,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    condition_weights: &ConditionTransitionWeights,
) -> PlannerPersona {
    const OPTION_MPC_PERSONAS: [PlannerPersona; 3] = [
        PlannerPersona::OptionRoute,
        PlannerPersona::RiskForward,
        PlannerPersona::LegacyContinuation,
    ];
    const GUIDE_MPC_PERSONAS: [PlannerPersona; 4] = [
        PlannerPersona::GuideContinuation,
        PlannerPersona::OptionRoute,
        PlannerPersona::RiskForward,
        PlannerPersona::LegacyContinuation,
    ];
    const STRATEGY_PORTFOLIO_PERSONAS: [PlannerPersona; 6] = [
        PlannerPersona::IntegratedGuideContinuation,
        PlannerPersona::ProgressReserveGuide,
        PlannerPersona::GuideContinuation,
        PlannerPersona::OptionRoute,
        PlannerPersona::RiskForward,
        PlannerPersona::LegacyContinuation,
    ];
    const CAPABILITY_PORTFOLIO_PERSONAS: [PlannerPersona; 5] = [
        PlannerPersona::IntegratedGuideContinuation,
        PlannerPersona::GuideContinuation,
        PlannerPersona::OptionRoute,
        PlannerPersona::RiskForward,
        PlannerPersona::LegacyContinuation,
    ];
    let personas = if solver_version == GenericSolverVersion::StrategyPortfolioMpcV9 {
        &STRATEGY_PORTFOLIO_PERSONAS[..]
    } else if matches!(
        solver_version,
        GenericSolverVersion::CapabilityPortfolioMpcV10 | GenericSolverVersion::DeepPortfolioMpcV11
    ) && crafter.specialist
    {
        &CAPABILITY_PORTFOLIO_PERSONAS[..]
    } else if matches!(
        solver_version,
        GenericSolverVersion::GuideOptionMpcV6
            | GenericSolverVersion::GuideLeaseMpcV7
            | GenericSolverVersion::GuidePhaseMpcV8
            | GenericSolverVersion::CapabilityPortfolioMpcV10
            | GenericSolverVersion::DeepPortfolioMpcV11
    ) {
        &GUIDE_MPC_PERSONAS[..]
    } else {
        &OPTION_MPC_PERSONAS[..]
    };
    let base_seed = planner_seed_base(recipe, crafter, state, context, option, condition_weights);
    let sample_count = if solver_version == GenericSolverVersion::DeepPortfolioMpcV11 {
        24_u32
    } else {
        6_u32
    };
    let mut best = personas[0];
    let mut best_rank = i128::MIN;
    for &persona in personas {
        let mut completions = 0_i128;
        let mut total = 0_i128;
        let mut scores = Vec::with_capacity(sample_count as usize);
        for sample in 0..sample_count {
            let seed = base_seed.wrapping_add(sample.wrapping_mul(0x9e37_79b9));
            let score = rollout_option_persona(
                solver_version,
                persona,
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                condition_weights,
                seed,
                48,
            );
            completions += i128::from(score == 1_000_000);
            total += i128::from(score);
            scores.push(score);
        }
        scores.sort_unstable();
        let lower_tail_index = if solver_version == GenericSolverVersion::DeepPortfolioMpcV11 {
            scores.len() / 5
        } else {
            0
        };
        let lower_tail = scores[lower_tail_index];
        let rank = completions * 10_000_000_000
            + i128::from(lower_tail) * i128::from(sample_count)
            + total;
        if rank > best_rank {
            best = persona;
            best_rank = rank;
        }
    }
    best
}

/// Selects one coherent strategy program and lets that program own the whole
/// craft. Each candidate is evaluated through progress banking, quality build,
/// risky failures, recovery/resume, cashout, and final synthesis. This avoids
/// constructing an unevaluated route by splicing persona fragments at option
/// boundaries.
fn select_strategy_program(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    condition_weights: &ConditionTransitionWeights,
) -> PlannerPersona {
    const PROGRAMS: [PlannerPersona; 3] = [
        PlannerPersona::ProgressReserveGuide,
        PlannerPersona::IntegratedGuideContinuation,
        PlannerPersona::GuideContinuation,
    ];
    const SAMPLE_COUNT: u32 = 16;
    const PROGRAM_HORIZON: usize = 80;

    let option = settle_option_route(recipe, crafter, state, objective, risk, context);
    let base_seed = planner_seed_base(recipe, crafter, state, context, option, condition_weights);
    let mut best = PROGRAMS[0];
    let mut best_rank = i128::MIN;
    for &program in &PROGRAMS {
        let mut completions = 0_i128;
        let mut total = 0_i128;
        let mut scores = Vec::with_capacity(SAMPLE_COUNT as usize);
        for sample in 0..SAMPLE_COUNT {
            let seed = base_seed.wrapping_add(sample.wrapping_mul(0x9e37_79b9));
            let score = rollout_option_persona(
                GenericSolverVersion::StrategyProgramMpcV12,
                program,
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                condition_weights,
                seed,
                PROGRAM_HORIZON,
            );
            completions += i128::from(score == 1_000_000);
            total += i128::from(score);
            scores.push(score);
        }
        scores.sort_unstable();
        let lower_quartile = scores[scores.len() / 4];
        let rank = completions * 10_000_000_000
            + i128::from(lower_quartile) * i128::from(SAMPLE_COUNT)
            + total;
        if rank > best_rank {
            best = program;
            best_rank = rank;
        }
    }
    best
}

fn same_persona_phase(left: PlannerOption, right: PlannerOption) -> bool {
    fn phase(option: PlannerOption) -> u8 {
        match option {
            PlannerOption::ProgressWindow => 0,
            PlannerOption::InnerQuietBuild
            | PlannerOption::QualityCycle
            | PlannerOption::QualityBurst => 1,
            PlannerOption::SafeFinish | PlannerOption::CertifiedSuffix => 2,
            PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing => 3,
            _ => 4,
        }
    }
    phase(left) == phase(right)
}

fn fixed_persona(version: GenericSolverVersion) -> Option<PlannerPersona> {
    match version {
        GenericSolverVersion::OpportunityReserveV13
        | GenericSolverVersion::DeliveryShieldV14
        | GenericSolverVersion::BudgetedConditionV15 => {
            Some(PlannerPersona::OpportunityReserveGuide)
        }
        GenericSolverVersion::GuideDirectProbe => Some(PlannerPersona::GuideContinuation),
        GenericSolverVersion::IntegratedGuideDirectProbe => {
            Some(PlannerPersona::IntegratedGuideContinuation)
        }
        GenericSolverVersion::ProgressReserveGuideDirectProbe => {
            Some(PlannerPersona::ProgressReserveGuide)
        }
        GenericSolverVersion::OpportunityReserveGuideDirectProbe => {
            Some(PlannerPersona::OpportunityReserveGuide)
        }
        GenericSolverVersion::RiskForwardDirectProbe => Some(PlannerPersona::RiskForward),
        _ => None,
    }
}

fn decide_option(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> PlannerOption {
    if state.quality >= objective.quality_maximum {
        return PlannerOption::FinishProgress;
    }
    if state.durability <= 10 && state.buffs.manipulation == 0 {
        return PlannerOption::Recovery;
    }
    if matches!(
        version,
        GenericSolverVersion::HardQualityV2
            | GenericSolverVersion::RustPrimaryV3
            | GenericSolverVersion::OptionRouteV4
            | GenericSolverVersion::OptionMpcV5
    ) && recipe.required_quality > 0
        && context.active_option == PlannerOption::HardQualityCashout
        && state.inner_quiet >= 8
        && context.option_steps < 6
    {
        return PlannerOption::HardQualityCashout;
    }
    if matches!(
        version,
        GenericSolverVersion::HardQualityV2
            | GenericSolverVersion::RustPrimaryV3
            | GenericSolverVersion::OptionRouteV4
            | GenericSolverVersion::OptionMpcV5
    ) && recipe.required_quality > 0
        && state.inner_quiet >= 8
        && state.cp >= 74
    {
        return PlannerOption::HardQualityCashout;
    }
    let reserve = progress_reserve_target(version, recipe, crafter, state, risk);
    if recipe.required_quality > 0 {
        if matches!(
            version,
            GenericSolverVersion::RustPrimaryV3
                | GenericSolverVersion::OptionRouteV4
                | GenericSolverVersion::OptionMpcV5
        ) {
            return if state.progress < reserve {
                PlannerOption::SecureProgress
            } else {
                PlannerOption::BuildQuality
            };
        }
        let progress_ratio = f64::from(state.progress) / f64::from(recipe.progress_required);
        let quality_ratio = f64::from(state.quality) / f64::from(objective.quality_maximum.max(1));
        if progress_ratio < 0.55 && quality_ratio >= progress_ratio {
            PlannerOption::SecureProgress
        } else {
            PlannerOption::BuildQuality
        }
    } else if state.progress < reserve {
        PlannerOption::SecureProgress
    } else if recipe.required_quality == 0
        && deterministic_completion_first(recipe, crafter, state, 8).is_none()
    {
        // The progress bank is only a coarse entry criterion. Keep securing
        // progress until an actual bounded completion certificate exists.
        PlannerOption::SecureProgress
    } else {
        PlannerOption::BuildQuality
    }
}

pub fn recommend_generic_action(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<GenericDecision> {
    recommend_generic_action_with_model(
        version, recipe, crafter, state, objective, risk, context, None,
    )
}

/// Planning may know which random conditions a recipe declares, but never the
/// evaluator-private transition ratios used to produce the next observation.
/// Older Monte Carlo policies still need a sampling model, so derive the one
/// admissible model from the declared set: every available condition is equal.
pub(super) fn declared_condition_set_weights(
    random_condition_mask: Option<u16>,
) -> Option<ConditionTransitionWeights> {
    let mask = random_condition_mask?;
    let mut weights = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut weights {
        for (index, weight) in row.iter_mut().enumerate() {
            if mask & (1_u16 << index) != 0 {
                *weight = 1.0;
            }
        }
    }
    Some(weights)
}

// Bits follow MaterialCondition::index. These are recipe-declared random condition
// sets, not observed episode outcomes or recipe/equipment identities.
const HARD_QUALITY_CENTERED_PLIANT_GOOD_OMEN_MASK: u16 = 0x00ff;
const HARD_QUALITY_CENTERED_PLIANT_ROBUST_MASK: u16 = 0x01fb;
const HARD_QUALITY_CENTERED_PLIANT_COMPACT_MASK: u16 = 0x007b;
const SHARED_CONTINUATION_MIN_ACTION_RUNWAY: u32 = 8;

fn condition_set_portfolio_uses_budgeted_condition(
    recipe: &RecipeProfile,
    risk: RiskPreference,
    random_condition_mask: Option<u16>,
) -> bool {
    recipe.required_quality > 0
        && risk != RiskPreference::Stable
        && matches!(
            random_condition_mask,
            Some(
                HARD_QUALITY_CENTERED_PLIANT_GOOD_OMEN_MASK
                    | HARD_QUALITY_CENTERED_PLIANT_ROBUST_MASK
                    | HARD_QUALITY_CENTERED_PLIANT_COMPACT_MASK
            )
        )
}

fn is_ts_migration_portfolio(version: GenericSolverVersion) -> bool {
    matches!(
        version,
        GenericSolverVersion::ConditionSetPortfolioV17
            | GenericSolverVersion::CapabilityConditionSetPortfolioV18
            | GenericSolverVersion::ConditionContinuationPortfolioV19
            | GenericSolverVersion::ObjectiveCapabilityPortfolioV20
            | GenericSolverVersion::ProgressQualityShieldV21
            | GenericSolverVersion::SpecialistResourcePortfolioV22
            | GenericSolverVersion::ProgressBankPortfolioV23
            | GenericSolverVersion::FlatOpportunityPortfolioV24
            | GenericSolverVersion::SpecialistResourceGuardV25
    )
}

fn objective_capability_portfolio_objective(
    recipe: &RecipeProfile,
    mut objective: GenericObjective,
    _risk: RiskPreference,
) -> GenericObjective {
    objective.quality_maximum = recipe.quality_max;
    objective
}

fn progress_quality_shield_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
    proposed: CraftActionId,
) -> Option<CraftActionId> {
    if recipe.required_quality != 0
        || state.quality >= objective.quality_maximum
        || state.durability > 10
        || !state.trained_perfection_available
        || state.trained_perfection_active
        || context.action_uses >= context.action_limit.saturating_sub(1)
    {
        return None;
    }
    let proposed_preview = preview_action(recipe, crafter, state, proposed);
    if !proposed_preview.legal
        || proposed_preview.success_rate != 1.0
        || proposed_preview.progress_gain <= 0
        || state.progress + proposed_preview.progress_gain < recipe.progress_required
    {
        return None;
    }
    let shield = preview_action(recipe, crafter, state, CraftActionId::TrainedPerfection);
    (shield.legal && shield.success_rate == 1.0).then_some(CraftActionId::TrainedPerfection)
}

fn specialist_quality_opportunity_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
    proposed: CraftActionId,
    manipulation_covers_durability_pressure: bool,
) -> Option<CraftActionId> {
    if recipe.required_quality == 0
        || !crafter.specialist
        || state.quality >= objective.quality_maximum
        || state.inner_quiet < 8
        || state.buffs.innovation > 0
        || !state.quick_innovation_available
        || context.action_uses >= context.action_limit.saturating_sub(1)
    {
        return None;
    }
    let proposed_preview = preview_action(recipe, crafter, state, proposed);
    if !proposed_preview.legal
        || proposed_preview.success_rate != 1.0
        || proposed_preview.quality_gain <= 0
        || state.quality + proposed_preview.quality_gain >= objective.quality_maximum
        || proposed != CraftActionId::ByregotsBlessing
            && state.cp > 160
            && (state.durability > 10
                || manipulation_covers_durability_pressure && state.buffs.manipulation > 0)
    {
        return None;
    }
    let prepared = branch_state(recipe, crafter, state, CraftActionId::QuickInnovation, true)?;
    if prepared.terminal != CraftTerminal::None {
        return None;
    }
    let enhanced = preview_action(recipe, crafter, &prepared, proposed);
    (enhanced.legal
        && enhanced.success_rate == 1.0
        && enhanced.quality_gain > proposed_preview.quality_gain)
        .then_some(CraftActionId::QuickInnovation)
}

fn specialist_null_recovery_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    context: &PlannerContext,
) -> Option<CraftActionId> {
    if !crafter.specialist
        || state.condition == MaterialCondition::Good
        || !state.heart_and_soul_available
        || state.heart_and_soul_active
        || state.cp > crafter.max_cp - 20
        || context.action_uses >= context.action_limit.saturating_sub(2)
    {
        return None;
    }
    let preview = preview_action(recipe, crafter, state, CraftActionId::HeartAndSoul);
    (preview.legal && preview.success_rate == 1.0).then_some(CraftActionId::HeartAndSoul)
}

fn premature_finish_progress_bank_action(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
    proposed: CraftActionId,
) -> Option<CraftActionId> {
    if recipe.required_quality != 0
        || state.quality >= objective.protected_quality_floor
        || i64::from(state.quality) * 10 >= i64::from(objective.quality_maximum) * 9
        || context.action_uses
            >= context
                .action_limit
                .saturating_sub(SHARED_CONTINUATION_MIN_ACTION_RUNWAY)
    {
        return None;
    }
    let proposed_preview = preview_action(recipe, crafter, state, proposed);
    if !proposed_preview.legal
        || proposed_preview.progress_gain <= 0
        || state.progress + proposed_preview.progress_gain < recipe.progress_required
    {
        return None;
    }
    let mut candidates = CraftActionId::ALL
        .iter()
        .copied()
        .filter_map(|action| {
            if action_definition(action).category != ActionCategory::Progress {
                return None;
            }
            let preview = preview_action(recipe, crafter, state, action);
            if !preview.legal
                || preview.success_rate != 1.0
                || preview.progress_gain <= 0
                || preview.durability_cost >= state.durability
                || state.progress + preview.progress_gain >= recipe.progress_required
            {
                return None;
            }
            let next = branch_state(recipe, crafter, state, action, true)?;
            if next.terminal != CraftTerminal::None
                || deterministic_completion_first(recipe, crafter, &next, 7).is_none()
            {
                return None;
            }
            Some((
                action,
                preview.progress_gain,
                preview.quality_gain,
                preview.durability_cost,
                preview.cp_cost,
            ))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .2
            .cmp(&left.2)
            .then_with(|| left.1.cmp(&right.1))
            .then_with(|| left.3.cmp(&right.3))
            .then_with(|| left.4.cmp(&right.4))
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });
    candidates.first().map(|entry| entry.0)
}

fn shared_continuation_allows_condition_sample(
    context: &PlannerContext,
    action: CraftActionId,
) -> bool {
    if !matches!(
        action,
        CraftActionId::CarefulObservation | CraftActionId::Observe
    ) {
        return true;
    }
    if context.active_option == PlannerOption::ConditionFishing {
        context.fishing_rolls_remaining > 0
    } else {
        !context.fishing_used
    }
}

fn shared_continuation_entry_has_runway(
    context: &PlannerContext,
    completes_on_success: bool,
) -> bool {
    context.shared_continuation_used
        || context.action_uses
            < context
                .action_limit
                .saturating_sub(SHARED_CONTINUATION_MIN_ACTION_RUNWAY)
        || completes_on_success
}

fn bounded_shared_continuation_decision(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
) -> Option<GenericDecision> {
    let mut decision = crate::ts_migration_port::recommend_ts_migration_port(
        recipe, crafter, state, objective, risk, context,
    )?;
    let completes_on_success = branch_state(recipe, crafter, state, decision.action, true)
        .is_some_and(|next| next.terminal == CraftTerminal::Completed);
    if !shared_continuation_entry_has_runway(context, completes_on_success) {
        return None;
    }
    decision.persona = PlannerPersona::SharedContinuation;
    if matches!(
        decision.action,
        CraftActionId::CarefulObservation | CraftActionId::Observe
    ) {
        if context.shared_continuation_used
            && !shared_continuation_allows_condition_sample(context, decision.action)
        {
            return None;
        }
        budgeted_condition_sample_preview(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            decision.action,
        )?;
        // The continuation shares the branch's finite fishing budget. Marking
        // the option lets `advance_planner_context` consume that budget rather
        // than resetting it through the semantic port's BuildQuality label.
        decision.option = PlannerOption::ConditionFishing;
    }
    Some(decision)
}

fn objective_capability_base_decision(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
) -> Option<GenericDecision> {
    if condition_set_portfolio_uses_budgeted_condition(recipe, risk, random_condition_mask) {
        let budgeted = recommend_generic_action_with_model(
            GenericSolverVersion::BudgetedConditionV15,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        )
        .filter(|decision| {
            !context.shared_continuation_used
                || shared_continuation_allows_condition_sample(context, decision.action)
        });
        return budgeted.or_else(|| {
            bounded_shared_continuation_decision(recipe, crafter, state, objective, risk, context)
        });
    }
    crate::ts_migration_port::recommend_ts_migration_port(
        recipe, crafter, state, objective, risk, context,
    )
}

pub fn recommend_generic_action_with_model(
    version: GenericSolverVersion,
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    risk: RiskPreference,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
) -> Option<GenericDecision> {
    if state.terminal != CraftTerminal::None {
        return None;
    }
    if version.is_route_portfolio() {
        return recommend_portfolio_version(
            version,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        )
        .decision;
    }
    if version == GenericSolverVersion::TsMigrationPortV16 {
        return crate::ts_migration_port::recommend_ts_migration_port(
            recipe, crafter, state, objective, risk, context,
        );
    }
    if matches!(
        version,
        GenericSolverVersion::FlatOpportunityPortfolioV24
            | GenericSolverVersion::SpecialistResourceGuardV25
    ) {
        let objective = objective_capability_portfolio_objective(recipe, objective, risk);
        let decision = objective_capability_base_decision(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        );
        if let Some(mut decision) = decision {
            if let Some(action) = progress_quality_shield_action(
                recipe,
                crafter,
                state,
                objective,
                context,
                decision.action,
            ) {
                decision.action = action;
            }
            if let Some(action) = specialist_quality_opportunity_action(
                recipe,
                crafter,
                state,
                objective,
                context,
                decision.action,
                version == GenericSolverVersion::SpecialistResourceGuardV25,
            ) {
                decision.action = action;
            }
            if let Some(action) = premature_finish_progress_bank_action(
                recipe,
                crafter,
                state,
                objective,
                context,
                decision.action,
            ) {
                decision.action = action;
            }
            return Some(decision);
        }
        return specialist_null_recovery_action(recipe, crafter, state, context).map(|action| {
            GenericDecision {
                route: None,
                action,
                option: PlannerOption::ResourceRecovery,
                persona: PlannerPersona::IntegratedGuideContinuation,
            }
        });
    }
    if version == GenericSolverVersion::ProgressBankPortfolioV23 {
        let objective = objective_capability_portfolio_objective(recipe, objective, risk);
        let mut decision = recommend_generic_action_with_model(
            GenericSolverVersion::SpecialistResourcePortfolioV22,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        )?;
        if let Some(action) = premature_finish_progress_bank_action(
            recipe,
            crafter,
            state,
            objective,
            context,
            decision.action,
        ) {
            decision.action = action;
        }
        return Some(decision);
    }
    if version == GenericSolverVersion::SpecialistResourcePortfolioV22 {
        let objective = objective_capability_portfolio_objective(recipe, objective, risk);
        let decision = recommend_generic_action_with_model(
            GenericSolverVersion::ProgressQualityShieldV21,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        );
        if let Some(mut decision) = decision {
            if let Some(action) = specialist_quality_opportunity_action(
                recipe,
                crafter,
                state,
                objective,
                context,
                decision.action,
                false,
            ) {
                decision.action = action;
            }
            return Some(decision);
        }
        return specialist_null_recovery_action(recipe, crafter, state, context).map(|action| {
            GenericDecision {
                route: None,
                action,
                option: PlannerOption::ResourceRecovery,
                persona: PlannerPersona::IntegratedGuideContinuation,
            }
        });
    }
    if version == GenericSolverVersion::ProgressQualityShieldV21 {
        let objective = objective_capability_portfolio_objective(recipe, objective, risk);
        let mut decision = recommend_generic_action_with_model(
            GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            random_condition_mask,
        )?;
        if let Some(action) = progress_quality_shield_action(
            recipe,
            crafter,
            state,
            objective,
            context,
            decision.action,
        ) {
            decision.action = action;
        }
        return Some(decision);
    }
    if version == GenericSolverVersion::ObjectiveCapabilityPortfolioV20 {
        return recommend_generic_action_with_model(
            GenericSolverVersion::ConditionContinuationPortfolioV19,
            recipe,
            crafter,
            state,
            objective_capability_portfolio_objective(recipe, objective, risk),
            risk,
            context,
            random_condition_mask,
        );
    }
    if matches!(
        version,
        GenericSolverVersion::ConditionSetPortfolioV17
            | GenericSolverVersion::CapabilityConditionSetPortfolioV18
            | GenericSolverVersion::ConditionContinuationPortfolioV19
    ) {
        let uses_budgeted =
            condition_set_portfolio_uses_budgeted_condition(recipe, risk, random_condition_mask);
        if uses_budgeted {
            let budgeted_decision = recommend_generic_action_with_model(
                GenericSolverVersion::BudgetedConditionV15,
                recipe,
                crafter,
                state,
                objective,
                risk,
                context,
                random_condition_mask,
            )
            .filter(|decision| {
                version != GenericSolverVersion::ConditionContinuationPortfolioV19
                    || !context.shared_continuation_used
                    || shared_continuation_allows_condition_sample(context, decision.action)
            });
            if budgeted_decision.is_some()
                || version != GenericSolverVersion::ConditionContinuationPortfolioV19
            {
                return budgeted_decision;
            }
            return bounded_shared_continuation_decision(
                recipe, crafter, state, objective, risk, context,
            );
        }
        return crate::ts_migration_port::recommend_ts_migration_port(
            recipe, crafter, state, objective, risk, context,
        );
    }
    let forced_persona = fixed_persona(version);
    if state.step == 1
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Reflect, CraftActionId::MuscleMemory],
        )
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: if matches!(
                version,
                GenericSolverVersion::OptionRouteV4
                    | GenericSolverVersion::OptionMpcV5
                    | GenericSolverVersion::GuideOptionMpcV6
                    | GenericSolverVersion::GuideLeaseMpcV7
                    | GenericSolverVersion::GuidePhaseMpcV8
                    | GenericSolverVersion::StrategyPortfolioMpcV9
                    | GenericSolverVersion::CapabilityPortfolioMpcV10
                    | GenericSolverVersion::DeepPortfolioMpcV11
                    | GenericSolverVersion::StrategyProgramMpcV12
                    | GenericSolverVersion::OpportunityReserveV13
                    | GenericSolverVersion::DeliveryShieldV14
                    | GenericSolverVersion::BudgetedConditionV15
                    | GenericSolverVersion::GuideDirectProbe
                    | GenericSolverVersion::IntegratedGuideDirectProbe
                    | GenericSolverVersion::ProgressReserveGuideDirectProbe
                    | GenericSolverVersion::OpportunityReserveGuideDirectProbe
                    | GenericSolverVersion::RiskForwardDirectProbe
            ) {
                PlannerOption::ProgressWindow
            } else {
                PlannerOption::BuildQuality
            },
            persona: forced_persona.unwrap_or_else(|| {
                if matches!(
                    version,
                    GenericSolverVersion::OptionRouteV4
                        | GenericSolverVersion::OptionMpcV5
                        | GenericSolverVersion::GuideOptionMpcV6
                        | GenericSolverVersion::GuideLeaseMpcV7
                        | GenericSolverVersion::GuidePhaseMpcV8
                        | GenericSolverVersion::StrategyPortfolioMpcV9
                        | GenericSolverVersion::CapabilityPortfolioMpcV10
                        | GenericSolverVersion::DeepPortfolioMpcV11
                        | GenericSolverVersion::StrategyProgramMpcV12
                ) {
                    PlannerPersona::OptionRoute
                } else {
                    PlannerPersona::LegacyContinuation
                }
            }),
        });
    }

    if recipe.required_quality > 0
        && let Some(persona) = forced_persona
    {
        if version == GenericSolverVersion::BudgetedConditionV15
            && state.quality >= recipe.required_quality
            && let Some(action) = deterministic_completion_first(recipe, crafter, state, 8)
        {
            return Some(GenericDecision {
                route: None,
                action,
                option: PlannerOption::SafeFinish,
                persona: PlannerPersona::OpportunityReserveGuide,
            });
        }
        if version == GenericSolverVersion::DeliveryShieldV14
            && state.quality >= recipe.required_quality
            && let Some(decision) =
                delivery_shield_decision(recipe, crafter, state, objective, risk)
        {
            return Some(decision);
        }
        if let Some(decision) =
            option_persona_decision(persona, recipe, crafter, state, objective, risk, context)
        {
            return Some(decision);
        }
        if version == GenericSolverVersion::BudgetedConditionV15
            && let Some(action) =
                delivery_recovery_condition_sample(recipe, crafter, state, objective, risk, context)
        {
            return Some(GenericDecision {
                route: None,
                action,
                option: PlannerOption::ConditionFishing,
                persona: PlannerPersona::OpportunityReserveGuide,
            });
        }
        return uses_delivery_shield(version)
            .then(|| delivery_shield_decision(recipe, crafter, state, objective, risk))
            .flatten();
    }

    if version == GenericSolverVersion::OptionRouteV4
        && recipe.required_quality > 0
        && let Some(action) =
            reliable_quality_first_route_action(recipe, crafter, state, objective, context)
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::CertifiedSuffix,
            persona: PlannerPersona::OptionRoute,
        });
    }

    if version == GenericSolverVersion::OptionRouteV4 && recipe.required_quality > 0 {
        let option = settle_option_route(recipe, crafter, state, objective, risk, context);
        let action =
            select_option_route_action(option, recipe, crafter, state, objective, risk, context)
                .or_else(|| match option {
                    PlannerOption::ProgressWindow => best_progress_action(
                        recipe, crafter, state, objective, risk, context, false,
                    ),
                    PlannerOption::InnerQuietBuild | PlannerOption::QualityCycle => {
                        best_quality_action(recipe, crafter, state, objective, risk, context)
                    }
                    PlannerOption::QualityBurst => select_quality_cycle_action(
                        recipe, crafter, state, objective, risk, context,
                    ),
                    PlannerOption::SafeFinish => {
                        best_progress_action(recipe, crafter, state, objective, risk, context, true)
                    }
                    _ => None,
                })?;
        return Some(GenericDecision {
            route: None,
            action,
            option,
            persona: PlannerPersona::OptionRoute,
        });
    }

    if matches!(
        version,
        GenericSolverVersion::OptionMpcV5
            | GenericSolverVersion::GuideOptionMpcV6
            | GenericSolverVersion::GuideLeaseMpcV7
            | GenericSolverVersion::GuidePhaseMpcV8
            | GenericSolverVersion::StrategyPortfolioMpcV9
            | GenericSolverVersion::CapabilityPortfolioMpcV10
            | GenericSolverVersion::DeepPortfolioMpcV11
            | GenericSolverVersion::StrategyProgramMpcV12
    ) && recipe.required_quality > 0
    {
        let declared_condition_weights = declared_condition_set_weights(random_condition_mask);
        let option = settle_option_route(recipe, crafter, state, objective, risk, context);
        let returning_from_suboption = matches!(
            context.active_option,
            PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
        ) && context.resume_option == Some(option);
        let persona = if matches!(
            option,
            PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
        ) {
            PlannerPersona::OptionRoute
        } else if version == GenericSolverVersion::StrategyProgramMpcV12
            && matches!(
                context.active_option,
                PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
            )
        {
            // Recovery and fishing are temporary subprograms. The surrounding
            // strategy program resumes even when the repaired state naturally
            // enters a different option than the one that was interrupted.
            context
                .resume_persona
                .unwrap_or(PlannerPersona::ProgressReserveGuide)
        } else if returning_from_suboption {
            context
                .resume_persona
                .unwrap_or(PlannerPersona::OptionRoute)
        } else if version == GenericSolverVersion::StrategyProgramMpcV12
            && context.observed_transitions > 1
        {
            // A strategy program owns the whole route. Ordinary option changes
            // are internal phases, not permission to splice in another plan.
            context.active_persona
        } else if version == GenericSolverVersion::StrategyProgramMpcV12 {
            declared_condition_weights.as_ref().map_or(
                PlannerPersona::ProgressReserveGuide,
                |weights| {
                    select_strategy_program(
                        recipe, crafter, state, objective, risk, context, weights,
                    )
                },
            )
        } else if version == GenericSolverVersion::GuideLeaseMpcV7
            && context.observed_transitions > 1
        {
            // The rollout evaluator scores a persona as one complete route.
            // Preserve that route owner across ordinary option boundaries so
            // execution cannot splice incompatible cashout/rebuild plans that
            // were never evaluated together.
            context.active_persona
        } else if version == GenericSolverVersion::GuidePhaseMpcV8
            && context.observed_transitions > 1
            && context.last_action != Some(CraftActionId::ByregotsBlessing)
            && same_persona_phase(context.active_option, option)
        {
            // A persona owns a complete progress or quality phase. Recovery
            // and condition fishing are resumable suboptions; Byregot is an
            // explicit phase boundary where the rebuilt suffix is re-evaluated.
            context.active_persona
        } else if context.active_option == option && context.observed_transitions > 1 {
            context.active_persona
        } else if let Some(weights) = declared_condition_weights.as_ref() {
            select_option_persona(
                version, option, recipe, crafter, state, objective, risk, context, weights,
            )
        } else {
            PlannerPersona::OptionRoute
        };
        return option_persona_decision(persona, recipe, crafter, state, objective, risk, context);
    }

    if context.manipulation_uses == 0
        && state.step <= 4
        && state.condition != MaterialCondition::Good
        && state.buffs.manipulation == 0
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::Manipulation],
        )
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::Recovery,
            persona: PlannerPersona::LegacyContinuation,
        });
    }

    // On required-quality crafts, Good is a scarce cross-step resource. Use it
    // to build Inner Quiet before ordinary progress banking; progress can be
    // recovered on Normal, while the lost Precise Touch opportunity cannot.
    if matches!(
        version,
        GenericSolverVersion::RustPrimaryV3
            | GenericSolverVersion::OptionRouteV4
            | GenericSolverVersion::OptionMpcV5
    ) && recipe.required_quality > 0
        && state.condition == MaterialCondition::Good
        && state.inner_quiet < 10
        && let Some(action) = first_safe(
            recipe,
            crafter,
            state,
            objective,
            risk,
            context,
            &[CraftActionId::PreciseTouch],
        )
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::BuildQuality,
            persona: PlannerPersona::LegacyContinuation,
        });
    }

    if version == GenericSolverVersion::HardQualityV2
        && recipe.required_quality > 0
        && let Some(action) = bounded_joint_completion_first(recipe, crafter, state, risk)
    {
        return Some(GenericDecision {
            route: None,
            action,
            option: PlannerOption::HardQualityCashout,
            persona: PlannerPersona::LegacyContinuation,
        });
    }

    let option = decide_option(version, recipe, crafter, state, objective, risk, context);
    let recovery = select_recovery(recipe, crafter, state, objective, risk, context);
    let routed_action = recovery
        .or_else(|| match option {
            PlannerOption::FinishProgress => {
                best_progress_action(recipe, crafter, state, objective, risk, context, true)
            }
            PlannerOption::HardQualityCashout => hard_quality_cashout(
                recipe, crafter, state, objective, risk, context,
            )
            .or_else(|| select_quality(version, recipe, crafter, state, objective, risk, context)),
            PlannerOption::BuildQuality if recipe.required_quality == 0 => {
                let quality =
                    select_quality(version, recipe, crafter, state, objective, risk, context);
                match quality {
                    Some(action)
                        if preserves_deterministic_completion(
                            recipe,
                            crafter,
                            state,
                            action,
                            if uses_delivery_shield(version)
                                && (state.quality >= objective.protected_quality_floor
                                    || branch_state(recipe, crafter, state, action, true)
                                        .is_some_and(|next| {
                                            next.quality >= objective.protected_quality_floor
                                        }))
                            {
                                RiskPreference::Stable
                            } else {
                                risk
                            },
                        ) =>
                    {
                        Some(action)
                    }
                    _ => deterministic_completion_first(recipe, crafter, state, 8),
                }
            }
            PlannerOption::BuildQuality => {
                select_quality(version, recipe, crafter, state, objective, risk, context)
            }
            PlannerOption::SecureProgress => {
                select_progress(recipe, crafter, state, objective, risk, context)
            }
            PlannerOption::Recovery => None,
            _ => None,
        })
        .or_else(|| {
            if state.quality >= completion_floor(recipe, objective) {
                best_progress_action(recipe, crafter, state, objective, risk, context, true)
            } else {
                best_quality_action(recipe, crafter, state, objective, risk, context)
            }
        });
    let fallback_action = routed_action
        .is_none()
        .then(|| {
            legal_actions(recipe, crafter, state)
                .into_iter()
                .find(|action| {
                    if version == GenericSolverVersion::BudgetedConditionV15
                        && matches!(
                            action,
                            CraftActionId::Observe | CraftActionId::CarefulObservation
                        )
                    {
                        if *action == CraftActionId::Observe
                            && budgeted_condition_sample_preview(
                                recipe,
                                crafter,
                                state,
                                objective,
                                risk,
                                context,
                                CraftActionId::CarefulObservation,
                            )
                            .is_some()
                        {
                            return false;
                        }
                        return budgeted_condition_sample_preview(
                            recipe, crafter, state, objective, risk, context, *action,
                        )
                        .is_some();
                    }
                    if excludes_fallback_final_appraisal(
                        version,
                        state.careful_observation_uses_left,
                        context.last_action,
                        state.cp,
                        *action,
                    ) {
                        return false;
                    }
                    safe_preview(recipe, crafter, state, objective, risk, context, *action)
                        .is_some()
                })
        })
        .flatten();
    let condition_sample = fallback_action.filter(|action| {
        matches!(
            action,
            CraftActionId::Observe | CraftActionId::CarefulObservation
        )
    });
    let ordinary_action = routed_action.or(fallback_action);
    let action = ordinary_action.or_else(|| {
        uses_delivery_shield(version)
            .then(|| delivery_shield_decision(recipe, crafter, state, objective, risk))
            .flatten()
            .map(|decision| decision.action)
    })?;
    Some(GenericDecision {
        route: None,
        action,
        option: if condition_sample.is_some() {
            PlannerOption::ConditionFishing
        } else if recovery.is_some() {
            PlannerOption::Recovery
        } else {
            option
        },
        persona: PlannerPersona::LegacyContinuation,
    })
}

pub fn advance_planner_context(
    context: &mut PlannerContext,
    solver_version: GenericSolverVersion,
    decision: GenericDecision,
    before: &CraftState,
    after: &CraftState,
) {
    advance_planner_context_inner(context, solver_version, decision, before, after, true);
}

// Portfolio forecasts only call leaf continuations, which do not consume route
// memory. Preserve every other history field and the portfolio's counting rules.
fn advance_portfolio_leaf_context(
    context: &mut PlannerContext,
    decision: GenericDecision,
    before: &CraftState,
    after: &CraftState,
) {
    advance_planner_context_inner(
        context,
        GenericSolverVersion::RoutePortfolioV1,
        decision,
        before,
        after,
        false,
    );
}

fn advance_planner_context_inner(
    context: &mut PlannerContext,
    solver_version: GenericSolverVersion,
    decision: GenericDecision,
    before: &CraftState,
    after: &CraftState,
    observe_route: bool,
) {
    if observe_route && solver_version.is_route_portfolio() {
        context.route_memory.observe(decision, before, after);
    }
    if matches!(
        solver_version,
        GenericSolverVersion::ConditionContinuationPortfolioV19
            | GenericSolverVersion::ObjectiveCapabilityPortfolioV20
            | GenericSolverVersion::ProgressQualityShieldV21
            | GenericSolverVersion::SpecialistResourcePortfolioV22
            | GenericSolverVersion::ProgressBankPortfolioV23
            | GenericSolverVersion::FlatOpportunityPortfolioV24
            | GenericSolverVersion::SpecialistResourceGuardV25
    ) && decision.persona == PlannerPersona::SharedContinuation
    {
        context.shared_continuation_used = true;
    }
    context.action_uses = context.action_uses.saturating_add(1);
    if action_definition(decision.action).category == ActionCategory::Quality {
        context.last_quality_action_use = context.action_uses;
    }
    if decision.action == CraftActionId::PreciseTouch {
        context.last_precise_touch_action_use = context.action_uses;
    }
    let route_index = context.reliable_quality_first_route_index;
    let expected = usize::try_from(route_index)
        .ok()
        .and_then(|index| RELIABLE_QUALITY_FIRST_ROUTE.get(index))
        .copied();
    let good_quality_substitution = route_index >= 0
        && route_index < RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX
        && decision.action == CraftActionId::PreciseTouch
        && expected
            .is_some_and(|action| action_definition(action).category == ActionCategory::Quality);
    let condition_progress_substitution = route_index
        >= RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX
        && Some(decision.action) != expected
        && is_reliable_quality_first_condition_shortcut(decision.action);
    let quality_complete_route_jump = route_index >= 0
        && route_index < RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX
        && (decision.action
            == RELIABLE_QUALITY_FIRST_ROUTE
                [RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX as usize]
            || is_reliable_quality_first_condition_shortcut(decision.action));
    context.reliable_quality_first_route_index = if quality_complete_route_jump {
        RELIABLE_QUALITY_FIRST_QUALITY_COMPLETE_INDEX + 1
    } else if route_index >= 0
        && (Some(decision.action) == expected
            || good_quality_substitution
            || condition_progress_substitution)
    {
        route_index.saturating_add(1)
    } else {
        -1
    };

    let previous_option = context.active_option;
    let previous_persona = context.active_persona;
    if previous_option == decision.option {
        context.option_steps = context.option_steps.saturating_add(1);
    } else {
        context.active_option = decision.option;
        context.option_steps = 1;
    }
    if previous_option != decision.option {
        if matches!(
            decision.option,
            PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
        ) {
            if !matches!(
                previous_option,
                PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
            ) {
                context.resume_option = Some(previous_option);
                context.resume_persona = Some(previous_persona);
            }
        } else if matches!(
            previous_option,
            PlannerOption::ResourceRecovery | PlannerOption::ConditionFishing
        ) && (context.resume_option == Some(decision.option)
            || solver_version == GenericSolverVersion::StrategyProgramMpcV12)
        {
            context.resume_option = None;
            context.resume_persona = None;
        }
    }
    context.active_persona = decision.persona;
    context.observed_transitions = context.observed_transitions.saturating_add(1);
    match decision.action {
        CraftActionId::Manipulation => {
            context.manipulation_uses = context.manipulation_uses.saturating_add(1)
        }
        CraftActionId::WasteNot | CraftActionId::WasteNot2 => {
            context.waste_not_uses = context.waste_not_uses.saturating_add(1)
        }
        CraftActionId::Innovation => {
            context.innovation_uses = context.innovation_uses.saturating_add(1)
        }
        CraftActionId::QuickInnovation
            if solver_version != GenericSolverVersion::TsMigrationPortV16
                && !solver_version.is_route_portfolio()
                && !(is_ts_migration_portfolio(solver_version)
                    && decision.persona == PlannerPersona::GuideContinuation) =>
        {
            context.innovation_uses = context.innovation_uses.saturating_add(1)
        }
        CraftActionId::GreatStrides => {
            context.great_strides_uses = context.great_strides_uses.saturating_add(1)
        }
        CraftActionId::ByregotsBlessing if before.inner_quiet > after.inner_quiet => {
            context.cashout_cycles = context.cashout_cycles.saturating_add(1)
        }
        _ => {}
    }
    if is_progress_risk(decision.action) || is_quality_risk(decision.action) {
        context.risk_attempts = context.risk_attempts.saturating_add(1);
        if is_progress_risk(decision.action) {
            context.progress_risk_attempts = context.progress_risk_attempts.saturating_add(1);
        } else {
            context.quality_risk_attempts = context.quality_risk_attempts.saturating_add(1);
        }
        let failed = if is_progress_risk(decision.action) {
            after.progress <= before.progress
        } else {
            after.quality <= before.quality
        };
        if failed {
            context.risk_failures = context.risk_failures.saturating_add(1);
            context.consecutive_risk_failures = context.consecutive_risk_failures.saturating_add(1);
        } else {
            context.consecutive_risk_failures = 0;
        }
    } else if decision.option == PlannerOption::ResourceRecovery {
        context.consecutive_risk_failures = 0;
    }
    if decision.option == PlannerOption::ConditionFishing
        && matches!(
            decision.action,
            CraftActionId::Observe | CraftActionId::CarefulObservation
        )
    {
        context.fishing_used = true;
        context.fishing_rolls_remaining = if previous_option == PlannerOption::ConditionFishing {
            context.fishing_rolls_remaining.saturating_sub(1)
        } else if decision.action == CraftActionId::CarefulObservation {
            before
                .careful_observation_uses_left
                .saturating_sub(1)
                .clamp(0, i32::from(u8::MAX)) as u8
        } else {
            1
        };
    }
    context.last_action = Some(decision.action);

    if decision.option == PlannerOption::HardQualityCashout
        && (after.inner_quiet < 8 || after.terminal != CraftTerminal::None)
    {
        context.active_option = PlannerOption::BuildQuality;
        context.option_steps = 0;
    }
}

pub fn planner_context_fingerprint(
    solver_version: GenericSolverVersion,
    context: &PlannerContext,
) -> String {
    if solver_version.is_route_portfolio() {
        return portfolio::context_fingerprint(context);
    }
    if solver_version == GenericSolverVersion::TsMigrationPortV16
        || is_ts_migration_portfolio(solver_version)
            && context.active_persona == PlannerPersona::GuideContinuation
    {
        return format!(
            "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
            GUIDE_INTEGRATED_DECISION_MEMORY_VERSION,
            context.action_uses,
            context.last_quality_action_use,
            context.last_precise_touch_action_use,
            context.waste_not_uses,
            context.manipulation_uses,
            context.innovation_uses,
            context.great_strides_uses,
            context.reliable_quality_first_route_index,
            context.last_action.map_or("-", CraftActionId::as_str),
        );
    }
    let fingerprint = format!(
        "{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        GENERIC_PLANNER_CONTEXT_VERSION,
        context.active_option,
        context.active_persona.as_str(),
        context.option_steps,
        context.observed_transitions,
        context.manipulation_uses,
        context.waste_not_uses,
        context.innovation_uses,
        context.great_strides_uses,
        context.cashout_cycles,
        context.resume_option.map_or("-", PlannerOption::as_str),
        context.resume_persona.map_or("-", PlannerPersona::as_str),
        i32::from(context.fishing_used),
        context.fishing_rolls_remaining,
        context.risk_attempts,
        context.progress_risk_attempts,
        context.quality_risk_attempts,
        context.risk_failures,
        context.consecutive_risk_failures,
        context.last_action.map_or("-", CraftActionId::as_str),
    );
    if matches!(
        solver_version,
        GenericSolverVersion::ConditionContinuationPortfolioV19
            | GenericSolverVersion::ObjectiveCapabilityPortfolioV20
            | GenericSolverVersion::ProgressQualityShieldV21
            | GenericSolverVersion::SpecialistResourcePortfolioV22
            | GenericSolverVersion::ProgressBankPortfolioV23
            | GenericSolverVersion::FlatOpportunityPortfolioV24
            | GenericSolverVersion::SpecialistResourceGuardV25
    ) {
        format!(
            "{fingerprint}:{}:{}",
            context.action_limit,
            i32::from(context.shared_continuation_used)
        )
    } else {
        fingerprint
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hard_quality_recipe() -> RecipeProfile {
        RecipeProfile {
            canonical_recipe_id: 1,
            recipe_level: 746,
            progress_required: 8_500,
            quality_max: 19_500,
            required_quality: 19_500,
            durability_max: 40,
            progress_divider: 180.0,
            quality_divider: 180.0,
            progress_modifier: 100.0,
            quality_modifier: 100.0,
        }
    }

    fn short_progress_collectable_recipe() -> RecipeProfile {
        RecipeProfile {
            canonical_recipe_id: 36_195,
            recipe_level: 100,
            progress_required: 400,
            quality_max: 21_000,
            required_quality: 0,
            durability_max: 60,
            progress_divider: 180.0,
            quality_divider: 180.0,
            progress_modifier: 100.0,
            quality_modifier: 100.0,
        }
    }

    fn five_meld_buffed_crafter() -> CrafterProfile {
        CrafterProfile {
            level: 100,
            craftsmanship: 5_811,
            control: 5_500,
            max_cp: 776,
            cosmic_tool_good_bonus: true,
            specialist: false,
        }
    }

    #[test]
    fn condition_set_portfolio_uses_only_declared_recipe_signals() {
        let hard = hard_quality_recipe();
        for mask in [
            HARD_QUALITY_CENTERED_PLIANT_GOOD_OMEN_MASK,
            HARD_QUALITY_CENTERED_PLIANT_ROBUST_MASK,
            HARD_QUALITY_CENTERED_PLIANT_COMPACT_MASK,
        ] {
            assert!(condition_set_portfolio_uses_budgeted_condition(
                &hard,
                RiskPreference::Balanced,
                Some(mask),
            ));
            assert!(condition_set_portfolio_uses_budgeted_condition(
                &hard,
                RiskPreference::Aggressive,
                Some(mask),
            ));
            assert!(!condition_set_portfolio_uses_budgeted_condition(
                &hard,
                RiskPreference::Stable,
                Some(mask),
            ));
        }

        let mut optional = hard;
        optional.required_quality = 0;
        assert!(!condition_set_portfolio_uses_budgeted_condition(
            &optional,
            RiskPreference::Balanced,
            Some(HARD_QUALITY_CENTERED_PLIANT_GOOD_OMEN_MASK),
        ));
        assert!(!condition_set_portfolio_uses_budgeted_condition(
            &hard,
            RiskPreference::Balanced,
            Some(0x01bb),
        ));
        assert!(!condition_set_portfolio_uses_budgeted_condition(
            &hard,
            RiskPreference::Balanced,
            None,
        ));
    }

    #[test]
    fn current_portfolio_identities_round_trip() {
        for (identity, expected) in [
            (
                COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CompletionAwarePortfolioV12,
            ),
            (
                COMPLETION_AWARE_PORTFOLIO_EXPERIMENT_VERSION,
                GenericSolverVersion::CompletionAwarePortfolioExperiment,
            ),
            (
                CONDITION_OPPORTUNITY_ABLATION_EXPERIMENT_VERSION,
                GenericSolverVersion::ConditionOpportunityAblationExperiment,
            ),
            (
                AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::AggressiveResourcePortfolioV11,
            ),
            (
                EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ExperimentalPortfolio,
            ),
            (
                OBJECTIVE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ObjectivePortfolioV10,
            ),
            (
                EQUIVALENT_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::EquivalentPortfolioV9,
            ),
            (
                QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::QualityBoundPortfolioV8,
            ),
            (
                CERTIFIED_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CertifiedPortfolioV7,
            ),
            (
                COMPACT_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CompactPortfolioV6,
            ),
            (
                CACHED_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CachedPortfolioV5,
            ),
            (
                CONSTRUCTION_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ConstructionPortfolioV4,
            ),
            (
                COORDINATED_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CoordinatedPortfolioV3,
            ),
            (
                ROUTE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::RoutePortfolioV1,
            ),
            (
                RESOURCE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ResourcePortfolioV2,
            ),
            (
                GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::CapabilityConditionSetPortfolioV18,
            ),
            (
                GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ConditionContinuationPortfolioV19,
            ),
            (
                GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
            ),
            (
                GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
                GenericSolverVersion::ProgressQualityShieldV21,
            ),
            (
                GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::SpecialistResourcePortfolioV22,
            ),
            (
                GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::ProgressBankPortfolioV23,
            ),
            (
                GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION,
                GenericSolverVersion::FlatOpportunityPortfolioV24,
            ),
            (
                GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
                GenericSolverVersion::SpecialistResourceGuardV25,
            ),
        ] {
            let version = identity
                .parse::<GenericSolverVersion>()
                .expect("portfolio policy identity should parse");
            assert_eq!(version, expected);
            assert_eq!(version.as_str(), identity);
        }

        let context = PlannerContext {
            active_persona: PlannerPersona::GuideContinuation,
            action_uses: 2,
            ..PlannerContext::default()
        };
        for version in [
            GenericSolverVersion::CapabilityConditionSetPortfolioV18,
            GenericSolverVersion::ConditionContinuationPortfolioV19,
            GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
            GenericSolverVersion::ProgressQualityShieldV21,
            GenericSolverVersion::SpecialistResourcePortfolioV22,
            GenericSolverVersion::ProgressBankPortfolioV23,
            GenericSolverVersion::FlatOpportunityPortfolioV24,
            GenericSolverVersion::SpecialistResourceGuardV25,
        ] {
            assert!(
                planner_context_fingerprint(version, &context)
                    .starts_with(GUIDE_INTEGRATED_DECISION_MEMORY_VERSION)
            );
        }
    }

    #[test]
    fn progress_quality_shield_defers_a_premature_guaranteed_finish() {
        let recipe = short_progress_collectable_recipe();
        let crafter = five_meld_buffed_crafter();
        let mut state = CraftState::initial(&recipe, &crafter);
        state.step = 5;
        state.quality = 3_332;
        state.durability = 5;
        state.cp = 705;
        state.condition = MaterialCondition::Good;
        state.inner_quiet = 7;
        state.combo_from = Some(CraftActionId::PrudentTouch);
        let objective = GenericObjective {
            quality_maximum: recipe.quality_max,
            protected_quality_floor: 14_700,
            adaptive_completion: true,
            quality_utility_kind: QualityUtilityKind::CollectabilityTiers,
            quality_milestone_count: 3,
            quality_milestones: [8_400, 11_550, 14_700, 0],
        };
        let context = PlannerContext {
            action_uses: 4,
            last_quality_action_use: 4,
            last_action: Some(CraftActionId::PrudentTouch),
            ..PlannerContext::default()
        };

        let previous = recommend_generic_action(
            GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Balanced,
            &context,
        )
        .expect("v0.25 should recommend its immediate completion route");
        assert_eq!(previous.action, CraftActionId::DelicateSynthesis);
        let candidate = recommend_generic_action(
            GenericSolverVersion::ProgressQualityShieldV21,
            &recipe,
            &crafter,
            &state,
            objective,
            RiskPreference::Balanced,
            &context,
        )
        .expect("v0.26 should preserve a quality continuation");
        assert_eq!(candidate.action, CraftActionId::TrainedPerfection);
    }

    #[test]
    fn specialist_resource_guard_counts_manipulation_as_durability_cover() {
        let recipe = hard_quality_recipe();
        let mut crafter = five_meld_buffed_crafter();
        crafter.specialist = true;
        let objective = GenericObjective {
            quality_maximum: recipe.quality_max,
            protected_quality_floor: recipe.quality_max,
            adaptive_completion: false,
            quality_utility_kind: QualityUtilityKind::HardQualityMaximum,
            quality_milestone_count: 1,
            quality_milestones: [recipe.quality_max, 0, 0, 0],
        };
        let context = PlannerContext::default();
        let mut covered = CraftState::initial(&recipe, &crafter);
        covered.progress = 4_000;
        covered.quality = 8_600;
        covered.durability = 10;
        covered.cp = 331;
        covered.inner_quiet = 10;
        covered.buffs.manipulation = 6;

        assert_eq!(
            specialist_quality_opportunity_action(
                &recipe,
                &crafter,
                &covered,
                objective,
                &context,
                CraftActionId::TrainedFinesse,
                false,
            ),
            Some(CraftActionId::QuickInnovation),
        );
        assert_eq!(
            specialist_quality_opportunity_action(
                &recipe,
                &crafter,
                &covered,
                objective,
                &context,
                CraftActionId::TrainedFinesse,
                true,
            ),
            None,
        );

        covered.cp = 24;
        covered.condition = MaterialCondition::Good;
        assert_eq!(
            specialist_quality_opportunity_action(
                &recipe,
                &crafter,
                &covered,
                objective,
                &context,
                CraftActionId::PreciseTouch,
                true,
            ),
            Some(CraftActionId::QuickInnovation),
        );
    }

    #[test]
    fn objective_capability_portfolio_preserves_encoded_tier_floor() {
        let mut recipe = hard_quality_recipe();
        recipe.required_quality = 0;
        recipe.quality_max = 20_000;
        let objective = GenericObjective {
            quality_maximum: 20_000,
            protected_quality_floor: 14_000,
            adaptive_completion: true,
            quality_utility_kind: QualityUtilityKind::CollectabilityTiers,
            quality_milestone_count: 3,
            quality_milestones: [8_000, 11_000, 14_000, 0],
        };

        let adjusted =
            objective_capability_portfolio_objective(&recipe, objective, RiskPreference::Balanced);
        assert_eq!(adjusted.quality_milestone_count, 3);
        assert_eq!(adjusted.quality_milestones, [8_000, 11_000, 14_000, 0]);
        assert_eq!(adjusted.quality_maximum, recipe.quality_max);
        assert_eq!(adjusted.protected_quality_floor, 14_000);

        for risk in [RiskPreference::Stable, RiskPreference::Aggressive] {
            assert_eq!(
                objective_capability_portfolio_objective(&recipe, objective, risk),
                objective,
            );
        }
    }

    #[test]
    fn shared_continuation_condition_sampling_cannot_reset_its_budget() {
        let unused = PlannerContext::default();
        assert!(shared_continuation_allows_condition_sample(
            &unused,
            CraftActionId::Observe,
        ));

        let continuing = PlannerContext {
            active_option: PlannerOption::ConditionFishing,
            fishing_used: true,
            fishing_rolls_remaining: 1,
            ..PlannerContext::default()
        };
        assert!(shared_continuation_allows_condition_sample(
            &continuing,
            CraftActionId::CarefulObservation,
        ));

        let exhausted = PlannerContext {
            active_option: PlannerOption::BuildQuality,
            fishing_used: true,
            fishing_rolls_remaining: 0,
            ..PlannerContext::default()
        };
        assert!(!shared_continuation_allows_condition_sample(
            &exhausted,
            CraftActionId::Observe,
        ));
        assert!(shared_continuation_allows_condition_sample(
            &exhausted,
            CraftActionId::TricksOfTheTrade,
        ));

        let late_entry = PlannerContext {
            action_uses: 12,
            action_limit: 20,
            ..PlannerContext::default()
        };
        assert!(!shared_continuation_entry_has_runway(&late_entry, false));
        assert!(shared_continuation_entry_has_runway(&late_entry, true));

        let admitted = PlannerContext {
            action_uses: 16,
            action_limit: 20,
            shared_continuation_used: true,
            ..PlannerContext::default()
        };
        assert!(shared_continuation_entry_has_runway(&admitted, false));
    }

    #[test]
    fn ts_migration_identity_round_trips_and_uses_ts_memory_fingerprint() {
        let version = GENERIC_TS_MIGRATION_PORT_POLICY_VERSION
            .parse::<GenericSolverVersion>()
            .expect("TS migration policy identity should parse");
        assert_eq!(version, GenericSolverVersion::TsMigrationPortV16);
        assert_eq!(version.as_str(), GENERIC_TS_MIGRATION_PORT_POLICY_VERSION);

        let context = PlannerContext {
            action_uses: 7,
            last_quality_action_use: 5,
            last_precise_touch_action_use: 3,
            waste_not_uses: 1,
            manipulation_uses: 2,
            innovation_uses: 4,
            great_strides_uses: 1,
            reliable_quality_first_route_index: -1,
            last_action: Some(CraftActionId::Observe),
            ..PlannerContext::default()
        };
        assert_eq!(
            planner_context_fingerprint(version, &context),
            "guide-integrated-decision-memory-v0.5.0:7:5:3:1:2:4:1:-1:observe"
        );
    }

    #[test]
    fn legacy_final_appraisal_guard_does_not_exclude_other_fallback_actions() {
        assert!(excludes_fallback_final_appraisal(
            GenericSolverVersion::RustPrimaryV3,
            0,
            None,
            0,
            CraftActionId::FinalAppraisal,
        ));
        assert!(!excludes_fallback_final_appraisal(
            GenericSolverVersion::RustPrimaryV3,
            0,
            None,
            0,
            CraftActionId::BasicSynthesis,
        ));
    }
}
