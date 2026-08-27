use frozen_rabbit_craft_kernel::*;
use std::{env, fs, process::ExitCode};

fn run() -> Result<(), String> {
    let path = env::args()
        .nth(1)
        .ok_or("usage: route_portfolio_diagnostics <candidate.tsv>")?;
    let input = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let cases = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| parse_generic_episode_case(line).map_err(|error| error.message))
        .collect::<Result<Vec<_>, _>>()?;
    if cases.is_empty() || cases.len() > 8 {
        return Err("diagnostics accepts 1..=8 cases".into());
    }
    validate_generic_episode_batch(&cases)?;
    if cases
        .iter()
        .any(|case| case.solver_version != GenericSolverVersion::RoutePortfolioV1)
    {
        return Err("diagnostics requires the route portfolio identity".into());
    }
    println!(
        "route-portfolio-diagnostics-v2\t{}",
        ROUTE_PORTFOLIO_POLICY_VERSION
    );
    println!(
        "kind\tcase\taction_index\taction\telapsed_ns\tproposals\tproducer_calls\tcontinuation_calls\ttransitions\tprogress\tquality\tcp\tdurability"
    );
    let mut timings = Vec::new();
    for case in cases {
        let result = execute_generic_episode_with_observer(
            &case,
            |state, context, decision, report, elapsed| {
                let report = report.expect("portfolio diagnostics");
                timings.push(elapsed);
                println!(
                    "recommendation\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    case.rollout.case_id,
                    context.action_uses,
                    decision.map_or("-", |decision| decision.action.as_str()),
                    elapsed,
                    report.work.proposals,
                    report.work.producer_calls,
                    report.work.continuation_calls,
                    report.work.projected_transitions,
                    state.progress,
                    state.quality,
                    state.cp,
                    state.durability
                );
                for entry in &report.candidates {
                    println!(
                        "candidate\t{}\t{}\t{}\tselected={}\tscore={:.8}\tcompletion={:.8}\tquality={:.8}\tundelivered_potential={:.8}\tactions={:.3}\troute={:?}\tsources={:?}\tsuccess={:?}\tfailure={:?}\tselection_score={:.8}\tsamples={}\thorizon={}",
                        case.rollout.case_id,
                        context.action_uses,
                        entry.proposal.decision.action,
                        decision == Some(entry.proposal.decision),
                        entry.score,
                        entry.completion_probability,
                        entry.delivered_quality_utility,
                        entry.unfinished_potential,
                        entry.expected_actions,
                        entry.proposal.decision.route,
                        entry.proposal.sources,
                        entry.success.completion,
                        entry
                            .failure
                            .as_ref()
                            .map(|branch| (branch.probability, branch.completion)),
                        entry.selection_score,
                        entry.forecast_samples,
                        entry.forecast_horizon,
                    );
                }
            },
        )?;
        println!(
            "outcome\t{}\t{}\t{}\t{}\t{}\t{}",
            case.rollout.case_id,
            result.stop_reason,
            result.final_state.progress,
            result.final_state.quality,
            result.actions.len(),
            result.planner_context.route_memory.switches
        );
    }
    timings.sort_unstable();
    if !timings.is_empty() {
        let percentile = |fraction: f64| {
            timings[((timings.len() as f64 * fraction).ceil() as usize).saturating_sub(1)]
        };
        println!(
            "timing_ns\tcalls={}\tp50={}\tp95={}\tp99={}\tmax={}",
            timings.len(),
            percentile(0.5),
            percentile(0.95),
            percentile(0.99),
            timings.last().unwrap()
        );
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
