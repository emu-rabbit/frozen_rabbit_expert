use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    EpisodeRandomStream, ROLLOUT_BATCH_PROTOCOL_VERSION, RolloutResponse, RolloutStopReason,
    benchmark_rollout_requests, execute_rollout, format_rollout_response, parse_rollout_request,
    process_rollout_request,
};

const WEIGHT_START: usize = 47;
const ACTIONS_INDEX: usize = 111;

fn common(case_id: &str, max_steps: u32, actions: &str) -> Vec<String> {
    let mut cells = vec![
        ROLLOUT_BATCH_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        "rollout".to_owned(),
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
        // RNG and episode budget.
        "123".to_owned(),
        "0".to_owned(),
        "0".to_owned(),
        max_steps.to_string(),
    ];
    // Every source condition deterministically transitions to Normal.
    for _previous in 0..8 {
        cells.push("1".to_owned());
        cells.extend((0..7).map(|_| "0".to_owned()));
    }
    cells.push(actions.to_owned());
    assert_eq!(cells.len(), 112);
    cells
}

fn set_deterministic_row(cells: &mut [String], previous: usize, next: usize) {
    let start = WEIGHT_START + previous * 8;
    for offset in 0..8 {
        cells[start + offset] = if offset == next { "1" } else { "0" }.to_owned();
    }
}

#[test]
fn constant_time_rng_cursor_advance_matches_discarding_each_draw() {
    let mut iterated = EpisodeRandomStream::new(0xfeed_beef);
    for _ in 0..4_097 {
        iterated.next_condition_u32();
    }
    for _ in 0..8_193 {
        iterated.next_success_u32();
    }

    let mut advanced = EpisodeRandomStream::new(0xfeed_beef);
    advanced.advance_condition_draws(4_097);
    advanced.advance_success_draws(8_193);
    assert_eq!(advanced.next_condition_u32(), iterated.next_condition_u32());
    assert_eq!(advanced.next_success_u32(), iterated.next_success_u32());
}

#[test]
fn protocol_has_fixed_arities_and_a_complete_step_trace() {
    let cells = common("trace", 2, "reflect,observe");
    let request = parse_rollout_request(&cells.join("\t")).expect("valid rollout request");
    let response = process_rollout_request(request);
    let output = format_rollout_response(&response);
    let output_cells: Vec<_> = output.split('\t').collect();

    assert_eq!(cells.len(), 112);
    assert_eq!(output_cells.len(), 35);
    assert_eq!(
        &output_cells[..8],
        &[
            ROLLOUT_BATCH_PROTOCOL_VERSION,
            "trace",
            "rollout",
            "ok",
            "none",
            "action-limit",
            "reflect,observe",
            "2",
        ]
    );
    let trace: Vec<_> = output_cells[34].split(';').collect();
    assert_eq!(trace.len(), 2);
    assert!(trace.iter().all(|step| step.split('|').count() == 32));
    assert_eq!(trace[0].split('|').next(), Some("reflect"));
    assert!(trace[0].contains("quality-gained"));
}

#[test]
fn rollout_selects_each_previous_condition_row_and_preserves_rng_cursors() {
    let mut cells = common("matrix", 2, "basicTouch,basicTouch");
    // MaterialCondition order: Normal=0, Good=1, Malleable=6.
    set_deterministic_row(&mut cells, 0, 1);
    set_deterministic_row(&mut cells, 1, 6);
    cells[44] = "3".to_owned();
    cells[45] = "5".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("valid matrix request")
            .case,
    )
    .expect("rollout succeeds");

    assert_eq!(result.steps[0].next_condition.as_str(), "good");
    assert_eq!(result.steps[1].next_condition.as_str(), "malleable");
    assert_eq!(result.steps[0].cursor_before.condition_draws, 3);
    assert_eq!(result.steps[0].cursor_before.success_draws, 5);
    assert_eq!(result.final_cursor.condition_draws, 5);
    assert_eq!(result.final_cursor.success_draws, 7);
}

#[test]
fn good_omen_forces_good_without_consuming_the_condition_stream() {
    let mut cells = common("good-omen", 1, "basicTouch");
    cells[24] = "goodOmen".to_owned();
    cells[44] = "7".to_owned();
    cells[45] = "9".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("valid Good Omen request")
            .case,
    )
    .expect("rollout succeeds");

    assert_eq!(result.steps[0].next_condition.as_str(), "good");
    assert_eq!(result.final_cursor.condition_draws, 7);
    assert_eq!(result.final_cursor.success_draws, 10);
    assert_eq!(result.final_state.condition.as_str(), "good");
}

#[test]
fn specialist_no_step_actions_consume_only_the_streams_the_oracle_uses() {
    let mut cells = common("specialist", 2, "carefulObservation,heartAndSoul");
    cells[18] = "1".to_owned();
    cells[37] = "3".to_owned();
    cells[38] = "1".to_owned();
    cells[40] = "1".to_owned();
    cells[44] = "2".to_owned();
    cells[45] = "4".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("valid specialist request")
            .case,
    )
    .expect("rollout succeeds");

    assert_eq!(result.steps[0].cursor_before.condition_draws, 2);
    assert_eq!(result.steps[0].cursor_after.condition_draws, 3);
    assert_eq!(result.steps[0].cursor_after.success_draws, 4);
    assert_eq!(result.steps[1].cursor_before, result.steps[1].cursor_after);
    assert_eq!(result.final_state.careful_observation_uses_left, 2);
    assert!(result.final_state.heart_and_soul_active);
}

#[test]
fn terminal_action_stops_before_unused_fixed_actions() {
    let mut cells = common("complete", 4, "basicSynthesis,basicTouch");
    cells[20] = "7000".to_owned();
    cells[21] = "18900".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("valid near-terminal request")
            .case,
    )
    .expect("rollout succeeds");

    assert_eq!(result.terminal.as_str(), "completed");
    assert_eq!(result.stop_reason, RolloutStopReason::Completed);
    assert_eq!(result.actions.len(), 1);
    assert_eq!(result.steps.len(), 1);
    assert_eq!(result.final_state.progress, 7_300);
}

#[test]
fn required_quality_failure_is_not_reported_as_completion() {
    let mut cells = common("quality-failure", 4, "basicSynthesis,basicTouch");
    cells[20] = "7000".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("valid near-terminal request")
            .case,
    )
    .expect("rollout succeeds");

    assert_eq!(result.terminal.as_str(), "failed");
    assert_eq!(result.stop_reason, RolloutStopReason::Failed);
    assert_eq!(
        result
            .final_state
            .failure_reason
            .map(|reason| reason.as_str()),
        Some("required-quality")
    );
}

#[test]
fn illegal_fixed_action_fails_closed_without_a_transition_or_rng_draw() {
    let mut cells = common("illegal", 4, "reflect,basicSynthesis");
    cells[19] = "2".to_owned();
    cells[44] = "11".to_owned();
    cells[45] = "13".to_owned();
    let result = execute_rollout(
        &parse_rollout_request(&cells.join("\t"))
            .expect("well-formed illegal-action case")
            .case,
    )
    .expect("illegal action is an explicit stop result");

    assert_eq!(result.stop_reason, RolloutStopReason::IllegalAction);
    assert!(result.actions.is_empty());
    assert!(result.steps.is_empty());
    assert_eq!(result.initial_cursor, result.final_cursor);
    let output = format_rollout_response(&RolloutResponse::Rollout(result));
    let output_cells: Vec<_> = output.split('\t').collect();
    assert_eq!(output_cells[3], "ok");
    assert_eq!(output_cells[6], "-");
    assert_eq!(output_cells[7], "0");
    assert_eq!(output_cells[34], "-");
}

#[test]
fn parser_fails_closed_on_malformed_or_inconsistent_inputs() {
    let valid = common("invalid", 2, "reflect,observe");

    let mut wrong_version = valid.clone();
    wrong_version[0] = "native-rollout-batch-v0".to_owned();
    assert!(parse_rollout_request(&wrong_version.join("\t")).is_err());

    let mut missing = valid.clone();
    missing.pop();
    assert!(parse_rollout_request(&missing.join("\t")).is_err());

    let mut extra = valid.clone();
    extra.push("unexpected".to_owned());
    assert!(parse_rollout_request(&extra.join("\t")).is_err());

    let mut bad_seed = valid.clone();
    bad_seed[43] = "-1".to_owned();
    assert!(parse_rollout_request(&bad_seed.join("\t")).is_err());

    let mut aliased_cursor = valid.clone();
    aliased_cursor[44] = "4294967296".to_owned();
    assert!(parse_rollout_request(&aliased_cursor.join("\t")).is_err());

    let mut zero_steps = valid.clone();
    zero_steps[46] = "0".to_owned();
    assert!(parse_rollout_request(&zero_steps.join("\t")).is_err());

    let mut negative_weight = valid.clone();
    negative_weight[WEIGHT_START] = "-1".to_owned();
    assert!(parse_rollout_request(&negative_weight.join("\t")).is_err());

    let mut zero_row = valid.clone();
    for cell in &mut zero_row[WEIGHT_START..WEIGHT_START + 8] {
        *cell = "0".to_owned();
    }
    assert!(parse_rollout_request(&zero_row.join("\t")).is_err());

    let mut unknown_action = valid.clone();
    unknown_action[ACTIONS_INDEX] = "notAnAction".to_owned();
    assert!(parse_rollout_request(&unknown_action.join("\t")).is_err());

    let mut inconsistent_state = valid;
    inconsistent_state[20] = "7300".to_owned();
    assert!(parse_rollout_request(&inconsistent_state.join("\t")).is_err());
}

#[test]
fn direct_library_call_also_rejects_malformed_cases() {
    let mut case = parse_rollout_request(&common("direct", 2, "reflect,observe").join("\t"))
        .expect("valid direct case")
        .case;
    case.max_steps = 0;
    assert!(execute_rollout(&case).is_err());

    case.max_steps = 2;
    case.condition_transition_weights[0][0] = f64::NAN;
    assert!(execute_rollout(&case).is_err());

    case.condition_transition_weights[0][0] = 1.0;
    case.initial_state.cp = case.crafter.max_cp + 1;
    assert!(execute_rollout(&case).is_err());
}

#[test]
fn summary_only_benchmark_counts_whole_rollouts_and_inner_transitions() {
    let request = parse_rollout_request(&common("benchmark", 2, "reflect,observe").join("\t"))
        .expect("valid benchmark request");
    let first =
        benchmark_rollout_requests(std::slice::from_ref(&request), 25).expect("benchmark succeeds");
    let second = benchmark_rollout_requests(&[request], 25).expect("benchmark repeats");

    assert_eq!(first.operations, 25);
    assert_eq!(first.transitions, 50);
    assert_eq!(first.hash, second.hash);
}

#[test]
fn binary_appends_operation_transition_timing_and_output_hash_summary() {
    let input = format!("{}\n", common("binary", 2, "reflect,observe").join("\t"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-rollout-batch"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("rollout binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(input.as_bytes())
        .expect("batch input writes");
    let output = child.wait_with_output().expect("rollout binary exits");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines: Vec<_> = stdout.lines().collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0].split('\t').count(), 35);
    let summary: Vec<_> = lines[1].split('\t').collect();
    assert_eq!(
        &summary[..6],
        &[
            ROLLOUT_BATCH_PROTOCOL_VERSION,
            "__batch__",
            "summary",
            "ok",
            "1",
            "2",
        ]
    );
    assert!(summary[6].parse::<u128>().is_ok());
    assert_eq!(summary[7].len(), 16);
}

#[test]
fn binary_benchmark_returns_only_the_full_rollout_core_summary() {
    let header = format!("{ROLLOUT_BATCH_PROTOCOL_VERSION}\t__batch__\tbenchmark\t10\n");
    let case = format!("{}\n", common("benchmark", 2, "reflect,observe").join("\t"));
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-rollout-batch"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("rollout binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(format!("{header}{case}").as_bytes())
        .expect("benchmark input writes");
    let output = child.wait_with_output().expect("rollout binary exits");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines: Vec<_> = stdout.lines().collect();
    assert_eq!(lines.len(), 1);
    let summary: Vec<_> = lines[0].split('\t').collect();
    assert_eq!(
        &summary[..8],
        &[
            ROLLOUT_BATCH_PROTOCOL_VERSION,
            "__batch__",
            "benchmark",
            "ok",
            "10",
            "1",
            "10",
            "20",
        ]
    );
    assert!(summary[8].parse::<u128>().is_ok());
    assert_eq!(summary[9].len(), 8);
}
