use frozen_rabbit_craft_kernel::{
    ConditionWeights, CraftActionId, CraftState, CrafterProfile, EpisodeRandomStream,
    MaterialCondition, RandomDrawCursor, RecipeProfile, draw_simulated_action_outcome,
    preview_action,
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

fn crafter(specialist: bool) -> CrafterProfile {
    CrafterProfile {
        level: 100,
        craftsmanship: 5_380,
        control: 5_000,
        max_cp: 620,
        cosmic_tool_good_bonus: false,
        specialist,
    }
}

const BALANCED: ConditionWeights = [1.0; 8];

#[test]
fn advancing_actions_consume_success_and_condition_streams() {
    let recipe = recipe();
    let crafter = crafter(false);
    let state = CraftState::initial(&recipe, &crafter);
    let preview = preview_action(&recipe, &crafter, &state, CraftActionId::RapidSynthesis);
    let mut random = EpisodeRandomStream::new(123);
    let result = draw_simulated_action_outcome(
        &preview,
        &state,
        &BALANCED,
        &mut random,
        RandomDrawCursor {
            condition_draws: 0,
            success_draws: 0,
        },
    );
    assert_eq!(result.cursor_after.condition_draws, 1);
    assert_eq!(result.cursor_after.success_draws, 1);
}

#[test]
fn ordinary_no_step_actions_do_not_consume_either_stream() {
    let recipe = recipe();
    let crafter = crafter(false);
    let state = CraftState::initial(&recipe, &crafter);
    let preview = preview_action(&recipe, &crafter, &state, CraftActionId::FinalAppraisal);
    let mut random = EpisodeRandomStream::new(123);
    let before = RandomDrawCursor {
        condition_draws: 7,
        success_draws: 9,
    };
    let result = draw_simulated_action_outcome(&preview, &state, &BALANCED, &mut random, before);
    assert_eq!(result.cursor_after, before);
    assert_eq!(result.observed.next_condition, MaterialCondition::Normal);
}

#[test]
fn careful_observation_only_consumes_the_condition_stream() {
    let recipe = recipe();
    let crafter = crafter(true);
    let state = CraftState::initial(&recipe, &crafter);
    let preview = preview_action(&recipe, &crafter, &state, CraftActionId::CarefulObservation);
    let mut random = EpisodeRandomStream::new(123);
    let result = draw_simulated_action_outcome(
        &preview,
        &state,
        &BALANCED,
        &mut random,
        RandomDrawCursor {
            condition_draws: 2,
            success_draws: 3,
        },
    );
    assert_eq!(result.cursor_after.condition_draws, 3);
    assert_eq!(result.cursor_after.success_draws, 3);
    assert!(result.observed.success);
}

#[test]
fn good_omen_forces_good_without_a_condition_draw() {
    let recipe = recipe();
    let crafter = crafter(false);
    let mut state = CraftState::initial(&recipe, &crafter);
    state.condition = MaterialCondition::GoodOmen;
    let preview = preview_action(&recipe, &crafter, &state, CraftActionId::BasicTouch);
    let mut random = EpisodeRandomStream::new(123);
    let result = draw_simulated_action_outcome(
        &preview,
        &state,
        &BALANCED,
        &mut random,
        RandomDrawCursor {
            condition_draws: 4,
            success_draws: 5,
        },
    );
    assert_eq!(result.observed.next_condition, MaterialCondition::Good);
    assert_eq!(result.cursor_after.condition_draws, 4);
    assert_eq!(result.cursor_after.success_draws, 6);
}
