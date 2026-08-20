use std::io::{self, Read};
use std::process::ExitCode;
use std::time::Instant;

use frozen_rabbit_craft_kernel::{
    ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES, ROOT_PLAN_MATRIX_PROTOCOL_VERSION, RootPlanTraceMode,
    benchmark_root_plan_matrices, execute_root_plan_matrix, format_root_plan_matrix_outcome,
    parse_root_plan_matrix_request, validate_root_plan_matrix_batch,
};

const FNV64_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
const FNV64_PRIME: u64 = 0x0000_0100_0000_01b3;

fn hash_bytes(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV64_PRIME);
    }
    hash
}

fn sanitized(message: &str) -> String {
    message.replace(['\t', '\r', '\n'], " ")
}

fn error(case_id: &str, message: &str) -> ExitCode {
    println!(
        "{ROOT_PLAN_MATRIX_PROTOCOL_VERSION}\t{case_id}\terror\terror\t{}",
        sanitized(message)
    );
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let mut input = String::new();
    if let Err(io_error) = io::stdin().read_to_string(&mut input) {
        return error("__batch__", &format!("failed to read stdin: {io_error}"));
    }
    let input_lines: Vec<_> = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    if input_lines.is_empty() {
        return error("__batch__", "root-plan input must not be empty");
    }

    let mut repetitions = None;
    let request_lines = if input_lines[0].split('\t').nth(2) == Some("benchmark") {
        let header: Vec<_> = input_lines[0].split('\t').collect();
        if header.len() != 4
            || header[0] != ROOT_PLAN_MATRIX_PROTOCOL_VERSION
            || header[1] != "__batch__"
        {
            return error("__batch__", "invalid root-plan benchmark header");
        }
        match header[3].parse::<u64>() {
            Ok(value) if value > 0 => repetitions = Some(value),
            Ok(_) => return error("__batch__", "benchmark repetitions must be positive"),
            Err(parse_error) => {
                return error(
                    "__batch__",
                    &format!("invalid benchmark repetitions: {parse_error}"),
                );
            }
        }
        &input_lines[1..]
    } else {
        &input_lines[..]
    };
    if request_lines.is_empty() {
        return error(
            "__batch__",
            "root-plan batch must contain at least one request",
        );
    }

    // Parse the entire batch before executing any case. A malformed later row
    // therefore cannot produce partial evidence from earlier rows.
    let mut requests = Vec::with_capacity(request_lines.len());
    for line in request_lines {
        match parse_root_plan_matrix_request(line) {
            Ok(request) => requests.push(request),
            Err(parse_error) => return error(&parse_error.case_id, &parse_error.message),
        }
    }

    if let Some(repetitions) = repetitions {
        return match benchmark_root_plan_matrices(&requests, repetitions) {
            Ok(result) => {
                println!(
                    "{ROOT_PLAN_MATRIX_PROTOCOL_VERSION}\t__batch__\tbenchmark\tok\t{}\t{}\t{}\t{}\t{}\t{:08x}",
                    result.repetitions,
                    result.requests,
                    result.operations,
                    result.transitions,
                    result.kernel_ns,
                    result.hash,
                );
                ExitCode::SUCCESS
            }
            Err(message) => error("__batch__", &message),
        };
    }

    if let Err(message) = validate_root_plan_matrix_batch(&requests) {
        return error("__batch__", &message);
    }

    let started = Instant::now();
    let mut output_lines = Vec::new();
    let mut operations = 0_usize;
    let mut transitions = 0_usize;
    for request in &requests {
        let outcomes = match execute_root_plan_matrix(request) {
            Ok(outcomes) => outcomes,
            Err(message) => return error(&request.case_id, &message),
        };
        for outcome in outcomes {
            operations += 1;
            transitions += outcome.rollout.steps.len();
            output_lines.push(format_root_plan_matrix_outcome(
                &outcome,
                request.trace_mode == RootPlanTraceMode::FullTrace,
            ));
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    let mut output_hash = FNV64_OFFSET_BASIS;
    for line in &output_lines {
        output_hash = hash_bytes(output_hash, line.as_bytes());
        output_hash = hash_bytes(output_hash, b"\n");
    }
    let summary = format!(
        "{ROOT_PLAN_MATRIX_PROTOCOL_VERSION}\t__batch__\tsummary\tok\t{}\t{operations}\t{transitions}\t{kernel_ns}\t{output_hash:016x}",
        requests.len(),
    );
    let actual_output_bytes =
        output_lines
            .iter()
            .try_fold((summary.len() + 1) as u64, |total, line| {
                total
                    .checked_add((line.len() + 1) as u64)
                    .ok_or("root-plan actual output byte count overflow")
            });
    match actual_output_bytes {
        Ok(bytes) if bytes <= ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES => {}
        Ok(bytes) => {
            return error(
                "__batch__",
                &format!(
                    "root-plan actual output bytes {bytes} exceed {ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES}"
                ),
            );
        }
        Err(message) => return error("__batch__", message),
    }
    for line in &output_lines {
        println!("{line}");
    }
    println!("{summary}");
    ExitCode::SUCCESS
}
