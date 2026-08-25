use std::fmt;
use std::str::FromStr;

pub const MATERIAL_CONDITION_COUNT: usize = 9;

macro_rules! string_enum {
    (
        $(#[$meta:meta])*
        $visibility:vis enum $name:ident {
            $($variant:ident => $value:literal),+ $(,)?
        }
    ) => {
        $(#[$meta])*
        $visibility enum $name {
            $($variant),+
        }

        impl $name {
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            pub const fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $value),+
                }
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(self.as_str())
            }
        }

        impl FromStr for $name {
            type Err = String;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                match value {
                    $($value => Ok(Self::$variant)),+,
                    _ => Err(format!("unknown {}: {value}", stringify!($name))),
                }
            }
        }
    };
}

string_enum! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub enum MaterialCondition {
        Normal => "normal",
        Good => "good",
        GoodOmen => "goodOmen",
        Centered => "centered",
        Sturdy => "sturdy",
        Pliant => "pliant",
        Malleable => "malleable",
        Primed => "primed",
        Robust => "robust",
    }
}

impl MaterialCondition {
    pub const fn index(self) -> usize {
        match self {
            Self::Normal => 0,
            Self::Good => 1,
            Self::GoodOmen => 2,
            Self::Centered => 3,
            Self::Sturdy => 4,
            Self::Pliant => 5,
            Self::Malleable => 6,
            Self::Primed => 7,
            Self::Robust => 8,
        }
    }
}

string_enum! {
    #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
    pub enum CraftActionId {
        BasicSynthesis => "basicSynthesis",
        RapidSynthesis => "rapidSynthesis",
        CarefulSynthesis => "carefulSynthesis",
        Groundwork => "groundwork",
        PrudentSynthesis => "prudentSynthesis",
        IntensiveSynthesis => "intensiveSynthesis",
        MuscleMemory => "muscleMemory",
        BasicTouch => "basicTouch",
        HastyTouch => "hastyTouch",
        StandardTouch => "standardTouch",
        AdvancedTouch => "advancedTouch",
        PrudentTouch => "prudentTouch",
        PreparatoryTouch => "preparatoryTouch",
        PreciseTouch => "preciseTouch",
        ByregotsBlessing => "byregotsBlessing",
        TrainedFinesse => "trainedFinesse",
        RefinedTouch => "refinedTouch",
        DaringTouch => "daringTouch",
        Reflect => "reflect",
        DelicateSynthesis => "delicateSynthesis",
        TricksOfTheTrade => "tricksOfTheTrade",
        TrainedPerfection => "trainedPerfection",
        MastersMend => "mastersMend",
        ImmaculateMend => "immaculateMend",
        WasteNot => "wasteNot",
        WasteNot2 => "wasteNot2",
        Veneration => "veneration",
        Innovation => "innovation",
        GreatStrides => "greatStrides",
        Manipulation => "manipulation",
        Observe => "observe",
        FinalAppraisal => "finalAppraisal",
        CarefulObservation => "carefulObservation",
        HeartAndSoul => "heartAndSoul",
        QuickInnovation => "quickInnovation",
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActionCategory {
    Progress,
    Quality,
    Repair,
    Buff,
    Utility,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RecipeProfile {
    pub canonical_recipe_id: u32,
    pub recipe_level: u32,
    pub progress_required: i32,
    pub quality_max: i32,
    pub required_quality: i32,
    pub durability_max: i32,
    pub progress_divider: f64,
    pub quality_divider: f64,
    pub progress_modifier: f64,
    pub quality_modifier: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CrafterProfile {
    pub level: u32,
    pub craftsmanship: u32,
    pub control: u32,
    pub max_cp: i32,
    pub cosmic_tool_good_bonus: bool,
    pub specialist: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CraftBuffs {
    pub waste_not: i32,
    pub veneration: i32,
    pub great_strides: i32,
    pub innovation: i32,
    pub final_appraisal: i32,
    pub manipulation: i32,
    pub muscle_memory: i32,
    pub expedience: i32,
}

string_enum! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub enum CraftTerminal {
        None => "none",
        Completed => "completed",
        Failed => "failed",
    }
}

string_enum! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub enum CraftFailureReason {
        Durability => "durability",
        RequiredQuality => "required-quality",
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CraftState {
    pub step: u32,
    pub progress: i32,
    pub quality: i32,
    pub durability: i32,
    pub cp: i32,
    pub condition: MaterialCondition,
    pub inner_quiet: i32,
    pub buffs: CraftBuffs,
    pub combo_from: Option<CraftActionId>,
    pub trained_perfection_available: bool,
    pub trained_perfection_active: bool,
    pub careful_observation_uses_left: i32,
    pub heart_and_soul_available: bool,
    pub heart_and_soul_active: bool,
    pub quick_innovation_available: bool,
    pub terminal: CraftTerminal,
    pub failure_reason: Option<CraftFailureReason>,
}

impl CraftState {
    pub fn initial(recipe: &RecipeProfile, crafter: &CrafterProfile) -> Self {
        Self {
            step: 1,
            progress: 0,
            quality: 0,
            durability: recipe.durability_max,
            cp: crafter.max_cp,
            condition: MaterialCondition::Normal,
            inner_quiet: 0,
            buffs: CraftBuffs::default(),
            combo_from: None,
            trained_perfection_available: true,
            trained_perfection_active: false,
            careful_observation_uses_left: if crafter.specialist { 3 } else { 0 },
            heart_and_soul_available: crafter.specialist,
            heart_and_soul_active: false,
            quick_innovation_available: crafter.specialist,
            terminal: CraftTerminal::None,
            failure_reason: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ActionDefinition {
    pub id: CraftActionId,
    pub category: ActionCategory,
    pub cp_cost: i32,
    pub durability_cost: i32,
    pub success_rate: f64,
    pub progress_potency: Option<i32>,
    pub quality_potency: Option<i32>,
    pub available_on_step: Option<u32>,
    pub requires_conditions: &'static [MaterialCondition],
    pub unavailable_with_waste_not: bool,
    pub no_step: bool,
    pub rerolls_condition: bool,
    pub specialist_only: bool,
}

string_enum! {
    #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
    pub enum IllegalActionReason {
        Terminal => "terminal",
        Specialist => "specialist",
        CarefulObservationExhausted => "careful-observation-exhausted",
        HeartAndSoulActive => "heart-and-soul-active",
        HeartAndSoulUnavailable => "heart-and-soul-unavailable",
        InnovationActive => "innovation-active",
        QuickInnovationUnavailable => "quick-innovation-unavailable",
        WrongStep => "wrong-step",
        Condition => "condition",
        WasteNotConflict => "waste-not-conflict",
        InnerQuietRequired => "inner-quiet-required",
        InnerQuietTenRequired => "inner-quiet-ten-required",
        ExpedienceRequired => "expedience-required",
        AlreadyUsed => "already-used",
        Cp => "cp",
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ActionPreview {
    pub action: ActionDefinition,
    pub legal: bool,
    pub reason: Option<IllegalActionReason>,
    pub cp_cost: i32,
    pub durability_cost: i32,
    pub success_rate: f64,
    pub progress_gain: i32,
    pub quality_gain: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ObservedActionOutcome {
    pub success: bool,
    pub next_condition: MaterialCondition,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExplanationCode {
    ProgressGained,
    QualityGained,
    ActionFailed,
    FinalAppraisalTriggered,
}

impl ExplanationCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProgressGained => "progress-gained",
            Self::QualityGained => "quality-gained",
            Self::ActionFailed => "action-failed",
            Self::FinalAppraisalTriggered => "final-appraisal-triggered",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransitionResult {
    pub next_state: CraftState,
    pub explanation_codes: Vec<ExplanationCode>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransitionError {
    IllegalAction {
        action: CraftActionId,
        reason: IllegalActionReason,
    },
}

impl fmt::Display for TransitionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::IllegalAction { action, reason } => {
                write!(formatter, "Illegal action {action}: {reason}")
            }
        }
    }
}

impl std::error::Error for TransitionError {}
