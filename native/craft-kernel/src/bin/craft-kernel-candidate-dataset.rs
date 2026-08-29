use std::io::{self, Read};
use std::process::ExitCode;

use frozen_rabbit_craft_kernel::{
    CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION, CANDIDATE_DATASET_MAX_OUTPUT_BYTES,
    CANDIDATE_DATASET_SCHEMA_VERSION, GENERIC_EPISODE_PROTOCOL_VERSION,
    candidate_dataset_candidate_header, candidate_dataset_decision_header,
    candidate_dataset_rows_fnv1a64, execute_candidate_dataset_episode_with_ordinal,
    parse_generic_episode_case, validate_generic_episode_batch,
};

fn format_error(case_id: &str, message: &str) -> String {
    [
        CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION.to_owned(),
        case_id.replace(['\t', '\r', '\n'], " "),
        "error".to_owned(),
        message.replace(['\t', '\r', '\n'], " "),
    ]
    .join("\t")
}

fn main() -> ExitCode {
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
    if lines.len() == 1
        && lines[0].split('\t').collect::<Vec<_>>()
            == [
                CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION,
                "__handshake__",
                "handshake",
            ]
    {
        println!(
            "{}",
            [
                CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION.to_owned(),
                "__handshake__".to_owned(),
                "handshake".to_owned(),
                "ok".to_owned(),
                CANDIDATE_DATASET_SCHEMA_VERSION.to_owned(),
                GENERIC_EPISODE_PROTOCOL_VERSION.to_owned(),
                candidate_dataset_decision_header().replace('\t', ","),
                candidate_dataset_candidate_header().replace('\t', ","),
            ]
            .join("\t")
        );
        return ExitCode::SUCCESS;
    }
    if lines.is_empty() {
        println!(
            "{}",
            format_error("__batch__", "candidate dataset input must not be empty")
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
    if let Err(message) = validate_generic_episode_batch(&cases) {
        println!("{}", format_error("__batch__", &message));
        return ExitCode::from(2);
    }

    let mut rows = Vec::new();
    let mut decision_count = 0_usize;
    let mut candidate_count = 0_usize;
    for (index, case) in cases.iter().enumerate() {
        let example_ordinal = u32::try_from(index).expect("batch validation caps the case count");
        let export = match execute_candidate_dataset_episode_with_ordinal(case, example_ordinal) {
            Ok(export) => export,
            Err(message) => {
                println!("{}", format_error("__batch__", &message));
                return ExitCode::from(2);
            }
        };
        decision_count = decision_count.saturating_add(export.decisions.len());
        candidate_count = candidate_count.saturating_add(
            export
                .decisions
                .iter()
                .map(|record| record.candidate_rows.len())
                .sum::<usize>(),
        );
        rows.extend(export.rows());
    }
    let output_bytes = rows.iter().map(|row| row.len() + 1).sum::<usize>();
    if output_bytes > CANDIDATE_DATASET_MAX_OUTPUT_BYTES {
        println!(
            "{}",
            format_error(
                "__batch__",
                &format!(
                    "candidate dataset output bytes {output_bytes} exceed {CANDIDATE_DATASET_MAX_OUTPUT_BYTES}"
                )
            )
        );
        return ExitCode::from(2);
    }
    let hash = candidate_dataset_rows_fnv1a64(&rows);
    for row in rows {
        println!("{row}");
    }
    println!(
        "{}\t__batch__\tsummary\tok\t{}\t{}\t{}\t{}\t{:016x}",
        CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION,
        cases.len(),
        decision_count,
        candidate_count,
        output_bytes,
        hash
    );
    ExitCode::SUCCESS
}
