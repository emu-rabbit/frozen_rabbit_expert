use std::env;
use std::io::{self, Read};
use std::process::ExitCode;
use std::time::Instant;

use frozen_rabbit_craft_kernel::research::{
    CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION, GENERIC_EPISODE_MAX_OUTPUT_BYTES,
    PortfolioEvaluationBudget, RolloutStopReason, candidate_teacher_episode_identity,
    execute_generic_episode_with_portfolio_budget, format_candidate_teacher_episode_error,
    format_candidate_teacher_episode_outcome_signature, format_candidate_teacher_episode_result,
    generic_episode_rows_fnv1a64, parse_generic_episode_case, validate_generic_episode_batch,
};

fn parse_usize_arg(name: &str, default: usize) -> Result<usize, String> {
    let prefix = format!("--{name}=");
    match env::args()
        .skip(1)
        .find_map(|argument| argument.strip_prefix(&prefix).map(|value| value.to_owned()))
    {
        Some(value) => value
            .parse::<usize>()
            .map_err(|_| format!("{name} must be an unsigned integer")),
        None => Ok(default),
    }
}

fn main() -> ExitCode {
    let samples = match parse_usize_arg("samples", 32) {
        Ok(value) => value,
        Err(error) => {
            println!(
                "{}",
                format_candidate_teacher_episode_error("__batch__", &error)
            );
            return ExitCode::from(2);
        }
    };
    let horizon = match parse_usize_arg("horizon", 64) {
        Ok(value) => value,
        Err(error) => {
            println!(
                "{}",
                format_candidate_teacher_episode_error("__batch__", &error)
            );
            return ExitCode::from(2);
        }
    };
    let budget = match PortfolioEvaluationBudget::new(samples, horizon) {
        Ok(value) => value,
        Err(error) => {
            println!(
                "{}",
                format_candidate_teacher_episode_error("__batch__", &error)
            );
            return ExitCode::from(2);
        }
    };

    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        println!(
            "{}",
            format_candidate_teacher_episode_error(
                "__batch__",
                &format!("failed to read stdin: {error}"),
            )
        );
        return ExitCode::from(2);
    }
    let lines = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        println!(
            "{}",
            format_candidate_teacher_episode_error(
                "__batch__",
                "teacher episode input must not be empty",
            )
        );
        return ExitCode::from(2);
    }
    let mut cases = Vec::with_capacity(lines.len());
    for line in lines {
        match parse_generic_episode_case(line) {
            Ok(case) => cases.push(case),
            Err(error) => {
                println!(
                    "{}",
                    format_candidate_teacher_episode_error(&error.case_id, &error.message)
                );
                return ExitCode::from(2);
            }
        }
    }
    if let Err(error) = validate_generic_episode_batch(&cases) {
        println!(
            "{}",
            format_candidate_teacher_episode_error("__batch__", &error)
        );
        return ExitCode::from(2);
    }

    let started = Instant::now();
    let mut rows = Vec::with_capacity(cases.len());
    let mut outcome_signatures = Vec::with_capacity(cases.len());
    let mut transitions = 0_u64;
    let mut completed = 0_usize;
    let mut failed = 0_usize;
    let mut action_limit = 0_usize;
    let mut policy_null = 0_usize;
    let mut illegal_action = 0_usize;
    let mut no_legal_action = 0_usize;
    for case in &cases {
        match execute_generic_episode_with_portfolio_budget(case, budget) {
            Ok(result) => {
                transitions = transitions.saturating_add(result.actions.len() as u64);
                match result.stop_reason {
                    RolloutStopReason::Completed => completed += 1,
                    RolloutStopReason::Failed => failed += 1,
                    RolloutStopReason::ActionLimit => action_limit += 1,
                    RolloutStopReason::PolicyNull => policy_null += 1,
                    RolloutStopReason::IllegalAction => illegal_action += 1,
                    RolloutStopReason::NoLegalAction => no_legal_action += 1,
                }
                outcome_signatures.push(format_candidate_teacher_episode_outcome_signature(
                    &result, budget,
                ));
                rows.push(format_candidate_teacher_episode_result(&result, budget));
            }
            Err(error) => {
                println!(
                    "{}",
                    format_candidate_teacher_episode_error(&case.rollout.case_id, &error)
                );
                return ExitCode::from(2);
            }
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    let output_bytes = rows.iter().map(|row| row.len() + 1).sum::<usize>();
    if output_bytes > GENERIC_EPISODE_MAX_OUTPUT_BYTES {
        println!(
            "{}",
            format_candidate_teacher_episode_error(
                "__batch__",
                &format!(
                    "teacher episode output bytes {output_bytes} exceed {GENERIC_EPISODE_MAX_OUTPUT_BYTES}"
                ),
            )
        );
        return ExitCode::from(2);
    }
    let outcome_hash = generic_episode_rows_fnv1a64(&outcome_signatures);
    for row in rows {
        println!("{row}");
    }
    println!(
        "{}",
        [
            CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION.to_owned(),
            "__batch__".to_owned(),
            "summary".to_owned(),
            "ok".to_owned(),
            candidate_teacher_episode_identity(budget),
            cases.len().to_string(),
            transitions.to_string(),
            completed.to_string(),
            failed.to_string(),
            action_limit.to_string(),
            policy_null.to_string(),
            illegal_action.to_string(),
            no_legal_action.to_string(),
            kernel_ns.to_string(),
            output_bytes.to_string(),
            samples.to_string(),
            horizon.to_string(),
            format!("{outcome_hash:016x}"),
        ]
        .join("\t")
    );
    ExitCode::SUCCESS
}
