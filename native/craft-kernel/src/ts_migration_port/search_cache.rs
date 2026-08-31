//! Scoped memoization of pure, independently budgeted certificate queries.
//! Shared-budget inner searches are deliberately outside this cache.
use super::{ProgressCertificate, QualityCertificate};
use crate::{CraftState, CrafterProfile, RecipeProfile};
use std::cell::RefCell;
use std::collections::HashMap;

const CAPACITY: usize = 4096;

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
pub(super) enum Query {
    Progress(usize),
    Feasible(usize),
    Quality(i32, usize, usize),
}

#[derive(Clone)]
pub(super) enum Value {
    Progress(Option<ProgressCertificate>),
    Feasible(bool),
    Quality(Option<QualityCertificate>),
}

#[derive(Eq, Hash, PartialEq)]
struct Key {
    recipe: [u64; 9],
    crafter: [u64; 6],
    state: CraftState,
    query: Query,
}

impl Key {
    fn new(
        recipe: &RecipeProfile,
        crafter: &CrafterProfile,
        state: &CraftState,
        query: Query,
    ) -> Self {
        let mut state = state.clone();
        if matches!(query, Query::Progress(_) | Query::Feasible(_))
            && state.terminal == crate::CraftTerminal::None
            && state.progress < recipe.progress_required
        {
            // These queries contain only progress and recovery actions and
            // explicitly assume required quality before their progress tail.
            // IQ and quality-only buffs cannot affect their route or resource
            // certificate. Keep terminal/over-progress inputs unnormalized.
            state.quality = recipe.quality_max;
            state.inner_quiet = 0;
            state.buffs.innovation = 0;
            state.buffs.great_strides = 0;
        }
        Self {
            recipe: [
                recipe.recipe_level as u64,
                recipe.progress_required as u64,
                recipe.quality_max as u64,
                recipe.required_quality as u64,
                recipe.durability_max as u64,
                recipe.progress_divider.to_bits(),
                recipe.quality_divider.to_bits(),
                recipe.progress_modifier.to_bits(),
                recipe.quality_modifier.to_bits(),
            ],
            crafter: [
                crafter.level as u64,
                crafter.craftsmanship as u64,
                crafter.control as u64,
                crafter.max_cp as u64,
                crafter.cosmic_tool_good_bonus as u64,
                crafter.specialist as u64,
            ],
            state,
            query,
        }
    }
}

#[derive(Default)]
struct Cache {
    values: HashMap<Key, Value>,
    lookups: usize,
    hits: usize,
}

thread_local! {
    static ACTIVE: RefCell<Option<Cache>> = const { RefCell::new(None) };
}

/// Only an explicitly versioned portfolio recommendation opens this scope.
/// Nested scopes and unwinding restore their previous owner; no entries leak
/// into another recommendation, crafter, objective, or legacy policy call.
pub(crate) struct Scope {
    previous: Option<Cache>,
}

impl Scope {
    pub(crate) fn new() -> Self {
        Self {
            previous: ACTIVE.with(|cell| cell.replace(Some(Cache::default()))),
        }
    }
    pub(crate) fn stats(&self) -> (usize, usize) {
        ACTIVE.with(|cell| {
            cell.borrow()
                .as_ref()
                .map_or((0, 0), |cache| (cache.lookups, cache.hits))
        })
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        ACTIVE.with(|cell| {
            cell.replace(self.previous.take());
        });
    }
}

pub(super) fn get(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    query: Query,
    compute: impl FnOnce() -> Value,
) -> Value {
    let enabled = ACTIVE.with(|cell| cell.borrow().is_some());
    if !enabled {
        return compute();
    }
    let key = Key::new(recipe, crafter, state, query);
    let cached = ACTIVE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let cache = slot.as_mut().expect("scope owns cache");
        cache.lookups += 1;
        let value = cache.values.get(&key).cloned();
        if value.is_some() {
            cache.hits += 1;
        }
        value
    });
    if let Some(value) = cached {
        return value;
    }
    // Release RefCell before recursive certificate queries.
    let value = compute();
    ACTIVE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let cache = slot.as_mut().expect("scope remains active during query");
        if cache.values.len() < CAPACITY {
            cache.values.insert(key, value.clone());
        }
    });
    value
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scope_keys_nested_queries_and_saturation_preserve_values() {
        let recipe = RecipeProfile {
            canonical_recipe_id: 0,
            recipe_level: 746,
            progress_required: 10000,
            quality_max: 22500,
            required_quality: 0,
            durability_max: 60,
            progress_divider: 180.0,
            quality_divider: 180.0,
            progress_modifier: 100.0,
            quality_modifier: 100.0,
        };
        let crafter = CrafterProfile {
            level: 100,
            craftsmanship: 5408,
            control: 5237,
            max_cp: 749,
            cosmic_tool_good_bonus: true,
            specialist: true,
        };
        let state = CraftState::initial(&recipe, &crafter);
        let mut calls = 0;
        for _ in 0..2 {
            get(&recipe, &crafter, &state, Query::Feasible(8), || {
                calls += 1;
                Value::Feasible(false)
            });
        }
        assert_eq!(calls, 2);
        let scope = Scope::new();
        get(&recipe, &crafter, &state, Query::Feasible(8), || {
            Value::Feasible(false)
        });
        assert!(matches!(
            get(&recipe, &crafter, &state, Query::Feasible(8), || panic!(
                "cached false"
            )),
            Value::Feasible(false)
        ));
        assert_eq!(scope.stats(), (2, 1));
        {
            let nested = Scope::new();
            assert!(matches!(
                get(&recipe, &crafter, &state, Query::Feasible(8), || {
                    Value::Feasible(true)
                }),
                Value::Feasible(true)
            ));
            assert_eq!(nested.stats(), (1, 0));
        }
        assert!(matches!(
            get(&recipe, &crafter, &state, Query::Feasible(8), || panic!(
                "restored outer"
            )),
            Value::Feasible(false)
        ));
        let changed_recipe = RecipeProfile {
            required_quality: 22500,
            ..recipe
        };
        let changed_crafter = CrafterProfile {
            control: 5238,
            ..crafter
        };
        let changed_state = CraftState {
            cp: 100,
            ..state.clone()
        };
        for (r, c, s, q) in [
            (&changed_recipe, &crafter, &state, Query::Feasible(8)),
            (&recipe, &changed_crafter, &state, Query::Feasible(8)),
            (&recipe, &crafter, &changed_state, Query::Feasible(8)),
            (&recipe, &crafter, &state, Query::Feasible(7)),
        ] {
            assert!(matches!(
                get(r, c, s, q, || Value::Feasible(true)),
                Value::Feasible(true)
            ));
        }
        for i in 0..CAPACITY {
            let varied = CraftState {
                cp: i as i32,
                ..state.clone()
            };
            get(&recipe, &crafter, &varied, Query::Progress(8), || {
                Value::Progress(None)
            });
        }
        let uncached = CraftState {
            cp: 10000,
            ..state.clone()
        };
        assert!(matches!(
            get(&recipe, &crafter, &uncached, Query::Feasible(1), || {
                Value::Feasible(true)
            }),
            Value::Feasible(true)
        ));
        assert!(matches!(
            get(&recipe, &crafter, &uncached, Query::Feasible(1), || {
                Value::Feasible(false)
            }),
            Value::Feasible(false)
        ));
        assert_eq!(
            ACTIVE.with(|cell| cell.borrow().as_ref().unwrap().values.len()),
            CAPACITY
        );
        drop(scope);
        assert!(ACTIVE.with(|cell| cell.borrow().is_none()));

        // Verify the progress-only projection against the uncached search,
        // including both completion contracts and every observed condition.
        for required_quality in [0, 22500] {
            let r = RecipeProfile {
                required_quality,
                ..recipe
            };
            for &condition in crate::MaterialCondition::ALL {
                let mut s = CraftState::initial(&r, &crafter);
                s.step = 12;
                s.progress = 6500;
                s.cp = 160;
                s.durability = 25;
                s.condition = condition;
                s.buffs.manipulation = 3;
                let mut quality_variant = s.clone();
                quality_variant.quality = 20000;
                quality_variant.inner_quiet = 10;
                quality_variant.buffs.innovation = 4;
                quality_variant.buffs.great_strides = 3;
                assert_eq!(
                    super::super::find_progress_with_recovery_uncached(&r, &crafter, &s, 6),
                    super::super::find_progress_with_recovery_uncached(
                        &r,
                        &crafter,
                        &quality_variant,
                        6
                    )
                );
                assert_eq!(
                    super::super::has_progress_with_recovery_uncached(&r, &crafter, &s, 6),
                    super::super::has_progress_with_recovery_uncached(
                        &r,
                        &crafter,
                        &quality_variant,
                        6
                    )
                );
            }
        }
    }
}
