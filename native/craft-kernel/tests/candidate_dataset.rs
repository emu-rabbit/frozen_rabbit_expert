use std::io::Write;
use std::process::{Command, Stdio};

use frozen_rabbit_craft_kernel::{
    CANDIDATE_DATASET_CANDIDATE_COLUMNS, CANDIDATE_DATASET_DECISION_COLUMNS,
    CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION, CANDIDATE_DATASET_SCHEMA_VERSION,
    GenericEpisodeCase, candidate_dataset_candidate_header, candidate_dataset_decision_header,
    execute_candidate_dataset_episode, execute_generic_episode, parse_candidate_dataset_row,
    parse_generic_episode_case,
};

const F36_CASE_PREFIX: &str = include_str!("fixtures/web-bridge-f36-prefix.tsv");

fn f36_case() -> GenericEpisodeCase {
    let fixture = format!("{}\t1\t1\t1\t1\t1\t1\t1\t1\t0", F36_CASE_PREFIX.trim());
    parse_generic_episode_case(&fixture).expect("parse v1.12 fixture")
}

#[test]
fn candidate_dataset_is_stable_and_observer_only() {
    let case = f36_case();
    let ordinary = execute_generic_episode(&case).expect("ordinary episode");
    let first = execute_candidate_dataset_episode(&case).expect("first dataset export");
    let second = execute_candidate_dataset_episode(&case).expect("second dataset export");

    assert_eq!(first.episode.actions, ordinary.actions);
    assert_eq!(first.episode.final_state, ordinary.final_state);
    assert_eq!(first.episode.final_cursor, ordinary.final_cursor);
    assert_eq!(first.episode.stop_reason, ordinary.stop_reason);
    assert_eq!(first.episode.planner_context, ordinary.planner_context);
    assert_eq!(first.rows(), second.rows());
    assert_eq!(first.content_fnv1a64(), second.content_fnv1a64());
    assert_eq!(
        first.decisions.len(),
        first.episode.recommendation_calls as usize
    );

    for record in &first.decisions {
        assert_eq!(
            parse_candidate_dataset_row(&record.decision_row)
                .expect("parse decision row")
                .format(),
            record.decision_row
        );
        let selected_rows = record
            .candidate_rows
            .iter()
            .filter(|row| row.split('\t').nth(5) == Some("1"))
            .count();
        assert_eq!(
            selected_rows,
            usize::from(record.selected_candidate_index.is_some())
        );
        for row in &record.candidate_rows {
            assert_eq!(
                parse_candidate_dataset_row(row)
                    .expect("parse candidate row")
                    .format(),
                *row
            );
        }
    }
}

#[test]
fn candidate_dataset_omits_identity_only_fields() {
    let case = f36_case();
    let expected = execute_candidate_dataset_episode(&case)
        .expect("reference export")
        .rows();
    let mut renamed = case.clone();
    renamed.rollout.case_id = "different-corpus-grouping-only-id".to_owned();
    renamed.rollout.recipe.canonical_recipe_id += 10_000;
    let actual = execute_candidate_dataset_episode(&renamed)
        .expect("renamed export")
        .rows();

    assert_eq!(actual, expected);
    assert!(
        actual
            .iter()
            .all(|row| !row.contains("different-corpus-grouping-only-id"))
    );
}

#[test]
fn candidate_dataset_headers_and_parser_pin_the_schema() {
    assert_eq!(
        candidate_dataset_decision_header().split('\t').count(),
        CANDIDATE_DATASET_DECISION_COLUMNS.len()
    );
    assert_eq!(
        candidate_dataset_candidate_header().split('\t').count(),
        CANDIDATE_DATASET_CANDIDATE_COLUMNS.len()
    );
    assert!(
        parse_candidate_dataset_row(&format!("wrong-schema\tdecision\t{}", ["0"; 19].join("\t")))
            .unwrap_err()
            .contains("schema identity mismatch")
    );
    assert!(
        parse_candidate_dataset_row(&format!("{CANDIDATE_DATASET_SCHEMA_VERSION}\tcandidate\t0"))
            .unwrap_err()
            .contains("expected")
    );
}

#[test]
fn candidate_dataset_binary_exports_a_bounded_episode() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_craft-kernel-candidate-dataset"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn candidate dataset binary");
    writeln!(
        child.stdin.as_mut().expect("stdin"),
        "{}\t1\t1\t1\t1\t1\t1\t1\t1\t0",
        F36_CASE_PREFIX.trim()
    )
    .expect("write bounded fixture");
    let output = child.wait_with_output().expect("read dataset output");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("UTF-8 dataset output");
    let lines = stdout.lines().collect::<Vec<_>>();
    let (summary, rows) = lines.split_last().expect("dataset rows and summary");
    assert!(summary.starts_with(&format!(
        "{CANDIDATE_DATASET_EXPORT_PROTOCOL_VERSION}\t__batch__\tsummary\tok\t1\t"
    )));
    assert!(!rows.is_empty());
    for row in rows {
        parse_candidate_dataset_row(row).expect("binary emits schema-valid rows");
        assert_eq!(row.split('\t').nth(2), Some("0"));
    }
}
