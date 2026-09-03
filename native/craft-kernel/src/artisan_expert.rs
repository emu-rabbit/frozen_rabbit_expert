// Derived from PunishXIV/Artisan ExpertSolver.cs at commit
// 882202ce04fcd4fe405812ea24d78b660d8ff64e.
//
// BSD 3-Clause License
//
// Copyright (c) 2023, Puni.sh
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

//! Fixed upstream-default Artisan Expert reference policy.
//!
//! This module translates Artisan's stepwise decision tree onto this kernel's
//! mechanics so all overnight arms consume the same state and random tape. It
//! deliberately excludes Artisan's game automation and its configurable
//! per-recipe Cosmic duty actions. The pinned default profile uses neither
//! Material Miracle nor Stellar Steady Hand, which this kernel does not model.

use crate::actions::action_definition;
use crate::generic_solver::{
    GenericDecision, GenericObjective, PlannerContext, PlannerOption, PlannerPersona,
};
use crate::transition::preview_action;
use crate::types::{
    ActionCategory, CraftActionId, CraftState, CrafterProfile, MaterialCondition, RecipeProfile,
};
use crate::{
    CrafterFormulaInput, RecipeFormulaInput, calculate_base_progress, calculate_base_quality,
};

pub const ARTISAN_EXPERT_REFERENCE_POLICY_VERSION: &str =
    "artisan-expert-default@882202ce04fcd4fe405812ea24d78b660d8ff64e";

const MAX_IQ_STACKS: i32 = 10;
const IMMACULATE_MISSING_DURABILITY: i32 = 45;
const MASTERS_MEND_DURABILITY: i32 = 30;

#[derive(Clone, Copy)]
struct Input<'a> {
    recipe: &'a RecipeProfile,
    crafter: &'a CrafterProfile,
    state: &'a CraftState,
    objective: GenericObjective,
    context: &'a PlannerContext,
    random_condition_mask: Option<u16>,
}

#[derive(Clone, Copy)]
struct Choice {
    action: CraftActionId,
    emergency: bool,
}

pub(crate) fn recommend(
    recipe: &RecipeProfile,
    crafter: &CrafterProfile,
    state: &CraftState,
    objective: GenericObjective,
    context: &PlannerContext,
    random_condition_mask: Option<u16>,
) -> Option<GenericDecision> {
    let input = Input {
        recipe,
        crafter,
        state,
        objective,
        context,
        random_condition_mask,
    };
    let already_emergency = context.active_option == PlannerOption::CertifiedSuffix;
    let choice = solve_next(input, already_emergency)?;
    let option = if already_emergency || choice.emergency {
        PlannerOption::CertifiedSuffix
    } else {
        match action_definition(choice.action).category {
            ActionCategory::Progress => PlannerOption::ProgressWindow,
            ActionCategory::Quality => PlannerOption::QualityCycle,
            ActionCategory::Repair => PlannerOption::Recovery,
            ActionCategory::Buff | ActionCategory::Utility => PlannerOption::ResourceRecovery,
        }
    };
    Some(GenericDecision {
        route: None,
        action: choice.action,
        option,
        persona: PlannerPersona::LegacyContinuation,
    })
}

fn pick(action: CraftActionId) -> Option<Choice> {
    Some(Choice {
        action,
        emergency: false,
    })
}

fn emergency(action: CraftActionId) -> Option<Choice> {
    Some(Choice {
        action,
        emergency: true,
    })
}

fn solve_next(input: Input<'_>, already_emergency: bool) -> Option<Choice> {
    let remaining_progress = input.recipe.progress_required - input.state.progress;
    let estimated_basic = base_progress(input) * 120 / 100;
    let estimated_careful = base_progress(input) * 180 / 100;
    let reserved_cp_for_progress = if remaining_progress <= estimated_basic {
        0
    } else {
        action_definition(CraftActionId::CarefulSynthesis).cp_cost
    };
    let progress_deficit = remaining_progress - estimated_careful;
    let cp_available_for_quality = input.state.cp - reserved_cp_for_progress;
    let quality_target = if input.recipe.required_quality > 0 {
        input.recipe.required_quality
    } else {
        input.recipe.quality_max
    };

    if input.state.step == 1 {
        if input.state.quick_innovation_available && legal(input, CraftActionId::QuickInnovation) {
            return pick(CraftActionId::QuickInnovation);
        }
        return pick(CraftActionId::Reflect);
    }

    if input.state.buffs.muscle_memory > 0 {
        return pick(safe_action(input, solve_opener_muscle_memory(input)?));
    }

    if let Some(action) = solve_finish_quality(input, cp_available_for_quality, quality_target) {
        return pick(action);
    }

    let quality_minimum = if input.objective.quality_milestone_count > 0 {
        input.objective.quality_milestones[0]
    } else {
        0
    };
    let is_mid = input.state.quality < quality_target
        && (input.state.quality < quality_minimum
            || cp_available_for_quality
                >= action_definition(CraftActionId::ByregotsBlessing).cp_cost);
    if is_mid {
        let choice = solve_mid(
            input,
            progress_deficit,
            cp_available_for_quality,
            already_emergency,
        )?;
        if cp_available_for_quality >= cp_cost(input, choice.action) {
            return Some(choice);
        }
        if let Some(action) = emergency_restore_cp(input, true, already_emergency) {
            return pick(action);
        }
    }

    pick(solve_finish_progress(input, quality_target, is_mid)?)
}

fn solve_opener_muscle_memory(input: Input<'_>) -> Option<CraftActionId> {
    let last_chance = input.state.buffs.muscle_memory == 1;
    let rapid_durability = durability_cost(input, CraftActionId::RapidSynthesis);
    if input.state.condition == MaterialCondition::Pliant && !last_chance {
        if input.state.buffs.muscle_memory > 2
            && input.state.buffs.manipulation == 0
            && legal(input, CraftActionId::Manipulation)
        {
            return Some(CraftActionId::Manipulation);
        }
        if input.state.buffs.muscle_memory > 1
            && input.state.buffs.veneration == 0
            && legal(input, CraftActionId::Veneration)
        {
            return Some(CraftActionId::Veneration);
        }
    }
    if input.state.condition == MaterialCondition::Primed && !last_chance {
        if input.state.buffs.muscle_memory > 1
            && input.state.buffs.veneration == 0
            && legal(input, CraftActionId::Veneration)
        {
            return Some(CraftActionId::Veneration);
        }
    }
    if input.state.buffs.manipulation == 0 && legal(input, CraftActionId::Manipulation) {
        if input.state.buffs.muscle_memory > 2
            && input.state.durability <= rapid_durability + 5
            && !last_chance
        {
            return Some(CraftActionId::Manipulation);
        }
        if input.state.durability <= rapid_durability {
            return Some(CraftActionId::Manipulation);
        }
    }
    if input.state.condition == MaterialCondition::Centered
        && input.state.durability > rapid_durability
        && legal(input, CraftActionId::RapidSynthesis)
    {
        return Some(CraftActionId::RapidSynthesis);
    }
    if matches!(
        input.state.condition,
        MaterialCondition::Sturdy | MaterialCondition::Robust
    ) && input.state.durability > rapid_durability
        && last_chance
    {
        return opener_progress_action(input, true);
    }
    if input.state.condition == MaterialCondition::Malleable
        && input.state.durability > rapid_durability
    {
        return opener_progress_action(input, last_chance);
    }
    if input.state.condition == MaterialCondition::Good
        && durability_cost(input, CraftActionId::IntensiveSynthesis) < input.state.durability
        && legal(input, CraftActionId::IntensiveSynthesis)
    {
        return Some(CraftActionId::IntensiveSynthesis);
    }
    if input.state.durability <= rapid_durability
        && input.state.buffs.manipulation == 0
        && legal(input, CraftActionId::Manipulation)
    {
        return Some(CraftActionId::Manipulation);
    }
    if input.state.buffs.muscle_memory > 1
        && input.state.buffs.veneration == 0
        && legal(input, CraftActionId::Veneration)
    {
        return Some(CraftActionId::Veneration);
    }
    if matches!(
        input.state.condition,
        MaterialCondition::Sturdy | MaterialCondition::Robust
    ) && input.state.durability > rapid_durability
        && legal(input, CraftActionId::RapidSynthesis)
    {
        return opener_progress_action(input, last_chance);
    }
    if input.state.durability <= rapid_durability && legal(input, CraftActionId::Observe) {
        return Some(CraftActionId::Observe);
    }
    opener_progress_action(input, last_chance)
}

fn opener_progress_action(input: Input<'_>, intensive: bool) -> Option<CraftActionId> {
    if !intensive {
        return Some(CraftActionId::RapidSynthesis);
    }
    if legal(input, CraftActionId::IntensiveSynthesis) {
        Some(CraftActionId::IntensiveSynthesis)
    } else if input.state.heart_and_soul_available && legal(input, CraftActionId::HeartAndSoul) {
        Some(CraftActionId::HeartAndSoul)
    } else {
        Some(CraftActionId::RapidSynthesis)
    }
}

fn solve_mid(
    input: Input<'_>,
    progress_deficit: i32,
    available_cp: i32,
    already_emergency: bool,
) -> Option<Choice> {
    let reserved_cp = action_definition(CraftActionId::ByregotsBlessing).cp_cost
        + action_definition(CraftActionId::GreatStrides).cp_cost
        + if input.state.buffs.innovation > 2 || input.state.quick_innovation_available {
            0
        } else {
            action_definition(CraftActionId::Innovation).cp_cost
        };
    if input.state.inner_quiet < MAX_IQ_STACKS || progress_deficit > 0 {
        pick(solve_mid_pre_quality(
            input,
            progress_deficit,
            available_cp,
        )?)
    } else if input.state.buffs.great_strides == 0 && input.state.buffs.innovation == 0 {
        pick(solve_mid_start_quality(
            input,
            progress_deficit,
            available_cp,
            reserved_cp,
        )?)
    } else {
        solve_mid_quality(input, available_cp, reserved_cp, already_emergency)
    }
}

fn solve_mid_pre_quality(
    input: Input<'_>,
    progress_deficit: i32,
    available_cp: i32,
) -> Option<CraftActionId> {
    let durability_threshold = if input.recipe.durability_max <= 35 {
        15
    } else {
        25
    };
    let can_be_pliant = declares(input, MaterialCondition::Pliant);
    let veneration_active = progress_deficit > 0 && input.state.buffs.veneration > 0;
    let allow_observe_on_low_durability = !veneration_active;
    let allow_precise = !allow_observe_on_low_durability
        || input.state.buffs.manipulation > 0
        || input.state.durability > durability_threshold;

    if let Some(action) = solve_mid_durability_pre_quality(
        input,
        available_cp,
        allow_observe_on_low_durability,
        progress_deficit > 0,
        can_be_pliant,
    ) {
        return Some(action);
    }
    if progress_deficit > 0 {
        if let Some(action) = solve_mid_high_priority_progress(input, false, progress_deficit) {
            return Some(safe_action(input, action));
        }
    }
    if input.state.inner_quiet < MAX_IQ_STACKS {
        if let Some(action) = solve_mid_high_priority_iq(input, allow_precise) {
            return Some(action);
        }
    }
    if input.state.condition == MaterialCondition::Good
        && legal(input, CraftActionId::TricksOfTheTrade)
    {
        return Some(CraftActionId::TricksOfTheTrade);
    }
    if input.state.buffs.innovation == 0 && legal(input, CraftActionId::Innovation) {
        return Some(CraftActionId::Innovation);
    }
    if input.state.inner_quiet < MAX_IQ_STACKS && !veneration_active {
        if input.state.buffs.waste_not == 0
            && input.state.condition != MaterialCondition::Pliant
            && input.state.durability
                + if input.state.buffs.manipulation > 0 {
                    5
                } else {
                    0
                }
                > durability_cost(input, CraftActionId::AdvancedTouch)
            && legal(input, CraftActionId::Observe)
        {
            return Some(CraftActionId::Observe);
        }
        if input.state.durability > durability_cost(input, CraftActionId::PrudentTouch)
            && legal(input, CraftActionId::PrudentTouch)
        {
            return Some(CraftActionId::PrudentTouch);
        }
    } else {
        if input.state.buffs.veneration == 0
            && progress_deficit > progress_gain(input, CraftActionId::RapidSynthesis)
            && input.state.durability + 5 * input.state.buffs.manipulation > 20
            && legal(input, CraftActionId::Veneration)
        {
            return Some(CraftActionId::Veneration);
        }
        if progress_deficit <= progress_gain(input, CraftActionId::PrudentSynthesis)
            && input.state.durability > durability_cost(input, CraftActionId::PrudentSynthesis)
            && legal(input, CraftActionId::PrudentSynthesis)
        {
            return Some(safe_action(input, CraftActionId::PrudentSynthesis));
        }
        if input.state.durability > durability_cost(input, CraftActionId::RapidSynthesis)
            && legal(input, CraftActionId::RapidSynthesis)
        {
            return Some(safe_action(input, CraftActionId::RapidSynthesis));
        }
    }
    Some(CraftActionId::Observe)
}

fn solve_mid_start_quality(
    input: Input<'_>,
    progress_deficit: i32,
    available_cp: i32,
    reserved_cp: i32,
) -> Option<CraftActionId> {
    if input.state.condition == MaterialCondition::Good {
        if progress_deficit > 0
            && input.state.durability > durability_cost(input, CraftActionId::IntensiveSynthesis)
            && legal(input, CraftActionId::IntensiveSynthesis)
        {
            return Some(CraftActionId::IntensiveSynthesis);
        }
        if legal(input, CraftActionId::TricksOfTheTrade) {
            return Some(CraftActionId::TricksOfTheTrade);
        }
    }
    if let Some(action) = solve_mid_durability_start_quality(input, available_cp) {
        return Some(action);
    }
    if progress_deficit > 0 {
        if let Some(action) = solve_mid_high_priority_progress(input, true, progress_deficit) {
            return Some(safe_action(input, action));
        }
    }
    if input.state.condition == MaterialCondition::GoodOmen
        && progress_deficit > progress_gain(input, CraftActionId::IntensiveSynthesis)
        && legal(input, CraftActionId::Veneration)
    {
        return Some(CraftActionId::Veneration);
    }

    let free_cp = available_cp - action_definition(CraftActionId::ByregotsBlessing).cp_cost;
    let cp_to_spend_on_quality = available_cp - reserved_cp;
    if input.state.trained_perfection_active {
        if cp_to_spend_on_quality
            >= cp_cost(input, CraftActionId::GreatStrides)
                + action_definition(CraftActionId::Innovation).cp_cost
                + action_definition(CraftActionId::PreparatoryTouch).cp_cost
            && legal(input, CraftActionId::GreatStrides)
        {
            return Some(CraftActionId::GreatStrides);
        }
        let action = if input.state.condition == MaterialCondition::Good {
            CraftActionId::PreciseTouch
        } else {
            CraftActionId::PreparatoryTouch
        };
        if cp_to_spend_on_quality >= cp_cost(input, action) && legal(input, action) {
            return Some(action);
        }
    }
    if input.state.trained_perfection_available && legal(input, CraftActionId::TrainedPerfection) {
        return Some(CraftActionId::TrainedPerfection);
    }

    let effective_durability = input.state.durability + input.state.buffs.manipulation * 5;
    let repair_without_durability_cp = action_definition(CraftActionId::MastersMend).cp_cost
        + action_definition(CraftActionId::Innovation).cp_cost
        + action_definition(CraftActionId::TrainedFinesse).cp_cost * 4;
    let can_be_pliant = declares(input, MaterialCondition::Pliant);
    if effective_durability <= 10
        && cp_to_spend_on_quality < repair_without_durability_cp
        && legal(input, CraftActionId::ByregotsBlessing)
    {
        if input.state.condition != MaterialCondition::Pliant
            && can_be_pliant
            && free_cp
                >= action_definition(CraftActionId::MastersMend).cp_cost / 2
                    + action_definition(CraftActionId::Observe).cp_cost
            && legal(input, CraftActionId::Observe)
        {
            return Some(CraftActionId::Observe);
        }
        if durability_cost(input, CraftActionId::ByregotsBlessing) < input.state.durability {
            return Some(CraftActionId::ByregotsBlessing);
        }
        if free_cp >= cp_cost(input, CraftActionId::Observe) && legal(input, CraftActionId::Observe)
        {
            return Some(CraftActionId::Observe);
        }
        if input.state.careful_observation_uses_left > 0
            && legal(input, CraftActionId::CarefulObservation)
        {
            return Some(CraftActionId::CarefulObservation);
        }
        return Some(CraftActionId::ByregotsBlessing);
    }

    if input.state.quick_innovation_available
        && free_cp
            < cp_cost(input, CraftActionId::Innovation)
                + action_definition(CraftActionId::GreatStrides).cp_cost
        && legal(input, CraftActionId::GreatStrides)
    {
        return Some(CraftActionId::GreatStrides);
    }
    let half_combo_cp = action_definition(CraftActionId::Innovation).cp_cost
        + action_definition(CraftActionId::Observe).cp_cost
        + action_definition(CraftActionId::AdvancedTouch).cp_cost;
    if input.state.condition != MaterialCondition::Primed
        && (input.state.condition == MaterialCondition::Pliant || effective_durability > 20)
        && free_cp >= cp_cost(input, CraftActionId::GreatStrides) + half_combo_cp
        && legal(input, CraftActionId::GreatStrides)
    {
        return Some(CraftActionId::GreatStrides);
    }
    Some(CraftActionId::Innovation)
}

fn solve_mid_quality(
    input: Input<'_>,
    available_cp: i32,
    reserved_cp: i32,
    already_emergency: bool,
) -> Option<Choice> {
    let free_cp = available_cp - reserved_cp;
    let effective_durability = input.state.durability + input.state.buffs.manipulation * 5;
    if input.state.buffs.innovation == 0 {
        if input.state.condition == MaterialCondition::Pliant {
            if let Some(action) = solve_mid_durability_quality_pliant(input, free_cp) {
                return pick(action);
            }
        }
        if input.state.condition == MaterialCondition::Good
            && can_use_safely(input, CraftActionId::PreciseTouch, free_cp)
            && legal(input, CraftActionId::PreciseTouch)
        {
            return pick(CraftActionId::PreciseTouch);
        }
        if input.context.last_action == Some(CraftActionId::Observe)
            && can_use_safely(input, CraftActionId::AdvancedTouch, free_cp)
            && legal(input, CraftActionId::AdvancedTouch)
        {
            return pick(CraftActionId::AdvancedTouch);
        }
        if input.state.buffs.great_strides == 1 && !already_emergency {
            if input.state.trained_perfection_active
                && can_use_safely(input, CraftActionId::PreparatoryTouch, free_cp)
                && legal(input, CraftActionId::PreparatoryTouch)
            {
                return pick(CraftActionId::PreparatoryTouch);
            }
            if input.state.condition == MaterialCondition::Centered
                && can_use_safely(input, CraftActionId::HastyTouch, free_cp)
                && legal(input, CraftActionId::HastyTouch)
            {
                return pick(CraftActionId::HastyTouch);
            }
            if input.state.condition == MaterialCondition::Pliant
                && can_use_safely(input, CraftActionId::TrainedFinesse, free_cp)
                && legal(input, CraftActionId::TrainedFinesse)
            {
                return pick(CraftActionId::TrainedFinesse);
            }
            if can_use_safely(input, CraftActionId::PrudentTouch, free_cp)
                && legal(input, CraftActionId::PrudentTouch)
            {
                return pick(CraftActionId::PrudentTouch);
            }
            if free_cp >= cp_cost(input, CraftActionId::TrainedFinesse)
                && legal(input, CraftActionId::TrainedFinesse)
            {
                return pick(CraftActionId::TrainedFinesse);
            }
        }
        if available_cp - cp_cost(input, CraftActionId::Innovation)
            >= action_definition(CraftActionId::ByregotsBlessing).cp_cost
                + action_definition(CraftActionId::GreatStrides).cp_cost
        {
            return pick(CraftActionId::Innovation);
        }
    }

    if input.state.condition == MaterialCondition::Good
        && can_use_safely(input, CraftActionId::PreciseTouch, free_cp)
        && legal(input, CraftActionId::PreciseTouch)
    {
        return pick(CraftActionId::PreciseTouch);
    }
    if (input.state.condition == MaterialCondition::Sturdy
        || input.state.condition == MaterialCondition::Robust && input.state.buffs.innovation == 1)
        && input.context.last_action != Some(CraftActionId::Observe)
        && can_use_safely(input, CraftActionId::PreparatoryTouch, free_cp)
        && legal(input, CraftActionId::PreparatoryTouch)
    {
        return pick(CraftActionId::PreparatoryTouch);
    }
    if input.state.condition == MaterialCondition::Pliant && input.state.buffs.great_strides != 1 {
        if let Some(action) = solve_mid_durability_quality_pliant(input, free_cp) {
            return pick(action);
        }
    }
    if input.state.condition == MaterialCondition::GoodOmen {
        if input.state.trained_perfection_active
            && input.state.buffs.great_strides > 1
            && input.state.buffs.innovation > 1
            && free_cp
                >= cp_cost(input, CraftActionId::Observe)
                    + action_definition(CraftActionId::PreciseTouch).cp_cost
            && legal(input, CraftActionId::Observe)
        {
            return pick(CraftActionId::Observe);
        }
        if input.state.buffs.great_strides == 0 && input.state.buffs.innovation > 1 {
            let next_durability = input.state.durability
                + if input.state.buffs.manipulation > 0 {
                    5
                } else {
                    0
                };
            if next_durability > 10
                && effective_durability > 20
                && free_cp
                    >= action_definition(CraftActionId::GreatStrides).cp_cost
                        + action_definition(CraftActionId::PreciseTouch).cp_cost
                && legal(input, CraftActionId::GreatStrides)
            {
                return pick(CraftActionId::GreatStrides);
            }
        }
    }
    if input.state.trained_perfection_active
        && can_use_safely(input, CraftActionId::PreparatoryTouch, free_cp)
        && legal(input, CraftActionId::PreparatoryTouch)
    {
        return pick(CraftActionId::PreparatoryTouch);
    }
    if input.context.last_action == Some(CraftActionId::Observe)
        && can_use_safely(input, CraftActionId::AdvancedTouch, free_cp)
        && legal(input, CraftActionId::AdvancedTouch)
    {
        return pick(CraftActionId::AdvancedTouch);
    }
    if input.state.buffs.innovation > 1 && input.state.buffs.great_strides > 1 {
        let next_durability = input.state.durability
            + if input.state.buffs.manipulation > 0 {
                5
            } else {
                0
            };
        if next_durability > 10
            && effective_durability > 20
            && free_cp
                >= cp_cost(input, CraftActionId::Observe)
                    + action_definition(CraftActionId::AdvancedTouch).cp_cost
            && legal(input, CraftActionId::Observe)
        {
            return pick(CraftActionId::Observe);
        }
    }
    if can_use_safely(input, CraftActionId::PrudentTouch, free_cp)
        && legal(input, CraftActionId::PrudentTouch)
    {
        return pick(CraftActionId::PrudentTouch);
    }
    if free_cp >= cp_cost(input, CraftActionId::TrainedFinesse)
        && legal(input, CraftActionId::TrainedFinesse)
    {
        return pick(CraftActionId::TrainedFinesse);
    }
    if let Some(action) = emergency_restore_cp(input, false, already_emergency) {
        return pick(action);
    }
    if can_use_safely(input, CraftActionId::DaringTouch, free_cp)
        && legal(input, CraftActionId::DaringTouch)
    {
        return pick(CraftActionId::DaringTouch);
    }
    if can_use_safely(input, CraftActionId::HastyTouch, free_cp)
        && legal(input, CraftActionId::HastyTouch)
    {
        return pick(CraftActionId::HastyTouch);
    }
    if input.state.buffs.great_strides == 0
        && available_cp
            >= cp_cost(input, CraftActionId::GreatStrides)
                + action_definition(CraftActionId::ByregotsBlessing).cp_cost
        && legal(input, CraftActionId::GreatStrides)
    {
        return pick(CraftActionId::GreatStrides);
    }
    if input.state.condition != MaterialCondition::Good && input.state.durability > 10 {
        let can_quick_innovation = input.state.quick_innovation_available;
        if input.state.buffs.great_strides != 1
            && (input.state.buffs.innovation > 1 || can_quick_innovation)
            && available_cp
                >= cp_cost(input, CraftActionId::Observe)
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
            && legal(input, CraftActionId::Observe)
        {
            return emergency(CraftActionId::Observe);
        }
        if input.state.careful_observation_uses_left > 0
            && legal(input, CraftActionId::CarefulObservation)
        {
            return emergency(CraftActionId::CarefulObservation);
        }
    }
    if input.state.durability <= 10
        && (input.state.buffs.manipulation > 0 || declares(input, MaterialCondition::Pliant))
        && legal(input, CraftActionId::Observe)
    {
        return pick(CraftActionId::Observe);
    }
    if input.state.quick_innovation_available {
        return pick(CraftActionId::QuickInnovation);
    }
    pick(CraftActionId::ByregotsBlessing)
}

fn solve_mid_durability_pre_quality(
    input: Input<'_>,
    available_cp: i32,
    allow_observe_on_low_durability: bool,
    want_progress: bool,
    can_be_pliant: bool,
) -> Option<CraftActionId> {
    if input.state.buffs.manipulation > 0
        && input.state.durability + 5 > input.recipe.durability_max
    {
        return None;
    }
    if input.state.condition == MaterialCondition::Primed
        && !can_be_pliant
        && input.state.buffs.manipulation == 0
        && input.state.buffs.waste_not == 0
        && available_cp >= cp_cost(input, CraftActionId::Manipulation)
        && legal(input, CraftActionId::Manipulation)
    {
        return Some(CraftActionId::Manipulation);
    }
    if input.state.condition == MaterialCondition::Pliant {
        if input.state.durability
            + IMMACULATE_MISSING_DURABILITY
            + if input.state.buffs.manipulation > 0 {
                5
            } else {
                0
            }
            <= input.recipe.durability_max
            && legal(input, CraftActionId::ImmaculateMend)
        {
            return Some(CraftActionId::ImmaculateMend);
        }
        if input.state.buffs.manipulation == 0
            && available_cp >= cp_cost(input, CraftActionId::Manipulation)
            && legal(input, CraftActionId::Manipulation)
        {
            return Some(CraftActionId::Manipulation);
        }
        if input.state.durability
            + MASTERS_MEND_DURABILITY
            + if input.state.buffs.manipulation > 0 {
                5
            } else {
                0
            }
            <= input.recipe.durability_max
            && available_cp >= cp_cost(input, CraftActionId::MastersMend)
            && legal(input, CraftActionId::MastersMend)
        {
            return Some(CraftActionId::MastersMend);
        }
        return None;
    }
    let critical_threshold = if matches!(
        input.state.condition,
        MaterialCondition::Sturdy | MaterialCondition::Robust
    ) {
        5
    } else {
        10
    };
    let observable = matches!(
        input.state.condition,
        MaterialCondition::Normal
            | MaterialCondition::Good
            | MaterialCondition::GoodOmen
            | MaterialCondition::Primed
    ) || input.state.condition == MaterialCondition::Malleable && !want_progress;
    let want_observe = allow_observe_on_low_durability && can_be_pliant && observable;
    let low_threshold = if want_observe {
        if input.state.buffs.manipulation > 0 {
            20
        } else {
            25
        }
    } else {
        critical_threshold
    };
    if input.state.durability <= low_threshold {
        if input.state.condition == MaterialCondition::Good
            && legal(input, CraftActionId::TricksOfTheTrade)
        {
            return Some(CraftActionId::TricksOfTheTrade);
        }
        if input.state.buffs.manipulation > 0 && legal(input, CraftActionId::Observe) {
            return Some(CraftActionId::Observe);
        }
        if can_be_pliant
            && legal(input, CraftActionId::Observe)
            && input.state.cp
                > action_definition(CraftActionId::Observe).cp_cost
                    + action_definition(CraftActionId::Manipulation).cp_cost / 2
        {
            return Some(CraftActionId::Observe);
        }
        if input.state.durability <= critical_threshold && legal(input, CraftActionId::Manipulation)
        {
            return Some(CraftActionId::Manipulation);
        }
    }
    None
}

fn solve_mid_durability_start_quality(
    input: Input<'_>,
    available_cp: i32,
) -> Option<CraftActionId> {
    let effective_durability = input.state.durability + input.state.buffs.manipulation * 5;
    if effective_durability > input.recipe.durability_max {
        return None;
    }
    if input.state.condition == MaterialCondition::Pliant {
        return solve_mid_durability_quality_pliant(input, available_cp);
    }
    if input.state.condition == MaterialCondition::Primed
        && input.state.buffs.manipulation == 0
        && available_cp
            >= cp_cost(input, CraftActionId::Manipulation)
                + estimate_cp_to_use_durability(effective_durability, 5)
        && legal(input, CraftActionId::Manipulation)
    {
        return Some(CraftActionId::Manipulation);
    }
    if effective_durability <= 10 {
        let repair_finisher_cp = action_definition(CraftActionId::MastersMend).cp_cost
            + action_definition(CraftActionId::Innovation).cp_cost
            + action_definition(CraftActionId::GreatStrides).cp_cost
            + action_definition(CraftActionId::ByregotsBlessing).cp_cost;
        let free_cp = available_cp - repair_finisher_cp;
        if declares(input, MaterialCondition::Pliant) {
            if input.state.trained_perfection_available
                && legal(input, CraftActionId::TrainedPerfection)
            {
                return Some(CraftActionId::TrainedPerfection);
            }
            if free_cp >= action_definition(CraftActionId::Observe).cp_cost
                && legal(input, CraftActionId::Observe)
            {
                return Some(CraftActionId::Observe);
            }
        } else {
            if available_cp
                >= cp_cost(input, CraftActionId::Manipulation)
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
                && legal(input, CraftActionId::Manipulation)
            {
                return Some(CraftActionId::Manipulation);
            }
            if available_cp
                >= cp_cost(input, CraftActionId::MastersMend)
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
                && legal(input, CraftActionId::MastersMend)
            {
                return Some(CraftActionId::MastersMend);
            }
        }
        let zero_durability_combo_cp = action_definition(CraftActionId::Innovation).cp_cost
            + action_definition(CraftActionId::TrainedFinesse).cp_cost * 4;
        if free_cp >= zero_durability_combo_cp {
            return None;
        }
        if input.state.buffs.manipulation == 0
            && available_cp
                >= cp_cost(input, CraftActionId::Manipulation)
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
            && legal(input, CraftActionId::Manipulation)
        {
            return Some(CraftActionId::Manipulation);
        }
        if available_cp
            >= cp_cost(input, CraftActionId::MastersMend)
                + action_definition(CraftActionId::ByregotsBlessing).cp_cost
            && legal(input, CraftActionId::MastersMend)
        {
            return Some(CraftActionId::MastersMend);
        }
    }
    None
}

fn solve_mid_durability_quality_pliant(
    input: Input<'_>,
    available_cp: i32,
) -> Option<CraftActionId> {
    let effective_durability = input.state.durability + input.state.buffs.manipulation * 5;
    if effective_durability + IMMACULATE_MISSING_DURABILITY <= input.recipe.durability_max
        && available_cp
            >= cp_cost(input, CraftActionId::ImmaculateMend)
                + estimate_cp_to_use_durability(effective_durability, 3)
        && legal(input, CraftActionId::ImmaculateMend)
    {
        return Some(CraftActionId::ImmaculateMend);
    }
    if input.state.buffs.manipulation == 0
        && available_cp
            >= cp_cost(input, CraftActionId::Manipulation)
                + estimate_cp_to_use_durability(effective_durability, 4)
        && legal(input, CraftActionId::Manipulation)
    {
        return Some(CraftActionId::Manipulation);
    }
    if effective_durability + MASTERS_MEND_DURABILITY <= input.recipe.durability_max
        && available_cp
            >= cp_cost(input, CraftActionId::MastersMend)
                + estimate_cp_to_use_durability(effective_durability, 3)
        && legal(input, CraftActionId::MastersMend)
    {
        return Some(CraftActionId::MastersMend);
    }
    None
}

fn estimate_cp_to_use_durability(effective_durability: i32, extra_half_combos: i32) -> i32 {
    let half_combo_cp = action_definition(CraftActionId::Innovation).cp_cost / 2
        + action_definition(CraftActionId::Observe).cp_cost
        + action_definition(CraftActionId::AdvancedTouch).cp_cost;
    let current_half_combos = if effective_durability <= 20 {
        0
    } else {
        (effective_durability + 9) / 10
    };
    if effective_durability <= 10 {
        0
    } else {
        half_combo_cp * (current_half_combos + extra_half_combos)
    }
}

fn solve_mid_high_priority_progress(
    input: Input<'_>,
    allow_intensive: bool,
    progress_deficit: i32,
) -> Option<CraftActionId> {
    if input.state.condition == MaterialCondition::Good
        && allow_intensive
        && !input.state.trained_perfection_active
        && input.state.durability > durability_cost(input, CraftActionId::IntensiveSynthesis)
        && legal(input, CraftActionId::IntensiveSynthesis)
    {
        return Some(CraftActionId::IntensiveSynthesis);
    }
    if input.state.trained_perfection_active {
        return None;
    }
    if progress_gain(input, CraftActionId::PrudentSynthesis) >= progress_deficit {
        if input.state.durability > durability_cost(input, CraftActionId::PrudentSynthesis)
            && legal(input, CraftActionId::PrudentSynthesis)
        {
            return Some(CraftActionId::PrudentSynthesis);
        }
        if input.state.durability > durability_cost(input, CraftActionId::CarefulSynthesis)
            && legal(input, CraftActionId::CarefulSynthesis)
        {
            return Some(CraftActionId::CarefulSynthesis);
        }
        if progress_gain(input, CraftActionId::BasicSynthesis) >= progress_deficit
            && input.state.durability > durability_cost(input, CraftActionId::BasicSynthesis)
        {
            return Some(CraftActionId::BasicSynthesis);
        }
    }
    if input.state.inner_quiet >= MAX_IQ_STACKS {
        if matches!(
            input.state.condition,
            MaterialCondition::Centered
                | MaterialCondition::Sturdy
                | MaterialCondition::Robust
                | MaterialCondition::Malleable
        ) && input.state.durability > durability_cost(input, CraftActionId::RapidSynthesis)
            && legal(input, CraftActionId::RapidSynthesis)
        {
            return Some(CraftActionId::RapidSynthesis);
        }
        if input.state.durability > durability_cost(input, CraftActionId::RapidSynthesis)
            && legal(input, CraftActionId::RapidSynthesis)
        {
            return Some(CraftActionId::RapidSynthesis);
        }
        if input.state.durability <= durability_cost(input, CraftActionId::RapidSynthesis)
            && (input.state.buffs.manipulation > 0 || declares(input, MaterialCondition::Pliant))
            && legal(input, CraftActionId::Observe)
        {
            return Some(CraftActionId::Observe);
        }
    }
    if matches!(
        input.state.condition,
        MaterialCondition::Centered
            | MaterialCondition::Sturdy
            | MaterialCondition::Robust
            | MaterialCondition::Malleable
    ) && input.state.durability > durability_cost(input, CraftActionId::RapidSynthesis)
        && legal(input, CraftActionId::RapidSynthesis)
    {
        return Some(CraftActionId::RapidSynthesis);
    }
    None
}

fn solve_mid_high_priority_iq(input: Input<'_>, allow_precise: bool) -> Option<CraftActionId> {
    let hasty_action = if legal(input, CraftActionId::DaringTouch) {
        CraftActionId::DaringTouch
    } else {
        CraftActionId::HastyTouch
    };
    if input.state.condition == MaterialCondition::Good
        && allow_precise
        && input.state.durability > durability_cost(input, CraftActionId::PreciseTouch)
        && legal(input, CraftActionId::PreciseTouch)
    {
        return Some(CraftActionId::PreciseTouch);
    }
    if input.state.trained_perfection_active {
        if matches!(
            input.state.condition,
            MaterialCondition::Good | MaterialCondition::Pliant
        ) && legal(input, CraftActionId::PreparatoryTouch)
        {
            return Some(CraftActionId::PreparatoryTouch);
        }
        if legal(input, CraftActionId::PreparatoryTouch) {
            return Some(CraftActionId::PreparatoryTouch);
        }
    }
    if input.context.last_action == Some(CraftActionId::BasicTouch)
        && input.state.buffs.waste_not > 0
        && input.state.durability > durability_cost(input, CraftActionId::RefinedTouch)
        && legal(input, CraftActionId::RefinedTouch)
    {
        return Some(CraftActionId::RefinedTouch);
    }
    if input.state.condition == MaterialCondition::Centered
        && input.state.durability > durability_cost(input, hasty_action)
        && legal(input, hasty_action)
    {
        return Some(hasty_action);
    }
    if matches!(
        input.state.condition,
        MaterialCondition::Sturdy | MaterialCondition::Robust
    ) {
        if input.state.buffs.innovation > 0
            && input.state.durability > durability_cost(input, CraftActionId::PreparatoryTouch)
            && legal(input, CraftActionId::PreparatoryTouch)
        {
            return Some(CraftActionId::PreparatoryTouch);
        }
        if input.state.durability > durability_cost(input, hasty_action)
            && legal(input, hasty_action)
        {
            return Some(hasty_action);
        }
        let combo = next_touch_combo(input);
        if input.state.buffs.waste_not == 0
            && input.state.durability > durability_cost(input, combo)
            && legal(input, combo)
        {
            return Some(combo);
        }
    }
    if input.state.buffs.waste_not > 0 {
        if input.state.buffs.waste_not > 1
            && input.state.inner_quiet <= MAX_IQ_STACKS - 3
            && input.state.durability > durability_cost(input, CraftActionId::BasicTouch)
            && legal(input, CraftActionId::BasicTouch)
        {
            return Some(CraftActionId::BasicTouch);
        }
        if input.state.inner_quiet <= MAX_IQ_STACKS - 2
            && input.state.durability > durability_cost(input, CraftActionId::PreparatoryTouch)
            && legal(input, CraftActionId::PreparatoryTouch)
        {
            return Some(CraftActionId::PreparatoryTouch);
        }
    }
    if input.context.last_action == Some(CraftActionId::Observe)
        && input.state.durability > durability_cost(input, CraftActionId::AdvancedTouch)
        && legal(input, CraftActionId::AdvancedTouch)
    {
        return Some(CraftActionId::AdvancedTouch);
    }
    None
}

fn solve_finish_quality(
    input: Input<'_>,
    available_cp: i32,
    quality_target: i32,
) -> Option<CraftActionId> {
    if input.state.inner_quiet == 0 {
        return None;
    }
    let missing_quality = quality_target - input.state.quality;
    if missing_quality <= 0 {
        return None;
    }
    let byregot_durability = durability_cost(input, CraftActionId::ByregotsBlessing);
    let byregot_cp = cp_cost(input, CraftActionId::ByregotsBlessing);
    if input.state.durability <= byregot_durability || available_cp < byregot_cp {
        return None;
    }
    if missing_quality <= quality_gain(input, CraftActionId::ByregotsBlessing)
        && legal(input, CraftActionId::ByregotsBlessing)
    {
        return Some(CraftActionId::ByregotsBlessing);
    }
    if input.state.buffs.great_strides > 1
        && input.state.buffs.innovation == 0
        && available_cp
            >= cp_cost(input, CraftActionId::Innovation)
                + action_definition(CraftActionId::ByregotsBlessing).cp_cost
    {
        if missing_quality <= estimated_byregot_quality(input, true, 1)
            && legal(input, CraftActionId::Innovation)
        {
            return Some(CraftActionId::Innovation);
        }
    } else if input.state.buffs.great_strides >= 1
        && input.state.buffs.innovation == 0
        && input.state.quick_innovation_available
        && available_cp >= cp_cost(input, CraftActionId::ByregotsBlessing)
    {
        if missing_quality <= estimated_byregot_quality(input, true, 0)
            && legal(input, CraftActionId::QuickInnovation)
        {
            return Some(CraftActionId::QuickInnovation);
        }
    } else if input.state.buffs.great_strides == 0
        && available_cp
            >= cp_cost(input, CraftActionId::GreatStrides)
                + action_definition(CraftActionId::ByregotsBlessing).cp_cost
    {
        if missing_quality <= estimated_byregot_quality(input, input.state.buffs.innovation > 1, 1)
            && legal(input, CraftActionId::GreatStrides)
        {
            return Some(CraftActionId::GreatStrides);
        }
        if input.state.buffs.innovation <= 1
            && available_cp
                >= cp_cost(input, CraftActionId::GreatStrides)
                    + action_definition(CraftActionId::Innovation).cp_cost
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
            && missing_quality <= estimated_byregot_quality(input, true, 2)
            && legal(input, CraftActionId::GreatStrides)
        {
            return Some(CraftActionId::GreatStrides);
        }
        if input.state.buffs.innovation == 0
            && input.state.quick_innovation_available
            && available_cp
                >= cp_cost(input, CraftActionId::GreatStrides)
                    + action_definition(CraftActionId::ByregotsBlessing).cp_cost
            && missing_quality <= estimated_byregot_quality(input, true, 1)
            && legal(input, CraftActionId::GreatStrides)
        {
            return Some(CraftActionId::GreatStrides);
        }
    }
    None
}

fn solve_finish_progress(
    input: Input<'_>,
    quality_target: i32,
    emergency_finish: bool,
) -> Option<CraftActionId> {
    let remaining_progress = input.recipe.progress_required - input.state.progress;
    let remaining_quality = quality_target - input.state.quality;
    if remaining_quality <= 0 || emergency_finish {
        if progress_gain(input, CraftActionId::BasicSynthesis) >= remaining_progress {
            return Some(CraftActionId::BasicSynthesis);
        }
        if progress_gain(input, CraftActionId::CarefulSynthesis) >= remaining_progress
            && legal(input, CraftActionId::CarefulSynthesis)
        {
            return Some(CraftActionId::CarefulSynthesis);
        }
    }
    if input.state.condition == MaterialCondition::Good {
        if can_use_synthesis_for_finisher(input, CraftActionId::IntensiveSynthesis)
            && legal(input, CraftActionId::IntensiveSynthesis)
        {
            return Some(CraftActionId::IntensiveSynthesis);
        }
        if legal(input, CraftActionId::TricksOfTheTrade) {
            return Some(CraftActionId::TricksOfTheTrade);
        }
    }
    if progress_gain(input, CraftActionId::DelicateSynthesis) >= remaining_progress
        && legal(input, CraftActionId::DelicateSynthesis)
    {
        return Some(CraftActionId::DelicateSynthesis);
    }
    if input.state.condition == MaterialCondition::Pliant {
        let extra_finish_cp = action_definition(CraftActionId::CarefulSynthesis).cp_cost * 4;
        if input.state.buffs.manipulation == 0
            && input.state.cp >= cp_cost(input, CraftActionId::Manipulation) + extra_finish_cp
            && legal(input, CraftActionId::Manipulation)
        {
            return Some(CraftActionId::Manipulation);
        }
        if input.state.durability + IMMACULATE_MISSING_DURABILITY <= input.recipe.durability_max
            && input.state.cp >= cp_cost(input, CraftActionId::ImmaculateMend) + extra_finish_cp
            && legal(input, CraftActionId::ImmaculateMend)
        {
            return Some(CraftActionId::ImmaculateMend);
        }
        if input.state.durability
            + MASTERS_MEND_DURABILITY
            + if input.state.buffs.manipulation > 0 {
                5
            } else {
                0
            }
            <= input.recipe.durability_max
            && input.state.cp >= cp_cost(input, CraftActionId::MastersMend) + extra_finish_cp
            && legal(input, CraftActionId::MastersMend)
        {
            return Some(CraftActionId::MastersMend);
        }
        if input.state.cp >= cp_cost(input, CraftActionId::Veneration)
            && input.state.buffs.veneration <= 1
            && legal(input, CraftActionId::Veneration)
        {
            return Some(CraftActionId::Veneration);
        }
        if can_use_synthesis_for_finisher(input, CraftActionId::PrudentSynthesis)
            && legal(input, CraftActionId::PrudentSynthesis)
        {
            return Some(CraftActionId::PrudentSynthesis);
        }
    }
    if input.state.condition == MaterialCondition::GoodOmen
        && input.state.cp
            >= cp_cost(input, CraftActionId::Veneration)
                + action_definition(CraftActionId::IntensiveSynthesis).cp_cost
        && input.state.buffs.veneration <= 1
        && legal(input, CraftActionId::Veneration)
    {
        return Some(CraftActionId::Veneration);
    }
    if input.state.condition == MaterialCondition::Malleable
        && can_use_synthesis_for_finisher(input, CraftActionId::IntensiveSynthesis)
        && (input.state.heart_and_soul_available || input.state.heart_and_soul_active)
        && input.state.progress
            + progress_gain(
                input,
                if input.state.cp >= action_definition(CraftActionId::CarefulSynthesis).cp_cost {
                    CraftActionId::CarefulSynthesis
                } else {
                    CraftActionId::BasicSynthesis
                },
            )
            < input.recipe.progress_required
    {
        if input.state.heart_and_soul_active && legal(input, CraftActionId::IntensiveSynthesis) {
            return Some(CraftActionId::IntensiveSynthesis);
        }
        return Some(CraftActionId::HeartAndSoul);
    }
    if matches!(
        input.state.condition,
        MaterialCondition::Normal
            | MaterialCondition::Pliant
            | MaterialCondition::Centered
            | MaterialCondition::Primed
    ) && input.state.buffs.manipulation > 0
        && input.state.durability <= 10
        && input.state.cp
            >= cp_cost(input, CraftActionId::Observe)
                + action_definition(CraftActionId::CarefulSynthesis).cp_cost
        && legal(input, CraftActionId::Observe)
    {
        return Some(CraftActionId::Observe);
    }
    if can_use_synthesis_for_finisher(input, CraftActionId::CarefulSynthesis)
        && legal(input, CraftActionId::CarefulSynthesis)
    {
        return Some(CraftActionId::CarefulSynthesis);
    }
    if can_use_synthesis_for_finisher(input, CraftActionId::PrudentSynthesis)
        && legal(input, CraftActionId::PrudentSynthesis)
    {
        return Some(CraftActionId::PrudentSynthesis);
    }
    if durability_cost(input, CraftActionId::RapidSynthesis) < input.state.durability
        && legal(input, CraftActionId::RapidSynthesis)
    {
        return Some(CraftActionId::RapidSynthesis);
    }
    if input.state.progress + progress_gain(input, CraftActionId::BasicSynthesis)
        >= input.recipe.progress_required
    {
        return Some(CraftActionId::BasicSynthesis);
    }
    if can_use_synthesis_for_finisher(input, CraftActionId::IntensiveSynthesis) {
        if legal(input, CraftActionId::IntensiveSynthesis) {
            return Some(CraftActionId::IntensiveSynthesis);
        }
        if legal(input, CraftActionId::HeartAndSoul) {
            return Some(CraftActionId::HeartAndSoul);
        }
    }
    if input.state.durability <= 10 {
        if input.state.durability + IMMACULATE_MISSING_DURABILITY <= input.recipe.durability_max
            && legal(input, CraftActionId::ImmaculateMend)
        {
            return Some(CraftActionId::ImmaculateMend);
        }
        if input.state.buffs.manipulation == 0 && legal(input, CraftActionId::Manipulation) {
            return Some(CraftActionId::Manipulation);
        }
        if legal(input, CraftActionId::MastersMend) {
            return Some(CraftActionId::MastersMend);
        }
    }
    if input.state.durability > 10 {
        return Some(CraftActionId::RapidSynthesis);
    }
    if legal(input, CraftActionId::Observe) {
        return Some(CraftActionId::Observe);
    }
    Some(CraftActionId::RapidSynthesis)
}

fn emergency_restore_cp(
    input: Input<'_>,
    force_tricks: bool,
    already_emergency: bool,
) -> Option<CraftActionId> {
    let tricks_allowed = force_tricks
        || (!already_emergency
            && input.context.last_action != Some(CraftActionId::QuickInnovation));
    if tricks_allowed && legal(input, CraftActionId::TricksOfTheTrade) {
        return Some(CraftActionId::TricksOfTheTrade);
    }
    if tricks_allowed
        && input.state.heart_and_soul_available
        && legal(input, CraftActionId::HeartAndSoul)
    {
        return Some(CraftActionId::HeartAndSoul);
    }
    None
}

fn can_use_synthesis_for_finisher(input: Input<'_>, action: CraftActionId) -> bool {
    input.state.cp >= cp_cost(input, action)
        && (input.state.durability > durability_cost(input, action)
            || input.state.progress + progress_gain(input, action)
                >= input.recipe.progress_required)
}

fn can_use_safely(input: Input<'_>, action: CraftActionId, available_cp: i32) -> bool {
    let durability = durability_cost(input, action);
    durability == 0
        || input.state.durability > durability
            && input.state.durability + 5 * input.state.buffs.manipulation - durability > 10
            && available_cp >= cp_cost(input, action)
}

fn safe_action(input: Input<'_>, action: CraftActionId) -> CraftActionId {
    if input.state.buffs.final_appraisal == 0
        && input.state.progress + progress_gain(input, action) >= input.recipe.progress_required
    {
        CraftActionId::FinalAppraisal
    } else {
        action
    }
}

fn next_touch_combo(input: Input<'_>) -> CraftActionId {
    match input.context.last_action {
        Some(CraftActionId::BasicTouch) => CraftActionId::StandardTouch,
        Some(CraftActionId::StandardTouch) => CraftActionId::AdvancedTouch,
        _ => CraftActionId::BasicTouch,
    }
}

fn legal(input: Input<'_>, action: CraftActionId) -> bool {
    preview_action(input.recipe, input.crafter, input.state, action).legal
}

fn cp_cost(input: Input<'_>, action: CraftActionId) -> i32 {
    preview_action(input.recipe, input.crafter, input.state, action).cp_cost
}

fn durability_cost(input: Input<'_>, action: CraftActionId) -> i32 {
    preview_action(input.recipe, input.crafter, input.state, action).durability_cost
}

fn progress_gain(input: Input<'_>, action: CraftActionId) -> i32 {
    preview_action(input.recipe, input.crafter, input.state, action).progress_gain
}

fn quality_gain(input: Input<'_>, action: CraftActionId) -> i32 {
    preview_action(input.recipe, input.crafter, input.state, action).quality_gain
}

fn declares(input: Input<'_>, condition: MaterialCondition) -> bool {
    input
        .random_condition_mask
        .is_some_and(|mask| mask & (1_u16 << condition.index()) != 0)
}

fn formula_inputs(input: Input<'_>) -> (RecipeFormulaInput, CrafterFormulaInput) {
    (
        RecipeFormulaInput {
            recipe_level: input.recipe.recipe_level,
            progress_divider: input.recipe.progress_divider,
            quality_divider: input.recipe.quality_divider,
            progress_modifier: input.recipe.progress_modifier,
            quality_modifier: input.recipe.quality_modifier,
        },
        CrafterFormulaInput {
            craftsmanship: f64::from(input.crafter.craftsmanship),
            control: f64::from(input.crafter.control),
        },
    )
}

fn base_progress(input: Input<'_>) -> i32 {
    let (recipe, crafter) = formula_inputs(input);
    calculate_base_progress(&recipe, &crafter).floor() as i32
}

fn base_quality(input: Input<'_>) -> i32 {
    let (recipe, crafter) = formula_inputs(input);
    calculate_base_quality(&recipe, &crafter).floor() as i32
}

fn estimated_byregot_quality(input: Input<'_>, include_innovation: bool, steps_ahead: u8) -> i32 {
    let iq_modifier = 1.0 + 0.1 * f64::from(input.state.inner_quiet);
    let buff_modifier = iq_modifier * if include_innovation { 2.5 } else { 2.0 };
    let effective_potency = f64::from(100 + 20 * input.state.inner_quiet) * buff_modifier;
    let use_good = (steps_ahead == 0 && input.state.condition == MaterialCondition::Good)
        || (steps_ahead == 1 && input.state.condition == MaterialCondition::GoodOmen);
    let condition_modifier = if use_good {
        if input.crafter.cosmic_tool_good_bonus {
            1.75
        } else {
            1.5
        }
    } else {
        1.0
    };
    (f64::from(base_quality(input)) * condition_modifier * effective_potency / 100.0) as i32
}
