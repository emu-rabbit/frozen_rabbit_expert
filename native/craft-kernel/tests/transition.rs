use frozen_rabbit_craft_kernel::{
    CraftActionId, CraftState, CraftTerminal, CrafterProfile, MaterialCondition,
    ObservedActionOutcome, RecipeProfile, apply_observed_outcome, preview_action,
};

fn recipe() -> RecipeProfile {
    RecipeProfile {
        canonical_recipe_id: 36_282,
        recipe_level: 746,
        progress_required: 7_300,
        quality_max: 18_900,
        required_quality: 18_900,
        durability_max: 30,
        progress_divider: 180.0,
        quality_divider: 180.0,
        progress_modifier: 100.0,
        quality_modifier: 100.0,
    }
}

fn crafter() -> CrafterProfile {
    CrafterProfile {
        level: 100,
        craftsmanship: 5_380,
        control: 5_000,
        max_cp: 620,
        cosmic_tool_good_bonus: false,
        specialist: false,
    }
}

fn successful(next_condition: MaterialCondition) -> ObservedActionOutcome {
    ObservedActionOutcome {
        success: true,
        next_condition,
    }
}

#[test]
fn preview_matches_representative_ts_cost_success_and_gain_rules() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);

    state.condition = MaterialCondition::Pliant;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::CarefulSynthesis).cp_cost,
        4
    );

    state.condition = MaterialCondition::Sturdy;
    state.buffs.waste_not = 2;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicTouch).durability_cost,
        3
    );

    state.buffs.waste_not = 0;
    state.condition = MaterialCondition::Centered;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::RapidSynthesis).success_rate,
        0.75
    );
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicSynthesis).success_rate,
        1.0
    );

    state.condition = MaterialCondition::Normal;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicSynthesis).progress_gain,
        360
    );
    state.condition = MaterialCondition::Malleable;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicSynthesis).progress_gain,
        540
    );
}

#[test]
fn preview_matches_good_cosmic_and_empirical_quality_rules() {
    let recipe = recipe();
    let mut crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.condition = MaterialCondition::Good;

    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicTouch).quality_gain,
        468
    );
    crafter.cosmic_tool_good_bonus = true;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::BasicTouch).quality_gain,
        546
    );

    crafter.control = 5_140;
    state.condition = MaterialCondition::Normal;
    state.inner_quiet = 3;
    state.buffs.innovation = 4;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::AdvancedTouch).quality_gain,
        935
    );
}

#[test]
fn good_omen_and_primed_match_ts_transition_semantics() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.condition = MaterialCondition::GoodOmen;

    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicTouch,
        successful(MaterialCondition::Primed),
    )
    .expect("basic touch is legal")
    .next_state;
    assert_eq!(next.condition, MaterialCondition::Good);

    state.condition = MaterialCondition::Primed;
    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::Innovation,
        successful(MaterialCondition::Normal),
    )
    .expect("innovation is legal")
    .next_state;
    assert_eq!(next.buffs.innovation, 6);
}

#[test]
fn robust_halves_durability_and_forces_sturdy_on_an_advancing_action() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.condition = MaterialCondition::Robust;

    let preview = preview_action(&recipe, &crafter, &state, CraftActionId::BasicTouch);
    assert_eq!(preview.durability_cost, 5);
    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicTouch,
        successful(MaterialCondition::Primed),
    )
    .expect("basic touch is legal")
    .next_state;
    assert_eq!(next.condition, MaterialCondition::Sturdy);
    assert_eq!(next.durability, 25);
}

#[test]
fn no_step_action_preserves_step_condition_combo_and_existing_buffs() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.step = 9;
    state.condition = MaterialCondition::Centered;
    state.combo_from = Some(CraftActionId::Observe);
    state.buffs.innovation = 2;

    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::FinalAppraisal,
        successful(MaterialCondition::Good),
    )
    .expect("final appraisal is legal")
    .next_state;
    assert_eq!(next.step, 9);
    assert_eq!(next.condition, MaterialCondition::Centered);
    assert_eq!(next.combo_from, Some(CraftActionId::Observe));
    assert_eq!(next.buffs.innovation, 2);
    assert_eq!(next.buffs.final_appraisal, 5);
}

#[test]
fn final_appraisal_prevents_completion_and_is_consumed() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.progress = 7_000;
    state.buffs.final_appraisal = 2;

    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicSynthesis,
        successful(MaterialCondition::Normal),
    )
    .expect("basic synthesis is legal")
    .next_state;
    assert_eq!(next.progress, 7_299);
    assert_eq!(next.buffs.final_appraisal, 0);
    assert_eq!(next.terminal, CraftTerminal::None);
}

#[test]
fn completion_wins_over_zero_durability_and_required_quality_fails_closed() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.progress = 7_000;
    state.quality = 18_900;
    state.durability = 10;

    let complete = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicSynthesis,
        successful(MaterialCondition::Normal),
    )
    .expect("basic synthesis is legal")
    .next_state;
    assert_eq!(complete.durability, 0);
    assert_eq!(complete.terminal, CraftTerminal::Completed);

    state.quality = 18_899;
    let failed = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicSynthesis,
        successful(MaterialCondition::Normal),
    )
    .expect("basic synthesis is legal")
    .next_state;
    assert_eq!(failed.terminal, CraftTerminal::Failed);
    assert_eq!(
        failed.failure_reason.map(|reason| reason.as_str()),
        Some("required-quality")
    );
}

#[test]
fn trained_perfection_and_manipulation_apply_in_ts_order() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.trained_perfection_active = true;
    state.trained_perfection_available = false;
    state.buffs.manipulation = 2;

    let next = apply_observed_outcome(
        &recipe,
        &crafter,
        &state,
        CraftActionId::BasicTouch,
        successful(MaterialCondition::Normal),
    )
    .expect("basic touch is legal")
    .next_state;
    assert_eq!(next.durability, 30);
    assert!(!next.trained_perfection_active);
    assert_eq!(next.buffs.manipulation, 1);
}

#[test]
fn specialist_resources_and_condition_bypass_match_ts() {
    let recipe = recipe();
    let mut specialist = crafter();
    specialist.specialist = true;
    let mut state = CraftState::initial(&recipe, &specialist);
    assert_eq!(state.careful_observation_uses_left, 3);
    assert!(state.heart_and_soul_available);
    assert!(state.quick_innovation_available);

    state.step = 6;
    let state = apply_observed_outcome(
        &recipe,
        &specialist,
        &state,
        CraftActionId::HeartAndSoul,
        successful(MaterialCondition::Malleable),
    )
    .expect("heart and soul is legal")
    .next_state;
    assert_eq!(state.step, 6);
    assert_eq!(state.condition, MaterialCondition::Normal);
    assert!(state.heart_and_soul_active);

    let preview = preview_action(&recipe, &specialist, &state, CraftActionId::PreciseTouch);
    assert!(preview.legal);
    let state = apply_observed_outcome(
        &recipe,
        &specialist,
        &state,
        CraftActionId::PreciseTouch,
        successful(MaterialCondition::Centered),
    )
    .expect("heart and soul bypasses the condition")
    .next_state;
    assert!(!state.heart_and_soul_active);
}

#[test]
fn combo_costs_groundwork_halving_and_waste_not_conflicts_match_ts() {
    let recipe = recipe();
    let crafter = crafter();
    let mut state = CraftState::initial(&recipe, &crafter);
    state.combo_from = Some(CraftActionId::BasicTouch);
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::StandardTouch).cp_cost,
        18
    );
    state.combo_from = Some(CraftActionId::Observe);
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::AdvancedTouch).cp_cost,
        18
    );

    state.combo_from = None;
    state.durability = 19;
    assert_eq!(
        preview_action(&recipe, &crafter, &state, CraftActionId::Groundwork).progress_gain,
        540
    );
    state.buffs.waste_not = 1;
    let prudent = preview_action(&recipe, &crafter, &state, CraftActionId::PrudentTouch);
    assert!(!prudent.legal);
    assert_eq!(
        prudent.reason.map(|reason| reason.as_str()),
        Some("waste-not-conflict")
    );
}
