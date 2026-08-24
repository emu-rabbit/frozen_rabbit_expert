use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION, ADAPTIVE_POLICY_MAX_OUTPUT_BYTES,
    ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS, ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES,
    CraftFailureReason, CraftState, CraftTerminal, CrafterProfile, MaterialCondition,
    RecipeProfile, execute_adaptive_policy_matrix, format_adaptive_policy_matrix_output,
    parse_adaptive_policy_matrix_request,
};

const PROGRAM_HASH: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const SCENARIO_HASH: &str =
    "sha256:1111111111111111111111111111111111111111111111111111111111111111";

fn boolean(value: bool) -> &'static str {
    if value { "1" } else { "0" }
}

fn state_cells(state: &CraftState) -> Vec<String> {
    vec![
        state.step.to_string(),
        state.progress.to_string(),
        state.quality.to_string(),
        state.durability.to_string(),
        state.cp.to_string(),
        state.condition.as_str().to_owned(),
        state.inner_quiet.to_string(),
        state.buffs.waste_not.to_string(),
        state.buffs.veneration.to_string(),
        state.buffs.great_strides.to_string(),
        state.buffs.innovation.to_string(),
        state.buffs.final_appraisal.to_string(),
        state.buffs.manipulation.to_string(),
        state.buffs.muscle_memory.to_string(),
        state.buffs.expedience.to_string(),
        state
            .combo_from
            .map_or("-", |action| action.as_str())
            .to_owned(),
        boolean(state.trained_perfection_available).to_owned(),
        boolean(state.trained_perfection_active).to_owned(),
        state.careful_observation_uses_left.to_string(),
        boolean(state.heart_and_soul_available).to_owned(),
        boolean(state.heart_and_soul_active).to_owned(),
        boolean(state.quick_innovation_available).to_owned(),
        state.terminal.as_str().to_owned(),
        state
            .failure_reason
            .map_or("-", |reason| reason.as_str())
            .to_owned(),
    ]
}

fn fixture_with_state(max_cp: i32, mutate_state: impl FnOnce(&mut CraftState)) -> String {
    let recipe = RecipeProfile {
        canonical_recipe_id: 1,
        recipe_level: 690,
        progress_required: 100,
        quality_max: 100,
        required_quality: 0,
        durability_max: 40,
        progress_divider: 100.0,
        quality_divider: 100.0,
        progress_modifier: 100.0,
        quality_modifier: 100.0,
    };
    let crafter = CrafterProfile {
        level: 100,
        craftsmanship: 5_000,
        control: 5_000,
        max_cp,
        cosmic_tool_good_bonus: true,
        specialist: false,
    };
    let mut initial = CraftState::initial(&recipe, &crafter);
    mutate_state(&mut initial);
    let header = [
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        "__program__",
        "program",
        "craft-adaptive-policy-program-v1",
        "fixture-adaptive-program-v1",
        PROGRAM_HASH,
        "fixture-scenario-v1",
        "fixture-recipe-v1",
        "craft-scenario-model-identity-v1",
        SCENARIO_HASH,
        "fixture-objective-v1",
        "maximize-quality-with-safe-completion",
        "1",
        "craft-adaptive-policy-features-v1",
        "solver-policy-safety-v1",
        "entry",
        "2",
        "4",
        "1",
        "1",
    ]
    .join("\t");
    let node = [
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        "entry",
        "node",
        "0",
        "1",
        "terminate",
        "done",
        "-",
        "-",
        "-",
        "0",
        "1",
    ]
    .join("\t");
    let decision = [
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        "entry",
        "decision",
        "0",
        "choose-basic-synthesis",
        "1",
        "1",
        "1",
    ]
    .join("\t");
    let guard = [
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        "entry",
        "decision-guard",
        "0",
        "0",
        "integer",
        "crafter.maxCp",
        "gte",
        "630",
    ]
    .join("\t");
    let action = [
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
        "entry",
        "decision-action",
        "0",
        "0",
        "basicSynthesis",
    ]
    .join("\t");
    let mut case = vec![
        ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION.to_owned(),
        format!("cp-{max_cp}"),
        "case".to_owned(),
        PROGRAM_HASH.to_owned(),
        "fixture-scenario-v1".to_owned(),
        "craft-scenario-model-identity-v1".to_owned(),
        SCENARIO_HASH.to_owned(),
        "craft-adaptive-policy-features-v1".to_owned(),
        "solver-policy-safety-v1".to_owned(),
        "fixture-recipe-v1".to_owned(),
        "fixture-objective-v1".to_owned(),
        "maximize-quality-with-safe-completion".to_owned(),
        "1".to_owned(),
        format!("crafter-cp-{max_cp}"),
        "all-normal".to_owned(),
        recipe.canonical_recipe_id.to_string(),
        recipe.recipe_level.to_string(),
        recipe.progress_required.to_string(),
        recipe.quality_max.to_string(),
        recipe.required_quality.to_string(),
        recipe.durability_max.to_string(),
        recipe.progress_divider.to_string(),
        recipe.quality_divider.to_string(),
        recipe.progress_modifier.to_string(),
        recipe.quality_modifier.to_string(),
        crafter.level.to_string(),
        crafter.craftsmanship.to_string(),
        crafter.control.to_string(),
        crafter.max_cp.to_string(),
        boolean(crafter.cosmic_tool_good_bonus).to_owned(),
        boolean(crafter.specialist).to_owned(),
    ];
    case.extend(state_cells(&initial));
    case.extend(["1", "0", "0", "2"].map(str::to_owned));
    for _previous in 0..8 {
        case.extend(["1", "0", "0", "0", "0", "0", "0", "0"].map(str::to_owned));
    }
    [
        header,
        node,
        decision,
        guard,
        action,
        case.join("\t"),
        String::new(),
    ]
    .join("\n")
}

fn fixture(max_cp: i32) -> String {
    fixture_with_state(max_cp, |_| {})
}

fn bounded_fixture(
    case_count: usize,
    max_steps: u32,
    max_settle_hops: u32,
    transition_guard_count: usize,
) -> String {
    let base = fixture(630);
    let rows = base.lines().map(str::to_owned).collect::<Vec<_>>();
    let mut header = rows[0].split('\t').map(str::to_owned).collect::<Vec<_>>();
    header[17] = max_settle_hops.to_string();
    header[19] = case_count.to_string();
    let mut node = rows[1].split('\t').map(str::to_owned).collect::<Vec<_>>();
    node[10] = usize::from(transition_guard_count > 0).to_string();
    let mut result = vec![header.join("\t"), node.join("\t")];
    if transition_guard_count > 0 {
        result.push(
            [
                ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION,
                "entry",
                "transition",
                "0",
                "bounded-transition",
                "goto",
                "entry",
                "-",
                "-",
                "-",
                &transition_guard_count.to_string(),
            ]
            .join("\t"),
        );
        result.extend((0..transition_guard_count).map(|guard_index| {
            [
                ADAPTIVE_POLICY_MATRIX_PROTOCOL_VERSION.to_owned(),
                "entry".to_owned(),
                "transition-guard".to_owned(),
                "0".to_owned(),
                guard_index.to_string(),
                "integer".to_owned(),
                "crafter.maxCp".to_owned(),
                "lt".to_owned(),
                "0".to_owned(),
            ]
            .join("\t")
        }));
    }
    result.extend(rows[2..5].iter().cloned());
    let template = rows[5].split('\t').map(str::to_owned).collect::<Vec<_>>();
    result.extend((0..case_count).map(|case_index| {
        let mut case = template.clone();
        case[1] = format!("bounded-case-{case_index}");
        case[58] = max_steps.to_string();
        case.join("\t")
    }));
    format!("{}\n", result.join("\n"))
}

#[test]
fn generic_program_routes_from_encoded_features_without_profile_ids() {
    let request = parse_adaptive_policy_matrix_request(&fixture(630)).unwrap();
    let outcomes = execute_adaptive_policy_matrix(&request).unwrap();
    assert_eq!(outcomes.len(), 1);
    assert_eq!(outcomes[0].steps.len(), 1);
    assert_eq!(
        outcomes[0].steps[0].decision.action.unwrap().as_str(),
        "basicSynthesis"
    );
    assert_eq!(outcomes[0].stop_reason.as_str(), "completed");
    let output = format_adaptive_policy_matrix_output(&request.program, &outcomes, 7).unwrap();
    assert!(output.contains("\t__batch__\tsummary\tok\t1\t1\t7\t"));
}

#[test]
fn out_of_envelope_case_fails_closed_before_any_transition() {
    let request = parse_adaptive_policy_matrix_request(&fixture(629)).unwrap();
    let outcomes = execute_adaptive_policy_matrix(&request).unwrap();
    assert_eq!(outcomes[0].stop_reason.as_str(), "policy-null");
    assert!(outcomes[0].steps.is_empty());
    assert_eq!(outcomes[0].final_state.step, 1);
    assert_eq!(
        outcomes[0].final_memory.termination_reason.as_deref(),
        Some("no-safe-action")
    );
}

#[test]
fn mismatched_case_identity_is_rejected_before_execution() {
    let input = fixture(630).replacen(SCENARIO_HASH, PROGRAM_HASH, 1);
    let error = parse_adaptive_policy_matrix_request(&input).unwrap_err();
    assert!(error.message.contains("case identity"));
}

#[test]
fn parser_enforces_the_typescript_versioned_identifier_contract() {
    let base = fixture(630);
    let invalid_program = base.replacen(
        "fixture-adaptive-program-v1",
        "Fixture-adaptive-program-v1",
        1,
    );
    let invalid_nodes = base.replace("\tentry\t", "\tEntry\t");
    let invalid_member = base.replacen("choose-basic-synthesis", "Choose-basic-synthesis", 1);
    let invalid_reason = base.replacen("\tterminate\tdone\t", "\tterminate\tDone\t", 1);
    let invalid_flag = base.replacen(
        "\tentry\tnode\t0\t1\tterminate\tdone\t-\t-\t-\t0\t1",
        "\tentry\tnode\t0\t1\tgoto\tentry\t-\tBad\t1\t0\t1",
        1,
    );
    let oversized_program = base.replacen("fixture-adaptive-program-v1", &"a".repeat(129), 1);

    for input in [
        invalid_program,
        invalid_nodes,
        invalid_member,
        invalid_reason,
        invalid_flag,
        oversized_program,
    ] {
        let error = parse_adaptive_policy_matrix_request(&input).unwrap_err();
        assert!(error.message.contains("lowercase versioned identifier"));
    }

    let maximum_length_program = base.replacen("fixture-adaptive-program-v1", &"a".repeat(128), 1);
    parse_adaptive_policy_matrix_request(&maximum_length_program).unwrap();
}

#[test]
fn parser_rejects_enum_values_and_resume_mutations_outside_the_ts_schema() {
    let invalid_enum = fixture(630).replacen(
        "\tinteger\tcrafter.maxCp\tgte\t630",
        "\tenum\tstate.condition\teq\tunknown",
        1,
    );
    let error = parse_adaptive_policy_matrix_request(&invalid_enum).unwrap_err();
    assert!(
        error
            .message
            .contains("unsupported adaptive-policy feature")
    );

    let invalid_resume = fixture(630).replacen(
        "\tentry\tnode\t0\t1\tterminate\tdone\t-\t-\t-\t0\t1",
        "\tentry\tnode\t0\t1\tgoto\t$resume\tactive-node\t-\t-\t0\t1",
        1,
    );
    let error = parse_adaptive_policy_matrix_request(&invalid_resume).unwrap_err();
    assert!(error.message.contains("cannot replace resume"));
}

#[test]
fn parser_enforces_typescript_objective_and_crafter_context_invariants() {
    let invalid_objective =
        fixture(630).replace("maximize-quality-with-safe-completion", "required-quality");
    let error = parse_adaptive_policy_matrix_request(&invalid_objective).unwrap_err();
    assert!(error.message.contains("required-quality objective"));

    let error = parse_adaptive_policy_matrix_request(&fixture(0)).unwrap_err();
    assert!(error.message.contains("crafter bounds"));
}

#[test]
fn parser_enforces_typescript_state_invariants() {
    let invalid_states = [
        fixture_with_state(630, |state| state.buffs.innovation = -1),
        fixture_with_state(630, |state| state.careful_observation_uses_left = 4),
        fixture_with_state(630, |state| state.terminal = CraftTerminal::Completed),
        fixture_with_state(630, |state| state.terminal = CraftTerminal::Failed),
        fixture_with_state(630, |state| state.durability = 0),
        fixture_with_state(630, |state| {
            state.failure_reason = Some(CraftFailureReason::Durability);
        }),
    ];
    for input in invalid_states {
        parse_adaptive_policy_matrix_request(&input).unwrap_err();
    }

    let valid_failed_state = fixture_with_state(630, |state| {
        state.durability = -5;
        state.terminal = CraftTerminal::Failed;
        state.failure_reason = Some(CraftFailureReason::Durability);
    });
    parse_adaptive_policy_matrix_request(&valid_failed_state).unwrap();
}

#[test]
fn frozen_adaptive_v1_rejects_robust_instead_of_silently_changing_its_wire_matrix() {
    let robust = fixture_with_state(630, |state| {
        state.condition = MaterialCondition::Robust;
    });
    let error = parse_adaptive_policy_matrix_request(&robust).unwrap_err();
    assert!(error.message.contains("does not encode Robust"));
}

#[test]
fn parser_rejects_protocol_cells_and_projected_work_before_execution() {
    let oversized_cell = fixture(630).replacen(
        "cp-630",
        &"x".repeat(ADAPTIVE_POLICY_MAX_PROTOCOL_CELL_BYTES + 1),
        1,
    );
    let error = parse_adaptive_policy_matrix_request(&oversized_cell).unwrap_err();
    assert!(error.message.contains("protocol cell cap"));

    let excessive_work = bounded_fixture(64, 64, 128, 256);
    let error = parse_adaptive_policy_matrix_request(&excessive_work).unwrap_err();
    assert!(error.message.contains("projected evaluation units"));
    assert_eq!(ADAPTIVE_POLICY_MAX_PROJECTED_EVALUATION_UNITS, 25_000_000);
}

#[test]
fn binary_rejects_projected_output_without_partial_outcomes() {
    let input = bounded_fixture(64, 64, 1, 0);
    let error = parse_adaptive_policy_matrix_request(&input).unwrap_err();
    assert!(error.message.contains("projected output bytes"));
    assert_eq!(ADAPTIVE_POLICY_MAX_OUTPUT_BYTES, 64 * 1024 * 1024);

    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-adaptive-policy-matrix"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("adaptive-policy binary starts");
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(input.as_bytes())
        .expect("adaptive-policy input writes");
    let output = child
        .wait_with_output()
        .expect("adaptive-policy binary exits");
    assert!(!output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf-8 output");
    let lines = stdout.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("projected output bytes"));
    assert!(!lines[0].contains("\toutcome\t"));
}
