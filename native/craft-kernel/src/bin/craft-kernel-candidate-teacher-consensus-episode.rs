use std::env;
use std::io::{self, Read};
use std::process::ExitCode;
use std::time::Instant;

use frozen_rabbit_craft_kernel::research::{
    CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION, CandidateTeacherConsensusConfig,
    GENERIC_EPISODE_MAX_OUTPUT_BYTES, PortfolioEvaluationBudget, RolloutStopReason,
    candidate_teacher_consensus_identity, execute_candidate_teacher_consensus_episode,
    format_candidate_teacher_consensus_episode_error,
    format_candidate_teacher_consensus_episode_result,
    format_candidate_teacher_consensus_outcome_signature, generic_episode_rows_fnv1a64,
    parse_generic_episode_case, validate_generic_episode_batch,
};

fn find_arg(name: &str) -> Option<String> {
    let prefix = format!("--{name}=");
    env::args()
        .skip(1)
        .find_map(|argument| argument.strip_prefix(&prefix).map(str::to_owned))
}

fn parse_usize_arg(name: &str, default: usize) -> Result<usize, String> {
    find_arg(name).map_or(Ok(default), |value| {
        value
            .parse::<usize>()
            .map_err(|_| format!("{name} must be an unsigned integer"))
    })
}

fn parse_f64_arg(name: &str, default: f64) -> Result<f64, String> {
    find_arg(name).map_or(Ok(default), |value| {
        value
            .parse::<f64>()
            .map_err(|_| format!("{name} must be a number"))
    })
}

fn format_error(case_id: &str, message: &str) -> String {
    format_candidate_teacher_consensus_episode_error(case_id, message)
}

fn main() -> ExitCode {
    let low_samples = match parse_usize_arg("low-samples", 32) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let high_samples = match parse_usize_arg("high-samples", 64) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let horizon = match parse_usize_arg("horizon", 64) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let standard_errors = match parse_f64_arg("standard-errors", 2.0) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let minimum_gain = match parse_f64_arg("minimum-gain", 0.0) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let low_budget = match PortfolioEvaluationBudget::new(low_samples, horizon) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let high_budget = match PortfolioEvaluationBudget::new(high_samples, horizon) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };
    let config = match CandidateTeacherConsensusConfig::new(
        low_budget,
        high_budget,
        standard_errors,
        minimum_gain,
    ) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", format_error("__batch__", &error));
            return ExitCode::from(2);
        }
    };

    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        println!(
            "{}",
            format_error("__batch__", &format!("failed to read stdin: {error}"))
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
            format_error("__batch__", "consensus teacher input must not be empty")
        );
        return ExitCode::from(2);
    }
    let mut cases = Vec::with_capacity(lines.len());
    for line in lines {
        match parse_generic_episode_case(line) {
            Ok(case) => cases.push(case),
            Err(error) => {
                println!("{}", format_error(&error.case_id, &error.message));
                return ExitCode::from(2);
            }
        }
    }
    if let Err(error) = validate_generic_episode_batch(&cases) {
        println!("{}", format_error("__batch__", &error));
        return ExitCode::from(2);
    }

    let started = Instant::now();
    let mut rows = Vec::with_capacity(cases.len());
    let mut outcomes = Vec::with_capacity(cases.len());
    let mut transitions = 0_u64;
    let mut completed = 0_usize;
    let mut failed = 0_usize;
    let mut action_limit = 0_usize;
    let mut policy_null = 0_usize;
    let mut illegal_action = 0_usize;
    let mut no_legal_action = 0_usize;
    let mut consensus_counts =
        frozen_rabbit_craft_kernel::research::CandidateTeacherConsensusCounts::default();
    for case in &cases {
        match execute_candidate_teacher_consensus_episode(case, config) {
            Ok(export) => {
                transitions = transitions.saturating_add(export.episode.actions.len() as u64);
                match export.episode.stop_reason {
                    RolloutStopReason::Completed => completed += 1,
                    RolloutStopReason::Failed => failed += 1,
                    RolloutStopReason::ActionLimit => action_limit += 1,
                    RolloutStopReason::PolicyNull => policy_null += 1,
                    RolloutStopReason::IllegalAction => illegal_action += 1,
                    RolloutStopReason::NoLegalAction => no_legal_action += 1,
                }
                consensus_counts.reference_agreement += export.counts.reference_agreement;
                consensus_counts.teacher_disagreement += export.counts.teacher_disagreement;
                consensus_counts.insufficient_paired_gain += export.counts.insufficient_paired_gain;
                consensus_counts.overrides += export.counts.overrides;
                consensus_counts.unavailable += export.counts.unavailable;
                outcomes.push(format_candidate_teacher_consensus_outcome_signature(
                    &export.episode,
                    config,
                ));
                rows.push(format_candidate_teacher_consensus_episode_result(
                    &export.episode,
                    config,
                ));
            }
            Err(error) => {
                println!("{}", format_error(&case.rollout.case_id, &error));
                return ExitCode::from(2);
            }
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    let output_bytes = rows.iter().map(|row| row.len() + 1).sum::<usize>();
    if output_bytes > GENERIC_EPISODE_MAX_OUTPUT_BYTES {
        println!(
            "{}",
            format_error(
                "__batch__",
                &format!(
                    "consensus teacher output bytes {output_bytes} exceed {GENERIC_EPISODE_MAX_OUTPUT_BYTES}"
                ),
            )
        );
        return ExitCode::from(2);
    }
    let outcome_hash = generic_episode_rows_fnv1a64(&outcomes);
    for row in rows {
        println!("{row}");
    }
    println!(
        "{}",
        [
            CANDIDATE_TEACHER_CONSENSUS_EPISODE_PROTOCOL_VERSION.to_owned(),
            "__batch__".to_owned(),
            "summary".to_owned(),
            "ok".to_owned(),
            candidate_teacher_consensus_identity(config),
            cases.len().to_string(),
            transitions.to_string(),
            completed.to_string(),
            failed.to_string(),
            action_limit.to_string(),
            policy_null.to_string(),
            illegal_action.to_string(),
            no_legal_action.to_string(),
            consensus_counts.reference_agreement.to_string(),
            consensus_counts.teacher_disagreement.to_string(),
            consensus_counts.insufficient_paired_gain.to_string(),
            consensus_counts.overrides.to_string(),
            consensus_counts.unavailable.to_string(),
            kernel_ns.to_string(),
            output_bytes.to_string(),
            low_samples.to_string(),
            high_samples.to_string(),
            horizon.to_string(),
            standard_errors.to_string(),
            minimum_gain.to_string(),
            format!("{outcome_hash:016x}"),
        ]
        .join("\t")
    );
    ExitCode::SUCCESS
}
