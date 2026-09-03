//! Research-only boundary audit: runs the same initial observed state through
//! evaluator worlds with different hidden condition-generation weights. The
//! first recommendation must stay identical for every solver version.
use frozen_rabbit_craft_kernel::research::*;
use std::collections::HashMap;
use std::io::{self, BufRead};

const VERSIONS: &[GenericSolverVersion] = &[
    GenericSolverVersion::RustBaselineV1,
    GenericSolverVersion::HardQualityV2,
    GenericSolverVersion::RustPrimaryV3,
    GenericSolverVersion::OptionRouteV4,
    GenericSolverVersion::OptionMpcV5,
    GenericSolverVersion::GuideOptionMpcV6,
    GenericSolverVersion::GuideLeaseMpcV7,
    GenericSolverVersion::GuidePhaseMpcV8,
    GenericSolverVersion::StrategyPortfolioMpcV9,
    GenericSolverVersion::CapabilityPortfolioMpcV10,
    GenericSolverVersion::DeepPortfolioMpcV11,
    GenericSolverVersion::StrategyProgramMpcV12,
    GenericSolverVersion::OpportunityReserveV13,
    GenericSolverVersion::DeliveryShieldV14,
    GenericSolverVersion::BudgetedConditionV15,
    GenericSolverVersion::TsMigrationPortV16,
    GenericSolverVersion::ConditionSetPortfolioV17,
    GenericSolverVersion::CapabilityConditionSetPortfolioV18,
    GenericSolverVersion::ConditionContinuationPortfolioV19,
    GenericSolverVersion::ObjectiveCapabilityPortfolioV20,
    GenericSolverVersion::ProgressQualityShieldV21,
    GenericSolverVersion::SpecialistResourcePortfolioV22,
    GenericSolverVersion::ProgressBankPortfolioV23,
    GenericSolverVersion::FlatOpportunityPortfolioV24,
    GenericSolverVersion::SpecialistResourceGuardV25,
    GenericSolverVersion::RoutePortfolioV1,
    GenericSolverVersion::ResourcePortfolioV2,
    GenericSolverVersion::CoordinatedPortfolioV3,
    GenericSolverVersion::ConstructionPortfolioV4,
    GenericSolverVersion::CachedPortfolioV5,
    GenericSolverVersion::CompactPortfolioV6,
    GenericSolverVersion::CertifiedPortfolioV7,
    GenericSolverVersion::QualityBoundPortfolioV8,
    GenericSolverVersion::EquivalentPortfolioV9,
    GenericSolverVersion::ObjectivePortfolioV10,
    GenericSolverVersion::AggressiveResourcePortfolioV11,
    GenericSolverVersion::CompletionAwarePortfolioV12,
    GenericSolverVersion::CompletionAwarePortfolioExperiment,
    GenericSolverVersion::ConditionOpportunityAblationExperiment,
    GenericSolverVersion::ExperimentalPortfolio,
    GenericSolverVersion::GuideDirectProbe,
    GenericSolverVersion::IntegratedGuideDirectProbe,
    GenericSolverVersion::ProgressReserveGuideDirectProbe,
    GenericSolverVersion::OpportunityReserveGuideDirectProbe,
    GenericSolverVersion::RiskForwardDirectProbe,
];

#[derive(Default)]
struct Stats {
    sampled_cases: usize,
    action_changes: usize,
    first: Option<String>,
}

fn weights(mask: u16, normal: f64, other: f64) -> ConditionTransitionWeights {
    let mut result = [[0.0; MATERIAL_CONDITION_COUNT]; MATERIAL_CONDITION_COUNT];
    for row in &mut result {
        for (index, value) in row.iter_mut().enumerate() {
            if mask & (1 << index) != 0 {
                *value = if index == MaterialCondition::Normal.index() {
                    normal
                } else {
                    other
                };
            }
        }
    }
    result
}

fn action_name(action: Option<CraftActionId>) -> &'static str {
    action.map_or("-", CraftActionId::as_str)
}

fn first_action(
    case: &GenericEpisodeCase,
    version: GenericSolverVersion,
    condition_transition_weights: ConditionTransitionWeights,
) -> Option<CraftActionId> {
    let mut probe = case.clone();
    probe.solver_version = version;
    probe.rollout.max_steps = 1;
    probe.rollout.condition_transition_weights = condition_transition_weights;
    execute_generic_episode(&probe)
        .expect("one-step boundary probe")
        .actions
        .first()
        .copied()
}

fn main() {
    let mut stats: HashMap<GenericSolverVersion, Stats> = VERSIONS
        .iter()
        .copied()
        .map(|version| (version, Stats::default()))
        .collect();
    let mut total_cases = 0_usize;
    for line in io::stdin().lock().lines() {
        let case = parse_generic_episode_case(&line.expect("input line")).expect("valid case");
        total_cases += 1;
        let mask = case.random_condition_mask;
        let uniform = weights(mask, 1.0, 1.0);
        let normal_heavy = weights(mask, 6.0, 1.0);
        let scarce = weights(mask, 12.0, 0.35);
        for &version in VERSIONS {
            let actions =
                [uniform, normal_heavy, scarce].map(|model| first_action(&case, version, model));
            let entry = stats.get_mut(&version).unwrap();
            entry.sampled_cases += 1;
            if actions[0] != actions[1] || actions[0] != actions[2] {
                entry.action_changes += 1;
                entry.first.get_or_insert_with(|| {
                    format!(
                        "{}|step:{}|condition:{}|uniform:{}|normal-heavy:{}|scarce:{}",
                        case.rollout.case_id,
                        case.rollout.initial_state.step,
                        case.rollout.initial_state.condition,
                        action_name(actions[0]),
                        action_name(actions[1]),
                        action_name(actions[2]),
                    )
                });
            }
        }
    }
    if total_cases == 0 {
        eprintln!(
            "condition weight boundary audit requires at least one generic episode case on stdin"
        );
        std::process::exit(2);
    }
    println!("version\tsampled_cases\taction_changes\tfirst_change");
    for &version in VERSIONS {
        let entry = &stats[&version];
        println!(
            "{}\t{}\t{}\t{}",
            version,
            entry.sampled_cases,
            entry.action_changes,
            entry.first.as_deref().unwrap_or("-"),
        );
    }
}
