use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::research::{
    CraftActionId, FIXED_CONTINUATION_PLAN_VERSION, MATERIAL_CONDITION_COUNT,
    ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS, ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES,
    ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS, ROOT_PLAN_MATRIX_PROTOCOL_VERSION,
    SCENARIO_MODEL_IDENTITY_VERSION, benchmark_root_plan_matrices, execute_root_plan_matrix,
    fixed_continuation_plan_hash, format_root_plan_matrix_outcome, parse_root_plan_matrix_request,
    validate_root_plan_matrix_batch, validate_root_plan_matrix_benchmark,
};

const WEIGHT_START: usize = 53;
const CONTINUATION_INDEX: usize =
    WEIGHT_START + MATERIAL_CONDITION_COUNT * MATERIAL_CONDITION_COUNT;
const SAMPLES_INDEX: usize = CONTINUATION_INDEX + 1;
const CANDIDATES_INDEX: usize = CONTINUATION_INDEX + 2;
const REQUEST_CELL_COUNT: usize = CONTINUATION_INDEX + 3;

fn matrix(case_id: &str) -> Vec<String> {
    let continuation = ["manipulation", "wasteNot2", "groundwork"];
    let parsed_actions = continuation
        .iter()
        .map(|action| action.parse().expect("known action"))
        .collect::<Vec<_>>();
    let plan_id = "shared-fixed-continuation-v1";
    let mut cells = vec![
        ROOT_PLAN_MATRIX_PROTOCOL_VERSION.to_owned(),
        case_id.to_owned(),
        "matrix".to_owned(),
        "cosmotized-ilmenite-ingot".to_owned(),
        SCENARIO_MODEL_IDENTITY_VERSION.to_owned(),
        format!("sha256:{}", "1".repeat(64)),
        "balanced-conditions".to_owned(),
        plan_id.to_owned(),
        fixed_continuation_plan_hash(plan_id, &parsed_actions),
        "full-trace".to_owned(),
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
        // Shared cursor and action-use budget.
        "0".to_owned(),
        "0".to_owned(),
        "4".to_owned(),
    ];
    // Every previous condition deterministically transitions to Normal.
    for _previous in 0..MATERIAL_CONDITION_COUNT {
        cells.push("1".to_owned());
        cells.extend((1..MATERIAL_CONDITION_COUNT).map(|_| "0".to_owned()));
    }
    cells.extend([
        continuation.join(","),
        // Deliberately reversed to prove canonical sample ordering.
        "1:286331154,0:286331153".to_owned(),
        // Deliberately reversed to prove canonical candidate ordering.
        "1:muscle:muscleMemory,0:reflect:reflect".to_owned(),
    ]);
    assert_eq!(cells.len(), REQUEST_CELL_COUNT);
    cells
}

#[test]
fn protocol_expands_candidates_and_paired_samples_in_canonical_order() {
    let request = parse_root_plan_matrix_request(&matrix("ordered").join("\t"))
        .expect("valid matrix request");
    assert_eq!(request.continuation_plan_content_fnv1a32.len(), 8);
    let outcomes = execute_root_plan_matrix(&request).expect("matrix executes");

    assert_eq!(outcomes.len(), 4);
    assert_eq!(
        outcomes
            .iter()
            .map(|outcome| (outcome.candidate.ordinal, outcome.sample.sample_index))
            .collect::<Vec<_>>(),
        vec![(0, 0), (0, 1), (1, 0), (1, 1)]
    );
    for sample_index in 0..2 {
        let pair = outcomes
            .iter()
            .filter(|outcome| outcome.sample.sample_index == sample_index)
            .collect::<Vec<_>>();
        assert_eq!(pair.len(), 2);
        assert_eq!(pair[0].sample.paired_seed, pair[1].sample.paired_seed);
    }
    assert!(
        outcomes
            .iter()
            .all(|outcome| outcome.rollout.steps.len() >= 2)
    );
    assert!(outcomes.iter().all(|outcome| {
        outcome.scenario_id == "cosmotized-ilmenite-ingot"
            && outcome.condition_profile_id == "balanced-conditions"
            && outcome.scenario_model_content_hash.starts_with("sha256:")
    }));

    let line = format_root_plan_matrix_outcome(&outcomes[0], true);
    let cells: Vec<_> = line.split('\t').collect();
    assert_eq!(cells.len(), 45);
    assert_eq!(cells[4], "cosmotized-ilmenite-ingot");
    assert_eq!(cells[5], SCENARIO_MODEL_IDENTITY_VERSION);
    assert_eq!(cells[6], format!("sha256:{}", "1".repeat(64)));
    assert_eq!(
        cells[44].split(';').count(),
        outcomes[0].rollout.steps.len()
    );
}

#[test]
fn parser_fails_closed_on_identity_plan_and_pair_ambiguity() {
    let valid = matrix("invalid");

    let mut stale_identity = valid.clone();
    stale_identity[4] = "craft-scenario-model-identity-v0".to_owned();
    assert!(parse_root_plan_matrix_request(&stale_identity.join("\t")).is_err());

    let mut changed_plan = valid.clone();
    changed_plan[CONTINUATION_INDEX] = "manipulation,observe".to_owned();
    assert!(parse_root_plan_matrix_request(&changed_plan.join("\t")).is_err());

    let mut duplicate_sample = valid.clone();
    duplicate_sample[SAMPLES_INDEX] = "0:1,0:2".to_owned();
    assert!(parse_root_plan_matrix_request(&duplicate_sample.join("\t")).is_err());

    let mut duplicate_candidate = valid;
    duplicate_candidate[CANDIDATES_INDEX] = "0:a:reflect,0:b:muscleMemory".to_owned();
    assert!(parse_root_plan_matrix_request(&duplicate_candidate.join("\t")).is_err());
}

#[test]
fn benchmark_counts_candidate_seed_episodes_and_is_deterministic() {
    let request = parse_root_plan_matrix_request(&matrix("benchmark").join("\t"))
        .expect("valid benchmark matrix");
    let first = benchmark_root_plan_matrices(std::slice::from_ref(&request), 3)
        .expect("benchmark succeeds");
    let second = benchmark_root_plan_matrices(&[request], 3).expect("benchmark repeats");
    assert_eq!(first.operations, 12);
    assert!(first.transitions >= 24);
    assert_eq!(first.transitions, second.transitions);
    assert_eq!(first.hash, second.hash);
}

#[test]
fn binary_is_atomic_and_returns_raw_outcomes_plus_summary() {
    let valid = matrix("binary").join("\t");
    let input = format!("{valid}\n");
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-root-plan-matrix"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("root-plan binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(input.as_bytes())
        .expect("matrix input writes");
    let output = child.wait_with_output().expect("root-plan binary exits");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines: Vec<_> = stdout.lines().collect();
    assert_eq!(lines.len(), 5);
    assert!(lines[..4].iter().all(|line| line.split('\t').count() == 45));
    let summary: Vec<_> = lines[4].split('\t').collect();
    assert_eq!(summary.len(), 9);
    assert_eq!(
        &summary[..6],
        &[
            ROOT_PLAN_MATRIX_PROTOCOL_VERSION,
            "__batch__",
            "summary",
            "ok",
            "1",
            "4",
        ]
    );
    assert!(summary[6].parse::<usize>().expect("transition count") >= 8);
}

#[test]
fn plan_content_diagnostic_has_an_explicit_non_cryptographic_version() {
    assert_eq!(
        FIXED_CONTINUATION_PLAN_VERSION,
        "native-fixed-continuation-plan-v1"
    );
}

#[test]
fn aggregate_limits_reject_the_whole_batch_before_execution() {
    let mut large =
        parse_root_plan_matrix_request(&matrix("large").join("\t")).expect("valid matrix request");
    assert_eq!(CraftActionId::ALL.len(), 35);
    large.candidates = CraftActionId::ALL
        .iter()
        .copied()
        .enumerate()
        .map(
            |(ordinal, root_action)| frozen_rabbit_craft_kernel::research::RootPlanCandidate {
                ordinal: ordinal as u32,
                candidate_id: format!("candidate-{ordinal}"),
                root_action,
            },
        )
        .collect();
    large.samples = (0..28_571)
        .map(
            |sample_index| frozen_rabbit_craft_kernel::research::RootPlanSample {
                sample_index,
                paired_seed: sample_index.wrapping_mul(0x9e37_79b9),
            },
        )
        .collect();

    let per_request = large.candidates.len() as u64 * large.samples.len() as u64;
    assert!(per_request <= 1_000_000);
    assert!(per_request * 3 > ROOT_PLAN_MATRIX_MAX_BATCH_OPERATIONS);
    let error = validate_root_plan_matrix_batch(&[large.clone(), large.clone(), large])
        .expect_err("aggregate operations must be capped");
    assert!(error.contains("batch operations"));
}

#[test]
fn projected_full_trace_output_stays_below_the_runner_buffer() {
    let mut long_trace = parse_root_plan_matrix_request(&matrix("long-trace").join("\t"))
        .expect("valid matrix request");
    long_trace.template.max_steps = 1_000;
    long_trace.continuation_actions = vec![CraftActionId::Observe; 999];

    let requests = vec![long_trace; 64];
    let error = validate_root_plan_matrix_batch(&requests)
        .expect_err("projected stdout must be capped before execution");
    assert!(error.contains("projected output bytes"));
    assert_eq!(ROOT_PLAN_MATRIX_MAX_BATCH_OUTPUT_BYTES, 240 * 1024 * 1024);
}

#[test]
fn direct_library_execution_applies_the_output_bound() {
    let mut request = parse_root_plan_matrix_request(&matrix("library-bound").join("\t"))
        .expect("valid matrix request");
    request.template.max_steps = 1_000;
    request.continuation_actions = vec![CraftActionId::Observe; 999];
    request.samples = (0..300)
        .map(
            |sample_index| frozen_rabbit_craft_kernel::research::RootPlanSample {
                sample_index,
                paired_seed: sample_index,
            },
        )
        .collect();
    let error = execute_root_plan_matrix(&request)
        .expect_err("library execution must validate before allocating outcomes");
    assert!(error.contains("projected output bytes"));
}

#[test]
fn benchmark_total_work_cap_preserves_the_large_evidence_run() {
    let request = parse_root_plan_matrix_request(&matrix("benchmark-limit").join("\t"))
        .expect("valid matrix request");
    let evidence_repetitions = 250_020;
    let evidence =
        validate_root_plan_matrix_benchmark(std::slice::from_ref(&request), evidence_repetitions)
            .expect("1,000,080-operation evidence run remains accepted");
    assert_eq!(evidence.operations, 1_000_080);

    let too_many_repetitions = ROOT_PLAN_MATRIX_MAX_BENCHMARK_OPERATIONS / 4 + 1;
    let error = validate_root_plan_matrix_benchmark(&[request], too_many_repetitions)
        .expect_err("benchmark total operations must be capped");
    assert!(error.contains("benchmark operations"));
}

#[test]
fn binary_rejects_an_oversized_output_batch_without_partial_outcomes() {
    let actions = vec![CraftActionId::Observe; 999];
    let action_text = actions
        .iter()
        .map(|action| action.as_str())
        .collect::<Vec<_>>()
        .join(",");
    let input = (0..64)
        .map(|index| {
            let mut cells = matrix(&format!("oversized-{index}"));
            cells[8] = fixed_continuation_plan_hash(&cells[7], &actions);
            cells[52] = "1000".to_owned();
            cells[CONTINUATION_INDEX] = action_text.clone();
            cells.join("\t")
        })
        .collect::<Vec<_>>()
        .join("\n");
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-root-plan-matrix"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("root-plan binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(input.as_bytes())
        .expect("matrix input writes");
    let output = child.wait_with_output().expect("root-plan binary exits");
    assert!(!output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines = stdout.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("projected output bytes"));
    assert!(!lines[0].contains("\toutcome\t"));
}
