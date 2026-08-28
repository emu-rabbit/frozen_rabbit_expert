//! Mechanics-only replay of saved solver output. Never calls a policy.
use frozen_rabbit_craft_kernel::*;
use std::{collections::BTreeMap, env, fs, process::ExitCode};

fn run() -> Result<(), String> {
    let args: Vec<_> = env::args().collect();
    if args.len() != 3 {
        return Err("usage: condition_action_audit <input.tsv> <output.tsv>".into());
    }
    let input = fs::read_to_string(&args[1]).map_err(|e| e.to_string())?;
    let output = fs::read_to_string(&args[2]).map_err(|e| e.to_string())?;
    let inputs: Vec<_> = input.lines().filter(|s| !s.is_empty()).collect();
    let outputs: Vec<_> = output
        .lines()
        .filter(|s| !s.is_empty() && !s.contains("\t__batch__\t"))
        .collect();
    if inputs.len() != outputs.len() {
        return Err("row count mismatch".into());
    }
    let mut groups = BTreeMap::<(String, u16, String, String, String, bool), usize>::new();
    let mut transitions = 0;
    for (input, output) in inputs.iter().zip(&outputs) {
        let mut case = parse_generic_episode_case(input).map_err(|e| e.message)?;
        let saved: Vec<_> = output.split('\t').collect();
        if saved.len() != 51
            || saved[1] != case.rollout.case_id
            || saved[4] != case.solver_version.as_str()
        {
            return Err("case identity mismatch".into());
        }
        case.rollout.actions = if saved[18] == "-" {
            vec![]
        } else {
            saved[18]
                .split(',')
                .map(str::parse)
                .collect::<Result<_, _>>()?
        };
        let replay = execute_rollout(&case.rollout)?;
        let formatted = format_generic_episode_result(&GenericEpisodeResult {
            case_id: replay.case_id.clone(),
            solver_version: case.solver_version,
            risk: case.risk,
            objective: case.objective,
            terminal: replay.terminal,
            stop_reason: replay.stop_reason,
            actions: replay.actions.clone(),
            final_state: replay.final_state.clone(),
            final_cursor: replay.final_cursor,
            planner_context: PlannerContext::default(),
            recommendation_calls: 0,
            recommendation_ns: 0,
            recommendation_max_ns: 0,
            recommendation_durations_ns: vec![],
            steps: vec![],
            trace_mode: GenericTraceMode::None,
        });
        let actual: Vec<_> = formatted.split('\t').collect();
        // Verify all terminal/state/cursor fields, not only the quality total.
        for column in (15..=20).chain(25..49) {
            if saved[column] != actual[column] {
                return Err(format!(
                    "replay mismatch {} column {column}: {} != {}",
                    saved[1], saved[column], actual[column]
                ));
            }
        }
        for step in &replay.steps {
            transitions += 1;
            *groups
                .entry((
                    case.objective.quality_utility_kind.as_str().into(),
                    case.random_condition_mask,
                    case.risk.to_string(),
                    step.before_state.condition.to_string(),
                    step.action.to_string(),
                    step.before_state.quality >= case.rollout.recipe.quality_max,
                ))
                .or_default() += 1;
        }
    }
    println!("verified\t{}\t{transitions}", inputs.len());
    for ((kind, mask, risk, condition, action, maximum), count) in groups {
        println!("action\t{kind}\t{mask}\t{risk}\t{condition}\t{action}\t{maximum}\t{count}");
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
