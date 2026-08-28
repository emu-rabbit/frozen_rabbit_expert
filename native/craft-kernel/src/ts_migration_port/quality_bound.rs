//! Sound optimistic quality bound for the existing bounded burst action set.
use super::*;
use std::cell::Cell;

thread_local! { static ACTIVE: Cell<Option<(usize, usize, usize, usize, bool)>> = const { Cell::new(None) }; }

pub(crate) struct Scope(Option<(usize, usize, usize, usize, bool)>);
impl Scope {
    pub(crate) fn new() -> Self {
        Self(ACTIVE.with(|s| s.replace(Some((0, 0, 0, 0, true)))))
    }
    #[cfg(test)]
    pub(crate) fn quality_only() -> Self {
        Self(ACTIVE.with(|s| s.replace(Some((0, 0, 0, 0, false)))))
    }
    pub(crate) fn stats(&self) -> (usize, usize, usize, usize) {
        ACTIVE.with(|s| {
            let (a, b, c, d, _) = s.get().unwrap_or_default();
            (a, b, c, d)
        })
    }
}
impl Drop for Scope {
    fn drop(&mut self) {
        ACTIVE.with(|s| s.set(self.0));
    }
}

fn upper_bound(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: usize,
) -> i64 {
    // Give every quality action Innovation and Great Strides for free. IQ may
    // grow by at most two per action in this action set; ignore its resets.
    // Ignore CP, durability, setup turns and condition eligibility.
    // Burst expansion stops after Byregot, so at most one of its gains fits.
    let mut optimistic = state.clone();
    optimistic.buffs.innovation = 1;
    optimistic.buffs.great_strides = 1;
    let mut ordinary = i64::from(state.quality);
    let mut extra_byregot = 0;
    for index in 0..actions {
        optimistic.inner_quiet = (state.inner_quiet + 2 * index.min(5) as i32).min(10);
        optimistic.condition = if index == 0 {
            state.condition
        } else if index == 1 && state.condition == MaterialCondition::GoodOmen {
            MaterialCondition::Good
        } else {
            MaterialCondition::Normal
        };
        let touch = QUALITY_BURST_ACTIONS
            .iter()
            .copied()
            .filter(|a| *a != CraftActionId::ByregotsBlessing)
            .map(|a| i64::from(preview_action(recipe, crafter, &optimistic, a).quality_gain))
            .max()
            .unwrap_or(0);
        let blessing = i64::from(
            preview_action(
                recipe,
                crafter,
                &optimistic,
                CraftActionId::ByregotsBlessing,
            )
            .quality_gain,
        );
        ordinary = ordinary.saturating_add(touch);
        extra_byregot = extra_byregot.max(blessing - touch);
    }
    ordinary.saturating_add(extra_byregot)
}

pub(super) fn cannot_reach(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    floor: i32,
    actions: usize,
) -> bool {
    ACTIVE.with(|slot| {
        let Some((checks, hits, pc, ph, enabled)) = slot.get() else {
            return false;
        };
        let pruned = upper_bound(recipe, crafter, state, actions) < i64::from(floor);
        slot.set(Some((
            checks + 1,
            hits + usize::from(pruned),
            pc,
            ph,
            enabled,
        )));
        pruned
    })
}

pub(super) fn cannot_finish_progress(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    actions: usize,
) -> bool {
    ACTIVE.with(|slot| {
        let Some((qc, qh, checks, hits, true)) = slot.get() else {
            return false;
        };
        // This search contains only synthesis actions: no new progress buffs.
        // Give full durability, free CP and repeated condition-only synthesis.
        // Existing Veneration ticks normally; Muscle Memory is consumed once.
        let strongest = GUARANTEED_PROGRESS_ACTIONS
            .iter()
            .copied()
            .max_by_key(|a| action_definition(*a).progress_potency.unwrap_or(0))
            .unwrap();
        let mut total = i64::from(state.progress);
        for index in 0..actions {
            if total >= i64::from(recipe.progress_required) {
                break;
            }
            let mut optimistic = state.clone();
            optimistic.progress = 0;
            optimistic.quality = recipe.quality_max;
            optimistic.cp = crafter.max_cp;
            optimistic.durability = recipe.durability_max;
            optimistic.trained_perfection_active = true;
            optimistic.heart_and_soul_active = true;
            optimistic.condition = if index == 0 {
                state.condition
            } else {
                MaterialCondition::Normal
            };
            optimistic.buffs.veneration = state
                .buffs
                .veneration
                .saturating_sub(index.min(i32::MAX as usize) as i32)
                .max(0);
            optimistic.buffs.muscle_memory = if index == 0 {
                state.buffs.muscle_memory
            } else {
                0
            };
            total = total.saturating_add(i64::from(
                preview_action(recipe, crafter, &optimistic, strongest).progress_gain,
            ));
        }
        let pruned = total < i64::from(recipe.progress_required);
        slot.set(Some((qc, qh, checks + 1, hits + usize::from(pruned), true)));
        pruned
    })
}
