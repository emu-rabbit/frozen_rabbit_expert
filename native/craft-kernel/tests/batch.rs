use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    BATCH_PROTOCOL_VERSION, BatchRequest, BatchResponse, benchmark_batch_requests,
    format_batch_response, parse_batch_request, process_batch_request,
};

fn common(command: &str, case_id: &str) -> Vec<String> {
    vec![
        BATCH_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        command.to_owned(),
        // Recipe: 10 fields.
        "36282".to_owned(),
        "746".to_owned(),
        "7300".to_owned(),
        "18900".to_owned(),
        "18900".to_owned(),
        "30".to_owned(),
        "180".to_owned(),
        "180".to_owned(),
        "100".to_owned(),
        "100".to_owned(),
        // Crafter: 6 fields.
        "100".to_owned(),
        "5380".to_owned(),
        "5000".to_owned(),
        "620".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        // State: 24 fields.
        "1".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "30".to_owned(),
        "620".to_owned(),
        "normal".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "-".to_owned(),
        "1".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        "none".to_owned(),
        "-".to_owned(),
        // Action.
        "basicSynthesis".to_owned(),
    ]
}

#[test]
fn protocol_has_fixed_input_and_output_arities() {
    let preview_line = common("preview", "preview-1").join("\t");
    assert_eq!(preview_line.split('\t').count(), 44);
    let request = parse_batch_request(&preview_line).expect("valid preview request");
    assert!(matches!(request, BatchRequest::Preview(_)));
    let output = format_batch_response(&process_batch_request(request));
    assert_eq!(output.split('\t').count(), 11);

    let mut apply = common("apply", "apply-1");
    apply.extend(["1".to_owned(), "good".to_owned()]);
    assert_eq!(apply.len(), 46);
    let output = format_batch_response(&process_batch_request(
        parse_batch_request(&apply.join("\t")).expect("valid apply request"),
    ));
    assert_eq!(output.split('\t').count(), 42);
    let output_cells: Vec<_> = output.split('\t').collect();
    assert_eq!(&output_cells[11..13], &["1", "good"]);
    assert_eq!(&output_cells[38..42], &["-", "-", "-", "-"]);

    let mut simulate = common("simulate", "simulate-1");
    simulate.extend([
        "123".to_owned(),
        "2".to_owned(),
        "3".to_owned(),
        "1".to_owned(),
        "1".to_owned(),
        "0".to_owned(),
        "1".to_owned(),
        "1".to_owned(),
        "1".to_owned(),
        "1".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
    ]);
    assert_eq!(simulate.len(), 56);
    let output = format_batch_response(&process_batch_request(
        parse_batch_request(&simulate.join("\t")).expect("valid simulate request"),
    ));
    assert_eq!(output.split('\t').count(), 42);
    let output_cells: Vec<_> = output.split('\t').collect();
    assert_eq!(&output_cells[38..40], &["2", "3"]);
    assert_eq!(&output_cells[40..42], &["3", "4"]);
}

#[test]
fn parser_fails_closed_on_wrong_arity_and_version() {
    let mut missing = common("preview", "missing");
    missing.pop();
    assert!(parse_batch_request(&missing.join("\t")).is_err());

    let mut extra = common("preview", "extra");
    extra.push("unexpected".to_owned());
    assert!(parse_batch_request(&extra.join("\t")).is_err());

    let mut wrong_version = common("preview", "version");
    wrong_version[0] = "native-transition-batch-v0".to_owned();
    assert!(parse_batch_request(&wrong_version.join("\t")).is_err());
}

#[test]
fn illegal_apply_returns_an_explicit_error_row() {
    let mut apply = common("apply", "illegal");
    apply[41] = "completed".to_owned();
    apply.extend(["1".to_owned(), "normal".to_owned()]);
    let response = process_batch_request(
        parse_batch_request(&apply.join("\t")).expect("request itself is well formed"),
    );
    assert!(matches!(response, BatchResponse::Error { .. }));
    let output = format_batch_response(&response);
    assert!(output.contains("\terror\tIllegal action basicSynthesis: terminal"));
}

#[test]
fn binary_processes_a_whole_batch_and_appends_timing_and_hash_summary() {
    let ping = format!("{BATCH_PROTOCOL_VERSION}\tping-1\tping\n");
    let preview = format!("{}\n", common("preview", "preview-1").join("\t"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-batch"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("batch binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(format!("{ping}{preview}").as_bytes())
        .expect("batch input writes");
    let output = child.wait_with_output().expect("batch binary exits");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines: Vec<_> = stdout.lines().collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(
        lines[0],
        format!("{BATCH_PROTOCOL_VERSION}\tping-1\tping\tok")
    );
    let summary: Vec<_> = lines[2].split('\t').collect();
    assert_eq!(
        &summary[..5],
        &[BATCH_PROTOCOL_VERSION, "__batch__", "summary", "ok", "2"]
    );
    assert!(summary[5].parse::<u128>().is_ok());
    assert_eq!(summary[6].len(), 16);
}

#[test]
fn summary_only_benchmark_is_deterministic_and_counts_core_operations() {
    let preview = parse_batch_request(&common("preview", "preview-1").join("\t"))
        .expect("valid preview request");
    let mut apply_cells = common("apply", "apply-1");
    apply_cells.extend(["1".to_owned(), "good".to_owned()]);
    let apply = parse_batch_request(&apply_cells.join("\t")).expect("valid apply request");
    let requests = [preview, apply];

    let first = benchmark_batch_requests(&requests, 25).expect("benchmark succeeds");
    let second = benchmark_batch_requests(&requests, 25).expect("benchmark repeats");
    assert_eq!(first.operations, 50);
    assert_eq!(first.cases, 2);
    assert_eq!(first.repetitions, 25);
    assert_eq!(first.hash, second.hash);
}

#[test]
fn binary_benchmark_header_returns_only_the_core_summary() {
    let header = format!("{BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\t100\n");
    let preview = format!("{}\n", common("preview", "preview-1").join("\t"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-batch"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("batch binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(format!("{header}{preview}").as_bytes())
        .expect("benchmark input writes");
    let output = child.wait_with_output().expect("batch binary exits");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines: Vec<_> = stdout.lines().collect();
    assert_eq!(lines.len(), 1);
    let summary: Vec<_> = lines[0].split('\t').collect();
    assert_eq!(
        &summary[..7],
        &[
            BATCH_PROTOCOL_VERSION,
            "__batch__",
            "benchmark",
            "ok",
            "100",
            "1",
            "100",
        ]
    );
    assert!(summary[7].parse::<u128>().is_ok());
    assert_eq!(summary[8].len(), 8);
}
