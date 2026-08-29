use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION, CANDIDATE_TEACHER_PROBE_COLUMNS,
    CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION, GenericEpisodeCase, PortfolioEvaluationBudget,
    RolloutStopReason, candidate_teacher_probe_header,
    execute_candidate_teacher_preference_episode, execute_generic_episode,
    execute_generic_episode_with_portfolio_budget,
    format_candidate_teacher_episode_outcome_signature, format_candidate_teacher_episode_result,
    parse_generic_episode_case,
};

const F36_CASE_PREFIX: &str = include_str!("fixtures/web-bridge-f36-prefix.tsv");

fn f36_case() -> GenericEpisodeCase {
    let fixture = format!("{}\t1\t1\t1\t1\t1\t1\t1\t1\t0", F36_CASE_PREFIX.trim());
    parse_generic_episode_case(&fixture).expect("parse v1.12 fixture")
}

#[test]
fn teacher_preference_probe_is_observer_only_and_schema_pinned() {
    let case = f36_case();
    let ordinary = execute_generic_episode(&case).expect("ordinary episode");
    let export = execute_candidate_teacher_preference_episode(
        &case,
        7,
        PortfolioEvaluationBudget::new(2, 8).unwrap(),
        PortfolioEvaluationBudget::new(4, 8).unwrap(),
    )
    .expect("teacher preference export");

    assert_eq!(export.episode.actions, ordinary.actions);
    assert_eq!(export.episode.final_state, ordinary.final_state);
    assert_eq!(export.episode.final_cursor, ordinary.final_cursor);
    assert_eq!(export.episode.stop_reason, ordinary.stop_reason);
    assert_eq!(export.episode.planner_context, ordinary.planner_context);
    assert_eq!(
        export.records.len(),
        export.episode.recommendation_calls as usize
    );
    assert_eq!(
        candidate_teacher_probe_header().split('\t').count(),
        CANDIDATE_TEACHER_PROBE_COLUMNS.len()
    );
    for (decision_ordinal, record) in export.records.iter().enumerate() {
        assert_eq!(record.example_ordinal, 7);
        assert_eq!(record.decision_ordinal as usize, decision_ordinal);
        assert_eq!(
            record.format_row().split('\t').count(),
            CANDIDATE_TEACHER_PROBE_COLUMNS.len()
        );
        assert_eq!(
            record.format_row().split('\t').next(),
            Some(CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION)
        );
    }
}

#[test]
fn teacher_preference_binary_exports_a_bounded_episode() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-candidate-teacher-probe"))
        .args(["--low-samples=1", "--high-samples=2", "--horizon=2"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn teacher preference binary");
    writeln!(
        child.stdin.as_mut().expect("stdin"),
        "{}\t1\t1\t1\t1\t1\t1\t1\t1\t0",
        F36_CASE_PREFIX.trim()
    )
    .expect("write bounded fixture");
    let output = child.wait_with_output().expect("read teacher output");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 teacher output");
    let lines = stdout.lines().collect::<Vec<_>>();
    let (summary, rows) = lines.split_last().expect("preference rows and summary");
    let summary_cells = summary.split('\t').collect::<Vec<_>>();
    assert_eq!(summary_cells.len(), 16);
    assert_eq!(summary_cells[0], CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION);
    assert_eq!(&summary_cells[1..4], &["summary", "ok", "1"]);
    assert_eq!(&summary_cells[12..15], &["1", "2", "2"]);
    assert!(!rows.is_empty());
    assert!(
        rows.iter()
            .all(|row| row.split('\t').count() == CANDIDATE_TEACHER_PROBE_COLUMNS.len())
    );
}

#[test]
fn teacher_closed_loop_is_deterministic_and_does_not_mutate_the_ordinary_path() {
    let case = f36_case();
    let ordinary_before = execute_generic_episode(&case).expect("ordinary episode before teacher");
    let budget = PortfolioEvaluationBudget::new(2, 8).unwrap();
    let first = execute_generic_episode_with_portfolio_budget(&case, budget)
        .expect("first teacher episode");
    let second = execute_generic_episode_with_portfolio_budget(&case, budget)
        .expect("second teacher episode");
    let ordinary_after = execute_generic_episode(&case).expect("ordinary episode after teacher");

    assert_eq!(ordinary_before.actions, ordinary_after.actions);
    assert_eq!(ordinary_before.final_state, ordinary_after.final_state);
    assert_eq!(ordinary_before.final_cursor, ordinary_after.final_cursor);
    assert_eq!(ordinary_before.stop_reason, ordinary_after.stop_reason);
    assert_eq!(
        ordinary_before.planner_context,
        ordinary_after.planner_context
    );
    assert_eq!(first.actions, second.actions);
    assert_eq!(first.final_state, second.final_state);
    assert_eq!(first.final_cursor, second.final_cursor);
    assert_eq!(first.stop_reason, second.stop_reason);
    assert_eq!(first.planner_context, second.planner_context);
    assert_eq!(
        format_candidate_teacher_episode_outcome_signature(&first, budget),
        format_candidate_teacher_episode_outcome_signature(&second, budget)
    );
    assert!(!matches!(
        first.stop_reason,
        RolloutStopReason::IllegalAction | RolloutStopReason::PolicyNull
    ));

    let row = format_candidate_teacher_episode_result(&first, budget);
    let cells = row.split('\t').collect::<Vec<_>>();
    assert_eq!(cells[0], CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION);
    assert_eq!(cells[1], case.rollout.case_id);
    assert_eq!(&cells[2..4], &["episode", "ok"]);
    assert_eq!(cells[4], "generic-craft-route-teacher-samples-2-horizon-8");
    assert_eq!(&cells[5..7], &["2", "8"]);
    assert_eq!(cells[7], case.solver_version.to_string());
}

#[test]
fn teacher_closed_loop_binary_exports_an_explicit_experiment_identity() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-candidate-teacher-episode"))
        .args(["--samples=1", "--horizon=2"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn teacher episode binary");
    writeln!(
        child.stdin.as_mut().expect("stdin"),
        "{}\t1\t1\t1\t1\t1\t1\t1\t1\t0",
        F36_CASE_PREFIX.trim()
    )
    .expect("write bounded fixture");
    let output = child
        .wait_with_output()
        .expect("read teacher episode output");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 teacher episode output");
    let lines = stdout.lines().collect::<Vec<_>>();
    let (summary, rows) = lines.split_last().expect("teacher row and summary");
    assert_eq!(rows.len(), 1);
    let row_cells = rows[0].split('\t').collect::<Vec<_>>();
    assert_eq!(row_cells[0], CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION);
    assert_eq!(
        row_cells[4],
        "generic-craft-route-teacher-samples-1-horizon-2"
    );
    assert_eq!(&row_cells[5..7], &["1", "2"]);
    let summary_cells = summary.split('\t').collect::<Vec<_>>();
    assert_eq!(summary_cells.len(), 18);
    assert_eq!(summary_cells[0], CANDIDATE_TEACHER_EPISODE_PROTOCOL_VERSION);
    assert_eq!(&summary_cells[1..4], &["__batch__", "summary", "ok"]);
    assert_eq!(summary_cells[5], "1");
    assert_eq!(&summary_cells[15..17], &["1", "2"]);
}
