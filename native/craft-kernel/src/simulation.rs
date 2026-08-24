use crate::{
    ActionPreview, CraftState, EpisodeRandomStream, MATERIAL_CONDITION_COUNT, MaterialCondition,
    ObservedActionOutcome,
};

pub type ConditionWeights = [f64; MATERIAL_CONDITION_COUNT];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RandomDrawCursor {
    pub condition_draws: u64,
    pub success_draws: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SimulatedActionOutcome {
    pub observed: ObservedActionOutcome,
    pub cursor_before: RandomDrawCursor,
    pub cursor_after: RandomDrawCursor,
}

pub fn sample_condition(
    weights: &ConditionWeights,
    random: &mut EpisodeRandomStream,
    previous_condition: MaterialCondition,
) -> MaterialCondition {
    if previous_condition == MaterialCondition::GoodOmen {
        return MaterialCondition::Good;
    }
    if previous_condition == MaterialCondition::Robust {
        return MaterialCondition::Sturdy;
    }

    let total = weights
        .iter()
        .copied()
        .map(|weight| weight.max(0.0))
        .sum::<f64>();
    if total <= 0.0 {
        return MaterialCondition::Normal;
    }

    let mut cursor = random.next_condition() * total;
    for condition in MaterialCondition::ALL {
        cursor -= weights[condition.index()].max(0.0);
        if cursor <= 0.0 {
            return *condition;
        }
    }
    MaterialCondition::Normal
}

pub fn draw_simulated_action_outcome(
    preview: &ActionPreview,
    state: &CraftState,
    condition_weights: &ConditionWeights,
    random: &mut EpisodeRandomStream,
    cursor_before: RandomDrawCursor,
) -> SimulatedActionOutcome {
    debug_assert!(preview.legal);
    let is_no_step = preview.action.no_step;
    let rerolls_condition = preview.action.rerolls_condition;
    let (success, success_draws) = if is_no_step {
        (true, cursor_before.success_draws)
    } else {
        (
            random.next_success() < preview.success_rate,
            cursor_before.success_draws + 1,
        )
    };
    let (next_condition, condition_draws) = if is_no_step && !rerolls_condition {
        (state.condition, cursor_before.condition_draws)
    } else if matches!(
        state.condition,
        MaterialCondition::GoodOmen | MaterialCondition::Robust
    ) {
        (
            if state.condition == MaterialCondition::GoodOmen {
                MaterialCondition::Good
            } else {
                MaterialCondition::Sturdy
            },
            cursor_before.condition_draws,
        )
    } else {
        (
            sample_condition(condition_weights, random, state.condition),
            cursor_before.condition_draws + 1,
        )
    };

    SimulatedActionOutcome {
        observed: ObservedActionOutcome {
            success,
            next_condition,
        },
        cursor_before,
        cursor_after: RandomDrawCursor {
            condition_draws,
            success_draws,
        },
    }
}
