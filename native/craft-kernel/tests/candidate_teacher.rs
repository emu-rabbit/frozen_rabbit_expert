use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    CANDIDATE_TEACHER_PROBE_COLUMNS, CANDIDATE_TEACHER_PROBE_PROTOCOL_VERSION, GenericEpisodeCase,
    PortfolioEvaluationBudget, candidate_teacher_probe_header,
    execute_candidate_teacher_preference_episode, execute_generic_episode,
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
