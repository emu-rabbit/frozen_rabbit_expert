use crate::types::{ActionCategory, ActionDefinition, CraftActionId, MaterialCondition};

const GOOD: &[MaterialCondition] = &[MaterialCondition::Good];
const NONE: &[MaterialCondition] = &[];

const fn action(
    id: CraftActionId,
    category: ActionCategory,
    cp_cost: i32,
    durability_cost: i32,
    success_rate: f64,
    progress_potency: Option<i32>,
    quality_potency: Option<i32>,
) -> ActionDefinition {
    ActionDefinition {
        id,
        category,
        cp_cost,
        durability_cost,
        success_rate,
        progress_potency,
        quality_potency,
        available_on_step: None,
        requires_conditions: NONE,
        unavailable_with_waste_not: false,
        no_step: false,
        rerolls_condition: false,
        specialist_only: false,
    }
}

pub const fn action_definition(id: CraftActionId) -> ActionDefinition {
    use ActionCategory::{Buff, Progress, Quality, Repair, Utility};
    use CraftActionId::*;

    match id {
        BasicSynthesis => action(id, Progress, 0, 10, 1.0, Some(120), None),
        RapidSynthesis => action(id, Progress, 0, 10, 0.5, Some(500), None),
        CarefulSynthesis => action(id, Progress, 7, 10, 1.0, Some(180), None),
        Groundwork => action(id, Progress, 18, 20, 1.0, Some(360), None),
        PrudentSynthesis => ActionDefinition {
            unavailable_with_waste_not: true,
            ..action(id, Progress, 18, 5, 1.0, Some(180), None)
        },
        IntensiveSynthesis => ActionDefinition {
            requires_conditions: GOOD,
            ..action(id, Progress, 6, 10, 1.0, Some(400), None)
        },
        MuscleMemory => ActionDefinition {
            available_on_step: Some(1),
            ..action(id, Progress, 6, 10, 1.0, Some(300), None)
        },
        BasicTouch => action(id, Quality, 18, 10, 1.0, None, Some(100)),
        HastyTouch => action(id, Quality, 0, 10, 0.6, None, Some(100)),
        StandardTouch => action(id, Quality, 32, 10, 1.0, None, Some(125)),
        AdvancedTouch => action(id, Quality, 46, 10, 1.0, None, Some(150)),
        PrudentTouch => ActionDefinition {
            unavailable_with_waste_not: true,
            ..action(id, Quality, 25, 5, 1.0, None, Some(100))
        },
        PreparatoryTouch => action(id, Quality, 40, 20, 1.0, None, Some(200)),
        PreciseTouch => ActionDefinition {
            requires_conditions: GOOD,
            ..action(id, Quality, 18, 10, 1.0, None, Some(150))
        },
        ByregotsBlessing => action(id, Quality, 24, 10, 1.0, None, Some(100)),
        TrainedFinesse => action(id, Quality, 32, 0, 1.0, None, Some(100)),
        RefinedTouch => action(id, Quality, 24, 10, 1.0, None, Some(100)),
        DaringTouch => action(id, Quality, 0, 10, 0.6, None, Some(150)),
        Reflect => ActionDefinition {
            available_on_step: Some(1),
            ..action(id, Quality, 6, 10, 1.0, None, Some(300))
        },
        DelicateSynthesis => action(id, Progress, 32, 10, 1.0, Some(150), Some(100)),
        TricksOfTheTrade => ActionDefinition {
            requires_conditions: GOOD,
            ..action(id, Utility, 0, 0, 1.0, None, None)
        },
        TrainedPerfection => action(id, Utility, 0, 0, 1.0, None, None),
        MastersMend => action(id, Repair, 88, 0, 1.0, None, None),
        ImmaculateMend => action(id, Repair, 112, 0, 1.0, None, None),
        WasteNot => action(id, Buff, 56, 0, 1.0, None, None),
        WasteNot2 => action(id, Buff, 98, 0, 1.0, None, None),
        Veneration => action(id, Buff, 18, 0, 1.0, None, None),
        Innovation => action(id, Buff, 18, 0, 1.0, None, None),
        GreatStrides => action(id, Buff, 32, 0, 1.0, None, None),
        Manipulation => action(id, Buff, 96, 0, 1.0, None, None),
        Observe => action(id, Utility, 7, 0, 1.0, None, None),
        FinalAppraisal => ActionDefinition {
            no_step: true,
            ..action(id, Utility, 1, 0, 1.0, None, None)
        },
        CarefulObservation => ActionDefinition {
            no_step: true,
            rerolls_condition: true,
            specialist_only: true,
            ..action(id, Utility, 0, 0, 1.0, None, None)
        },
        HeartAndSoul => ActionDefinition {
            no_step: true,
            specialist_only: true,
            ..action(id, Utility, 0, 0, 1.0, None, None)
        },
        QuickInnovation => ActionDefinition {
            no_step: true,
            specialist_only: true,
            ..action(id, Buff, 0, 0, 1.0, None, None)
        },
    }
}
