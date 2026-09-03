//! Public integration API for requesting one crafting action at a time.
//!
//! Report the action that was actually used after each recommendation so the
//! session can continue from the observed result.

use std::fmt;

use crate::{
    GENERIC_EXTERNAL_REFERENCE_POLICY_VERSION, GenericDecision, GenericObjective,
    GenericSolverVersion, PlannerContext, QualityUtilityKind, RiskPreference,
    advance_planner_context, apply_observed_outcome, recommend_generic_action_with_model,
};

pub use crate::types::{
    CraftActionId, CraftBuffs, CraftFailureReason, CraftState, CraftTerminal, CrafterProfile,
    MaterialCondition, ObservedActionOutcome, RecipeProfile, TransitionError, TransitionResult,
};

/// Version of the small public API in this module.
///
/// This changes only when an integrator-facing contract changes. Use
/// [`MAIN_SOLVER_POLICY_VERSION`] to identify the decision policy itself.
pub const MAIN_SOLVER_API_VERSION: &str = "frozen-rabbit-main-solver-api-v1";

/// Identity of the decision policy used by [`MainSolverSession`].
pub const MAIN_SOLVER_POLICY_VERSION: &str = GENERIC_EXTERNAL_REFERENCE_POLICY_VERSION;

/// Default maximum number of observed actions in one craft.
pub const DEFAULT_MAIN_SOLVER_ACTION_LIMIT: u32 = 80;

const SUPPORTED_CONDITION_MASK: u16 = (1_u16 << crate::MATERIAL_CONDITION_COUNT) - 1;

/// Conditions the caller declares possible in the current recipe world.
///
/// This is a capability set, not a probability distribution. `Normal` must
/// always be present.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AvailableConditions(u16);

impl AvailableConditions {
    /// All expert-crafting conditions currently understood by the kernel.
    pub const ALL: Self = Self(SUPPORTED_CONDITION_MASK);

    /// A deterministic world containing only `Normal`.
    pub const NORMAL_ONLY: Self = Self(1);

    pub fn from_conditions(conditions: &[MaterialCondition]) -> Result<Self, MainSolverError> {
        let mask = conditions
            .iter()
            .fold(0_u16, |mask, condition| mask | (1_u16 << condition.index()));
        Self::from_mask(mask)
    }

    pub fn from_mask(mask: u16) -> Result<Self, MainSolverError> {
        if mask == 0 || mask & !SUPPORTED_CONDITION_MASK != 0 || mask & 1 == 0 {
            return Err(MainSolverError::InvalidConfiguration(
                "available conditions must contain Normal and only supported conditions".into(),
            ));
        }
        Ok(Self(mask))
    }

    pub const fn contains(self, condition: MaterialCondition) -> bool {
        self.0 & (1_u16 << condition.index()) != 0
    }

    pub const fn mask(self) -> u16 {
        self.0
    }
}

/// Quality objective for one craft.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MainSolverObjective {
    /// The solver pursues the recipe's full quality maximum, which must also
    /// be the recipe's mechanics completion requirement.
    HardQuality { quality_maximum: i32 },
    /// Four increasing collectability thresholds, ending at quality maximum.
    CollectabilityTiers {
        milestones: [i32; 4],
        protected_floor: i32,
    },
    /// Continuous score where more unfinished quality remains useful.
    ContinuousCollectability {
        quality_maximum: i32,
        protected_floor: i32,
    },
    /// HQ-chance objective using the kernel's 50%, 75%, and 100% milestones.
    HqChance {
        quality_maximum: i32,
        protected_floor: i32,
    },
}

impl MainSolverObjective {
    fn as_generic(self) -> GenericObjective {
        match self {
            Self::HardQuality { quality_maximum } => GenericObjective {
                quality_maximum,
                protected_quality_floor: quality_maximum,
                adaptive_completion: false,
                quality_utility_kind: QualityUtilityKind::HardQualityMaximum,
                quality_milestone_count: 1,
                quality_milestones: [quality_maximum, 0, 0, 0],
            },
            Self::CollectabilityTiers {
                milestones,
                protected_floor,
            } => GenericObjective {
                quality_maximum: milestones[3],
                protected_quality_floor: protected_floor,
                adaptive_completion: true,
                quality_utility_kind: QualityUtilityKind::CollectabilityTiers,
                quality_milestone_count: 4,
                quality_milestones: milestones,
            },
            Self::ContinuousCollectability {
                quality_maximum,
                protected_floor,
            } => GenericObjective {
                quality_maximum,
                protected_quality_floor: protected_floor,
                adaptive_completion: true,
                quality_utility_kind: QualityUtilityKind::ContinuousCollectability,
                quality_milestone_count: 1,
                quality_milestones: [quality_maximum, 0, 0, 0],
            },
            Self::HqChance {
                quality_maximum,
                protected_floor,
            } => GenericObjective {
                quality_maximum,
                protected_quality_floor: protected_floor,
                adaptive_completion: true,
                quality_utility_kind: QualityUtilityKind::HqChance,
                quality_milestone_count: 3,
                quality_milestones: [
                    percentage_ceiling(quality_maximum, 76),
                    percentage_ceiling(quality_maximum, 82),
                    quality_maximum,
                    0,
                ],
            },
        }
    }
}

const fn percentage_ceiling(value: i32, percentage: i64) -> i32 {
    ((value as i64 * percentage + 99) / 100) as i32
}

/// Immutable identity of one solver session.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainSolverConfig {
    recipe: RecipeProfile,
    crafter: CrafterProfile,
    objective: MainSolverObjective,
    available_conditions: AvailableConditions,
    action_limit: u32,
}

impl MainSolverConfig {
    pub fn new(
        recipe: RecipeProfile,
        crafter: CrafterProfile,
        objective: MainSolverObjective,
        available_conditions: AvailableConditions,
    ) -> Result<Self, MainSolverError> {
        let config = Self {
            recipe,
            crafter,
            objective,
            available_conditions,
            action_limit: DEFAULT_MAIN_SOLVER_ACTION_LIMIT,
        };
        config.validate()?;
        Ok(config)
    }

    pub fn with_action_limit(mut self, action_limit: u32) -> Result<Self, MainSolverError> {
        self.action_limit = action_limit;
        self.validate()?;
        Ok(self)
    }

    pub const fn recipe(&self) -> &RecipeProfile {
        &self.recipe
    }

    pub const fn crafter(&self) -> &CrafterProfile {
        &self.crafter
    }

    pub const fn objective(&self) -> MainSolverObjective {
        self.objective
    }

    pub const fn available_conditions(&self) -> AvailableConditions {
        self.available_conditions
    }

    pub const fn action_limit(&self) -> u32 {
        self.action_limit
    }

    fn validate(&self) -> Result<(), MainSolverError> {
        let recipe = self.recipe;
        if recipe.progress_required <= 0
            || recipe.quality_max <= 0
            || !(0..=recipe.quality_max).contains(&recipe.required_quality)
            || recipe.durability_max <= 0
            || !recipe.progress_divider.is_finite()
            || recipe.progress_divider <= 0.0
            || !recipe.quality_divider.is_finite()
            || recipe.quality_divider <= 0.0
            || !recipe.progress_modifier.is_finite()
            || recipe.progress_modifier <= 0.0
            || !recipe.quality_modifier.is_finite()
            || recipe.quality_modifier <= 0.0
        {
            return Err(MainSolverError::InvalidConfiguration(
                "recipe profile contains an invalid requirement, durability, divider, or modifier"
                    .into(),
            ));
        }
        if self.crafter.level == 0
            || self.crafter.craftsmanship == 0
            || self.crafter.control == 0
            || self.crafter.max_cp <= 0
        {
            return Err(MainSolverError::InvalidConfiguration(
                "crafter level, craftsmanship, control, and max CP must be positive".into(),
            ));
        }
        if self.action_limit == 0 {
            return Err(MainSolverError::InvalidConfiguration(
                "action limit must be positive".into(),
            ));
        }
        AvailableConditions::from_mask(self.available_conditions.mask())?;
        if matches!(self.objective, MainSolverObjective::HardQuality { .. })
            && recipe.required_quality != recipe.quality_max
        {
            return Err(MainSolverError::InvalidConfiguration(
                "hard quality requires recipe required quality to equal quality maximum".into(),
            ));
        }
        validate_objective(self.objective.as_generic(), recipe.quality_max)
    }
}

fn validate_objective(
    objective: GenericObjective,
    recipe_quality_maximum: i32,
) -> Result<(), MainSolverError> {
    if objective.quality_maximum != recipe_quality_maximum {
        return Err(MainSolverError::InvalidConfiguration(
            "objective quality maximum must equal recipe quality maximum".into(),
        ));
    }
    if !(0..=objective.quality_maximum).contains(&objective.protected_quality_floor) {
        return Err(MainSolverError::InvalidConfiguration(
            "protected quality floor must be between zero and quality maximum".into(),
        ));
    }
    let count = usize::from(objective.quality_milestone_count);
    if count == 0 || count > objective.quality_milestones.len() {
        return Err(MainSolverError::InvalidConfiguration(
            "quality milestone count must be between one and four".into(),
        ));
    }
    let active = &objective.quality_milestones[..count];
    if active
        .iter()
        .any(|milestone| *milestone <= 0 || *milestone > objective.quality_maximum)
        || active.windows(2).any(|pair| pair[0] >= pair[1])
        || objective.quality_milestones[count..]
            .iter()
            .any(|milestone| *milestone != 0)
        || active.last().copied() != Some(objective.quality_maximum)
    {
        return Err(MainSolverError::InvalidConfiguration(
            "quality milestones must increase to quality maximum and use zero padding".into(),
        ));
    }
    match objective.quality_utility_kind {
        QualityUtilityKind::HardQualityMaximum
            if active != [objective.quality_maximum]
                || objective.protected_quality_floor != objective.quality_maximum =>
        {
            Err(MainSolverError::InvalidConfiguration(
                "hard quality requires quality maximum as its milestone and protected floor".into(),
            ))
        }
        QualityUtilityKind::CollectabilityTiers
            if count != 4 || !active.contains(&objective.protected_quality_floor) =>
        {
            Err(MainSolverError::InvalidConfiguration(
                "collectability tiers require four milestones and a milestone protected floor"
                    .into(),
            ))
        }
        QualityUtilityKind::HqChance
            if count != 3 || !active.contains(&objective.protected_quality_floor) =>
        {
            Err(MainSolverError::InvalidConfiguration(
                "HQ chance requires a 50%, 75%, or 100% protected floor".into(),
            ))
        }
        _ => Ok(()),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PendingRecommendation {
    decision: GenericDecision,
    before_state: CraftState,
}

/// One actionable response from the main solver.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MainSolverRecommendation {
    pub action: CraftActionId,
    pub api_version: &'static str,
    pub policy_version: &'static str,
}

/// Result of asking the session for its next decision.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MainSolverStatus {
    Recommendation(MainSolverRecommendation),
    Terminal(CraftTerminal),
    ActionLimitReached,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MainSolverError {
    InvalidConfiguration(String),
    PendingRecommendation,
    MissingRecommendation,
    InvalidObservedState,
    Transition(TransitionError),
}

impl fmt::Display for MainSolverError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfiguration(message) => {
                write!(formatter, "invalid configuration: {message}")
            }
            Self::PendingRecommendation => formatter.write_str(
                "observe or cancel the pending recommendation before requesting another one",
            ),
            Self::MissingRecommendation => {
                formatter.write_str("recommend must be called before reporting an outcome")
            }
            Self::InvalidObservedState => formatter.write_str(
                "observed state is not a valid success or failure outcome of the reported action",
            ),
            Self::Transition(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for MainSolverError {}

impl From<TransitionError> for MainSolverError {
    fn from(error: TransitionError) -> Self {
        Self::Transition(error)
    }
}

/// Stateful public entrypoint for the current `Balanced` main solver.
#[derive(Clone, Debug, PartialEq)]
pub struct MainSolverSession {
    config: MainSolverConfig,
    context: PlannerContext,
    pending: Option<PendingRecommendation>,
    observed_actions: u32,
}

impl MainSolverSession {
    pub fn new(config: MainSolverConfig) -> Self {
        Self {
            context: fresh_context(config.action_limit),
            config,
            pending: None,
            observed_actions: 0,
        }
    }

    pub const fn config(&self) -> &MainSolverConfig {
        &self.config
    }

    pub fn reset(&mut self) {
        self.context = fresh_context(self.config.action_limit);
        self.pending = None;
        self.observed_actions = 0;
    }

    pub fn cancel_pending_and_reset(&mut self) {
        self.reset();
    }

    /// Recommends one action from the fully observed current state.
    ///
    /// Before calling this again, report the action actually used through
    /// [`Self::observe`] or [`Self::observe_state`].
    pub fn recommend(&mut self, state: &CraftState) -> Result<MainSolverStatus, MainSolverError> {
        if self.pending.is_some() {
            return Err(MainSolverError::PendingRecommendation);
        }
        if state.terminal != CraftTerminal::None {
            return Ok(MainSolverStatus::Terminal(state.terminal));
        }
        if self.observed_actions >= self.config.action_limit {
            return Ok(MainSolverStatus::ActionLimitReached);
        }
        let decision = recommend_generic_action_with_model(
            GenericSolverVersion::ExternalReferenceV21,
            &self.config.recipe,
            &self.config.crafter,
            state,
            self.config.objective.as_generic(),
            RiskPreference::Balanced,
            &self.context,
            Some(self.config.available_conditions.mask()),
        );
        let Some(decision) = decision else {
            return Ok(MainSolverStatus::Unavailable);
        };
        self.pending = Some(PendingRecommendation {
            decision,
            before_state: state.clone(),
        });
        Ok(MainSolverStatus::Recommendation(MainSolverRecommendation {
            action: decision.action,
            api_version: MAIN_SOLVER_API_VERSION,
            policy_version: MAIN_SOLVER_POLICY_VERSION,
        }))
    }

    /// Applies the observed result of the action that was actually used.
    pub fn observe(
        &mut self,
        action: CraftActionId,
        outcome: ObservedActionOutcome,
    ) -> Result<TransitionResult, MainSolverError> {
        let pending = self
            .pending
            .take()
            .ok_or(MainSolverError::MissingRecommendation)?;
        let transition = match apply_observed_outcome(
            &self.config.recipe,
            &self.config.crafter,
            &pending.before_state,
            action,
            outcome,
        ) {
            Ok(transition) => transition,
            Err(error) => {
                self.pending = Some(pending);
                return Err(error.into());
            }
        };
        self.accept_observed_state(pending, action, &transition.next_state);
        Ok(transition)
    }

    /// Accepts a complete next state and validates it against the reported action.
    pub fn observe_state(
        &mut self,
        action: CraftActionId,
        after_state: &CraftState,
    ) -> Result<ObservedActionOutcome, MainSolverError> {
        let pending = self
            .pending
            .take()
            .ok_or(MainSolverError::MissingRecommendation)?;
        let matched = [true, false].into_iter().find_map(|success| {
            let outcome = ObservedActionOutcome {
                success,
                next_condition: after_state.condition,
            };
            apply_observed_outcome(
                &self.config.recipe,
                &self.config.crafter,
                &pending.before_state,
                action,
                outcome,
            )
            .is_ok_and(|transition| transition.next_state == *after_state)
            .then_some(outcome)
        });
        let Some(outcome) = matched else {
            self.pending = Some(pending);
            return Err(MainSolverError::InvalidObservedState);
        };
        self.accept_observed_state(pending, action, after_state);
        Ok(outcome)
    }

    fn accept_observed_state(
        &mut self,
        pending: PendingRecommendation,
        action: CraftActionId,
        after_state: &CraftState,
    ) {
        self.observed_actions = self.observed_actions.saturating_add(1);
        if action == pending.decision.action {
            advance_planner_context(
                &mut self.context,
                GenericSolverVersion::ExternalReferenceV21,
                pending.decision,
                &pending.before_state,
                after_state,
            );
        } else {
            self.context = fresh_context(self.config.action_limit);
        }
    }
}

fn fresh_context(action_limit: u32) -> PlannerContext {
    PlannerContext {
        action_limit,
        ..PlannerContext::default()
    }
}
