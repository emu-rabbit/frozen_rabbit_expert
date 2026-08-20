use std::io::{self, Read};
use std::process::ExitCode;
use std::time::Instant;

use frozen_rabbit_craft_kernel::{
    ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, execute_adaptive_policy_matrix,
    format_adaptive_policy_matrix_output, parse_adaptive_policy_matrix_request,
};

fn sanitized(message: &str) -> String {
    message.replace(['\t', '\r', '\n'], " ")
}

fn error(case_id: &str, message: &str) -> ExitCode {
    println!(
        "{ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION}\t{case_id}\terror\terror\t{}",
        sanitized(message)
    );
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let mut input = String::new();
    if let Err(io_error) = io::stdin().read_to_string(&mut input) {
        return error("__batch__", &format!("failed to read stdin: {io_error}"));
    }
    let request = match parse_adaptive_policy_matrix_request(&input) {
        Ok(request) => request,
        Err(parse_error) => return error(&parse_error.case_id, &parse_error.message),
    };
    let started = Instant::now();
    let outcomes = match execute_adaptive_policy_matrix(&request) {
        Ok(outcomes) => outcomes,
        Err(message) => return error("__batch__", &message),
    };
    let kernel_ns = started.elapsed().as_nanos();
    let output = match format_adaptive_policy_matrix_output(&request.program, &outcomes, kernel_ns)
    {
        Ok(output) => output,
        Err(message) => return error("__batch__", &message),
    };
    print!("{output}");
    ExitCode::SUCCESS
}
