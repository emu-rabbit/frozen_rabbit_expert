use std::fs;
use std::path::PathBuf;

use frozen_rabbit_craft_kernel::research::{
    CrafterFormulaInput, EpisodeRandomStream, ORACLE_PARITY_VERSION, RecipeFormulaInput,
    calculate_base_progress, calculate_base_quality,
};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures/native-parity/v1")
        .join(name);
    fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("could not read {}: {error}", path.display()))
}

fn data_lines(contents: &str) -> impl Iterator<Item = &str> {
    contents
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .skip(1)
}

#[test]
fn checkpoint_has_an_explicit_transition_parity_version() {
    assert_eq!(ORACLE_PARITY_VERSION, "oracle-parity-v0.3");
}

#[test]
fn raw_condition_and_success_draws_match_shared_ts_fixtures() {
    let contents = fixture("rng.tsv");

    for line in data_lines(&contents) {
        let cells: Vec<_> = line.split('\t').collect();
        assert_eq!(cells.len(), 11, "unexpected rng fixture row: {line}");

        let seed = cells[0].parse::<u32>().expect("valid fixture seed");
        let mut random = EpisodeRandomStream::new(seed);

        for (draw_index, expected) in cells[1..6].iter().enumerate() {
            assert_eq!(
                random.next_condition_u32(),
                expected.parse::<u32>().expect("valid condition raw u32"),
                "condition seed={seed} draw={draw_index}",
            );
        }
        for (draw_index, expected) in cells[6..11].iter().enumerate() {
            assert_eq!(
                random.next_success_u32(),
                expected.parse::<u32>().expect("valid success raw u32"),
                "success seed={seed} draw={draw_index}",
            );
        }
    }
}

#[test]
fn base_gain_fround_bits_match_shared_ts_fixtures() {
    let contents = fixture("base-gains.tsv");

    for line in data_lines(&contents) {
        let cells: Vec<_> = line.split('\t').collect();
        assert_eq!(cells.len(), 10, "unexpected base-gain fixture row: {line}");

        let case_id = cells[0];
        let recipe = RecipeFormulaInput {
            recipe_level: cells[1].parse().expect("valid recipe level"),
            progress_divider: cells[4].parse().expect("valid progress divider"),
            quality_divider: cells[5].parse().expect("valid quality divider"),
            progress_modifier: cells[6].parse().expect("valid progress modifier"),
            quality_modifier: cells[7].parse().expect("valid quality modifier"),
        };
        let crafter = CrafterFormulaInput {
            craftsmanship: cells[2].parse().expect("valid craftsmanship"),
            control: cells[3].parse().expect("valid control"),
        };
        let expected_progress_bits =
            u32::from_str_radix(cells[8], 16).expect("valid progress f32 bits");
        let expected_quality_bits =
            u32::from_str_radix(cells[9], 16).expect("valid quality f32 bits");

        assert_eq!(
            (calculate_base_progress(&recipe, &crafter) as f32).to_bits(),
            expected_progress_bits,
            "base progress case={case_id}",
        );
        assert_eq!(
            (calculate_base_quality(&recipe, &crafter) as f32).to_bits(),
            expected_quality_bits,
            "base quality case={case_id}",
        );
    }
}
