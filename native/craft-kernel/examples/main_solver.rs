use frozen_rabbit_craft_kernel::main_solver::{
    AvailableConditions, CraftState, CrafterProfile, MainSolverConfig, MainSolverObjective,
    MainSolverSession, MainSolverStatus, MaterialCondition, ObservedActionOutcome, RecipeProfile,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let recipe = RecipeProfile {
        canonical_recipe_id: 1,
        recipe_level: 100,
        progress_required: 6_600,
        quality_max: 22_500,
        required_quality: 22_500,
        durability_max: 70,
        progress_divider: 180.0,
        quality_divider: 180.0,
        progress_modifier: 100.0,
        quality_modifier: 100.0,
    };
    let crafter = CrafterProfile {
        level: 100,
        craftsmanship: 5_200,
        control: 5_100,
        max_cp: 700,
        cosmic_tool_good_bonus: true,
        specialist: true,
    };
    let config = MainSolverConfig::new(
        recipe,
        crafter,
        MainSolverObjective::HardQuality {
            quality_maximum: recipe.quality_max,
        },
        AvailableConditions::ALL,
    )?;
    let mut solver = MainSolverSession::new(config);
    let state = CraftState::initial(&recipe, &crafter);

    match solver.recommend(&state)? {
        MainSolverStatus::Recommendation(recommendation) => {
            println!("next action: {}", recommendation.action);
            println!("policy: {}", recommendation.policy_version);
            let transition = solver.observe(
                recommendation.action,
                ObservedActionOutcome {
                    success: true,
                    next_condition: MaterialCondition::Normal,
                },
            )?;
            println!("next state: {:?}", transition.next_state);
        }
        status => println!("no action: {status:?}"),
    }
    Ok(())
}
