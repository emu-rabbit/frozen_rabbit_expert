//! Research-only initial candidate inventory; does not alter solver behavior.
use frozen_rabbit_craft_kernel::research::*;
use std::io::{self, BufRead};

fn main() {
    for line in io::stdin().lock().lines() {
        let case = parse_generic_episode_case(&line.unwrap()).unwrap();
        let context = PlannerContext {
            action_limit: case.rollout.max_steps,
            ..PlannerContext::default()
        };
        let report = recommend_portfolio_version(
            GenericSolverVersion::ExperimentalPortfolio,
            &case.rollout.recipe,
            &case.rollout.crafter,
            &case.rollout.initial_state,
            case.objective,
            case.risk,
            &context,
            Some(case.random_condition_mask),
        );
        for c in report.candidates {
            println!(
                "{}\t{}\t{:?}\t{}\t{:.6}\t{:.6}\t{}\t{}",
                case.rollout.case_id,
                c.proposal.decision.action,
                c.proposal.sources,
                c.proposal
                    .continuation_actions
                    .iter()
                    .map(|a| a.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
                c.delivered_quality_utility,
                c.selection_score,
                c.completion_probability,
                c.forecast_samples
            );
        }
    }
}
