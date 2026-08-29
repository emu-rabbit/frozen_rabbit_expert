use std::env;
use std::io::{self, Read};
use std::process::ExitCode;

use frozen_rabbit_craft_kernel::{
    CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION, PortfolioEvaluationBudget,
    candidate_dataset_rows_fnv1a64, execute_candidate_teacher_preference_episode,
    parse_generic_episode_case, validate_generic_episode_batch,
};

fn format_error(message: &str) -> String {
    [
        CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION.to_owned(),
        "error".to_owned(),
        message.replace(['\t', '\r', '\n'], " "),
    ]
    .join("\t")
}

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
    let low_samples = match parse_usize_arg("low-samples", 16) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error(&error));
            return ExitCode::from(2);
        }
    };
    let high_samples = match parse_usize_arg("high-samples", 32) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error(&error));
            return ExitCode::from(2);
        }
    };
    let horizon = match parse_usize_arg("horizon", 64) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error(&error));
            return ExitCode::from(2);
        }
    };
    let low_budget = match PortfolioEvaluationBudget::new(low_samples, horizon) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error(&error));
            return ExitCode::from(2);
        }
    };
    let high_budget = match PortfolioEvaluationBudget::new(high_samples, horizon) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error(&error));
            return ExitCode::from(2);
        }
    };

    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        println!(
            "{}",
            format_error(&format!("failed to read stdin: {error}"))
        );
        return ExitCode::from(2);
    }
    let lines = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        println!("{}", format_error("teacher probe input must not be empty"));
        return ExitCode::from(2);
    }
    let mut cases = Vec::with_capacity(lines.len());
    for line in lines {
        match parse_generic_episode_case(line) {
            Ok(case) => cases.push(case),
            Err(error) => {
                println!("{}", format_error(&error.message));
                return ExitCode::from(2);
            }
        }
    }
    if let Err(error) = validate_generic_episode_batch(&cases) {
        println!("{}", format_error(&error));
        return ExitCode::from(2);
    }

    let mut rows = Vec::new();
    let mut multi_candidate = 0_usize;
    let mut low_high_candidate_agree = 0_usize;
    let mut low_high_action_agree = 0_usize;
    let mut baseline_high_candidate_agree = 0_usize;
    let mut baseline_high_action_agree = 0_usize;
    let mut low_transitions = 0_usize;
    let mut high_transitions = 0_usize;
    for (index, case) in cases.iter().enumerate() {
        let example_ordinal = u32::try_from(index).expect("batch validation caps case count");
        let export = match execute_candidate_teacher_preference_episode(
            case,
            example_ordinal,
            low_budget,
            high_budget,
        ) {
            Ok(value) => value,
            Err(error) => {
                println!("{}", format_error(&error));
                return ExitCode::from(2);
            }
        };
        for record in export.records {
            if record.candidate_count > 1 {
                multi_candidate += 1;
                low_high_candidate_agree += usize::from(record.low_high_candidate_agree());
                low_high_action_agree += usize::from(record.low_high_action_agree());
                baseline_high_candidate_agree +=
                    usize::from(record.baseline_high_candidate_agree());
                baseline_high_action_agree += usize::from(record.baseline_high_action_agree());
            }
            low_transitions = low_transitions.saturating_add(record.low_projected_transitions);
            high_transitions = high_transitions.saturating_add(record.high_projected_transitions);
            rows.push(record.format_row());
        }
    }
    let hash = candidate_dataset_rows_fnv1a64(&rows);
    for row in &rows {
        println!("{row}");
    }
    println!(
        "{}",
        [
            CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION.to_owned(),
            "summary".to_owned(),
            "ok".to_owned(),
            cases.len().to_string(),
            rows.len().to_string(),
            multi_candidate.to_string(),
            low_high_candidate_agree.to_string(),
            low_high_action_agree.to_string(),
            baseline_high_candidate_agree.to_string(),
            baseline_high_action_agree.to_string(),
            low_transitions.to_string(),
            high_transitions.to_string(),
            low_samples.to_string(),
            high_samples.to_string(),
            horizon.to_string(),
            format!("{hash:016x}"),
        ]
        .join("\t")
    );
    ExitCode::SUCCESS
}
