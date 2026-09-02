use super::*;

const DECLARED_CONDITIONS: [MaterialCondition; MATERIAL_CONDITION_COUNT] = [
    MaterialCondition::Normal,
    MaterialCondition::Good,
    MaterialCondition::GoodOmen,
    MaterialCondition::Centered,
    MaterialCondition::Sturdy,
    MaterialCondition::Pliant,
    MaterialCondition::Malleable,
    MaterialCondition::Primed,
    MaterialCondition::Robust,
];

pub(super) fn classify(preview: ActionPreview) -> Option<ConditionWork> {
    if preview.progress_gain > 0 && preview.quality_gain > 0 {
        return Some(ConditionWork::Hybrid);
    }
    if preview.progress_gain > 0 {
        return Some(if preview.success_rate < 1.0 {
            ConditionWork::RiskyProgress
        } else {
            ConditionWork::ReliableProgress
        });
    }
    if preview.quality_gain > 0 {
        return Some(if preview.success_rate < 1.0 {
            ConditionWork::RiskyQuality
        } else {
            ConditionWork::ReliableQuality
        });
    }
    match preview.action.id {
        CraftActionId::Veneration | CraftActionId::MuscleMemory | CraftActionId::FinalAppraisal => {
            Some(ConditionWork::ProgressSetup)
        }
        CraftActionId::Innovation
        | CraftActionId::QuickInnovation
        | CraftActionId::GreatStrides => Some(ConditionWork::QualitySetup),
        CraftActionId::TricksOfTheTrade
        | CraftActionId::MastersMend
        | CraftActionId::ImmaculateMend
        | CraftActionId::WasteNot
        | CraftActionId::WasteNot2
        | CraftActionId::Manipulation
        | CraftActionId::TrainedPerfection => Some(ConditionWork::Resource),
        _ => None,
    }
}

fn declared(mask: Option<u16>, condition: MaterialCondition) -> bool {
    mask.is_some_and(|value| value & (1_u16 << condition.index()) != 0)
}

fn positive_delta(after: i32, before: i32) -> f64 {
    f64::from((after - before).max(0))
}

/// Measure only the mechanics gained by executing this action under `condition`
/// instead of Normal. Every component is normalized by the remaining craft or
/// resource pool, so the value describes useful work rather than a color name.
fn advantage(input: Input<'_>, action: CraftActionId, condition: MaterialCondition) -> f64 {
    if condition == MaterialCondition::Normal {
        return 0.0;
    }
    let mut colored_state = input.state.clone();
    colored_state.condition = condition;
    let colored = preview_action(input.recipe, input.crafter, &colored_state, action);
    if !colored.legal {
        return 0.0;
    }

    let mut normal_state = input.state.clone();
    normal_state.condition = MaterialCondition::Normal;
    let normal = preview_action(input.recipe, input.crafter, &normal_state, action);
    let normal_progress = normal
        .legal
        .then_some(f64::from(normal.progress_gain) * normal.success_rate)
        .unwrap_or(0.0);
    let normal_quality = normal
        .legal
        .then_some(f64::from(normal.quality_gain) * normal.success_rate)
        .unwrap_or(0.0);
    let progress_gap = f64::from((input.recipe.progress_required - input.state.progress).max(1));
    let quality_gap = f64::from((input.recipe.quality_max - input.state.quality).max(1));
    let progress = (f64::from(colored.progress_gain) * colored.success_rate - normal_progress)
        .max(0.0)
        / progress_gap;
    let quality = (f64::from(colored.quality_gain) * colored.success_rate - normal_quality)
        .max(0.0)
        / quality_gap;
    let cp_saving = if normal.legal {
        f64::from((normal.cp_cost - colored.cp_cost).max(0))
            / f64::from(input.crafter.max_cp.max(1))
    } else {
        0.0
    };
    let durability_saving = if normal.legal {
        f64::from((normal.durability_cost - colored.durability_cost).max(0))
            / f64::from(input.recipe.durability_max.max(1))
    } else {
        0.0
    };

    let colored_after = branch_state(input.recipe, input.crafter, &colored_state, action, true);
    let normal_after = normal
        .legal
        .then(|| branch_state(input.recipe, input.crafter, &normal_state, action, true))
        .flatten();
    let mut state_gain = 0.0;
    if let Some(after) = colored_after {
        let ordinary_cp_gain = normal_after
            .as_ref()
            .map_or(0, |state| (state.cp - normal_state.cp).max(0));
        let ordinary_durability_gain = normal_after.as_ref().map_or(0, |state| {
            (state.durability - normal_state.durability).max(0)
        });
        let ordinary_iq = normal_after
            .as_ref()
            .map_or(normal_state.inner_quiet, |state| state.inner_quiet);
        state_gain += positive_delta((after.cp - colored_state.cp).max(0), ordinary_cp_gain)
            / f64::from(input.crafter.max_cp.max(1));
        state_gain += positive_delta(
            (after.durability - colored_state.durability).max(0),
            ordinary_durability_gain,
        ) / f64::from(input.recipe.durability_max.max(1));
        state_gain += positive_delta(after.inner_quiet, ordinary_iq) / 10.0;

        let ordinary_buffs = normal_after
            .as_ref()
            .map_or(&normal_state.buffs, |state| &state.buffs);
        let extra_buff_turns = positive_delta(after.buffs.waste_not, ordinary_buffs.waste_not)
            + positive_delta(after.buffs.veneration, ordinary_buffs.veneration)
            + positive_delta(after.buffs.great_strides, ordinary_buffs.great_strides)
            + positive_delta(after.buffs.innovation, ordinary_buffs.innovation)
            + positive_delta(after.buffs.final_appraisal, ordinary_buffs.final_appraisal)
            + positive_delta(after.buffs.manipulation, ordinary_buffs.manipulation)
            + positive_delta(after.buffs.muscle_memory, ordinary_buffs.muscle_memory)
            + positive_delta(after.buffs.expedience, ordinary_buffs.expedience);
        let remaining_actions = input
            .context
            .action_limit
            .saturating_sub(input.context.action_uses)
            .max(1);
        state_gain += extra_buff_turns / f64::from(remaining_actions);
    }

    progress + quality + cp_saving + durability_saving + state_gain
}

pub(super) fn assignment(input: Input<'_>, preview: ActionPreview) -> ConditionAssignmentEvidence {
    let capture = advantage(input, preview.action.id, input.state.condition);
    let mut reserved_condition = None;
    let mut reservation = 0.0_f64;
    for condition in DECLARED_CONDITIONS {
        if condition == MaterialCondition::Normal
            || condition == input.state.condition
            || !declared(input.random_condition_mask, condition)
        {
            continue;
        }
        let value = advantage(input, preview.action.id, condition);
        if value > reservation {
            reservation = value;
            reserved_condition = Some(condition);
        }
    }
    ConditionAssignmentEvidence {
        work: classify(preview),
        current_condition: input.state.condition,
        capture,
        reservation,
        reserved_condition,
        alignment: capture - reservation,
    }
}
