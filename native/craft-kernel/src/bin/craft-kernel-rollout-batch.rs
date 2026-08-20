use std::io::{self, Read};
use std::time::Instant;

use frozen_rabbit_craft_kernel::{
    ROLLOUT_BATCH_PROTOCOL_VERSION, RolloutResponse, benchmark_rollout_requests,
    format_rollout_response, parse_rollout_request, process_rollout_request,
};

const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

fn hash_bytes(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

fn sanitized(message: &str) -> String {
    message.replace(['\t', '\r', '\n'], " ")
}

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;

    let input_lines: Vec<_> = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    if let Some(header) = input_lines.first() {
        let header_cells: Vec<_> = header.split('\t').collect();
        if header_cells.get(2) == Some(&"benchmark") {
            if header_cells.len() != 4
                || header_cells[0] != ROLLOUT_BATCH_PROTOCOL_VERSION
                || header_cells[1] != "__batch__"
            {
                println!(
                    "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\terror\tinvalid benchmark header"
                );
                return Ok(());
            }
            let repetitions = match header_cells[3].parse::<u64>() {
                Ok(value) => value,
                Err(error) => {
                    println!(
                        "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\terror\tinvalid repetitions: {error}"
                    );
                    return Ok(());
                }
            };
            let mut requests = Vec::with_capacity(input_lines.len().saturating_sub(1));
            for line in &input_lines[1..] {
                match parse_rollout_request(line) {
                    Ok(request) => requests.push(request),
                    Err(error) => {
                        println!(
                            "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\terror\tcase {}: {}",
                            error.case_id,
                            sanitized(&error.message)
                        );
                        return Ok(());
                    }
                }
            }
            match benchmark_rollout_requests(&requests, repetitions) {
                Ok(result) => println!(
                    "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\tok\t{}\t{}\t{}\t{}\t{}\t{:08x}",
                    result.repetitions,
                    result.cases,
                    result.operations,
                    result.transitions,
                    result.kernel_ns,
                    result.hash
                ),
                Err(error) => println!(
                    "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\terror\t{}",
                    sanitized(&error)
                ),
            }
            return Ok(());
        }
    }

    let started = Instant::now();
    let mut output_lines = Vec::new();
    let mut operations = 0_usize;
    let mut transitions = 0_usize;
    let mut hash = FNV_OFFSET_BASIS;
    for line in input_lines {
        let response = match parse_rollout_request(line) {
            Ok(request) => process_rollout_request(request),
            Err(error) => RolloutResponse::Error {
                case_id: error.case_id,
                message: error.message,
            },
        };
        if let RolloutResponse::Rollout(result) = &response {
            operations += 1;
            transitions += result.transition_count();
        }
        let output = format_rollout_response(&response);
        hash = hash_bytes(hash, output.as_bytes());
        hash = hash_bytes(hash, b"\n");
        output_lines.push(output);
    }
    let kernel_ns = started.elapsed().as_nanos();

    for line in output_lines {
        println!("{line}");
    }
    println!(
        "{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tsummary\tok\t{operations}\t{transitions}\t{kernel_ns}\t{hash:016x}"
    );
    Ok(())
}
