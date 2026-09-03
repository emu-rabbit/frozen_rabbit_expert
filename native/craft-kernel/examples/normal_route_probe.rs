//! Bounded whole-route research probe. Not wired into any product solver.
//! Routes use the actual current condition, then Normal with forced transitions.
use frozen_rabbit_craft_kernel::research::*;
use std::{
    collections::{BTreeMap, HashMap, HashSet, VecDeque},
    io::{self, BufRead},
    time::Instant,
};

#[derive(Clone)]
pub(crate) struct Node {
    pub state: CraftState,
    pub actions: Vec<CraftActionId>,
    priority: f64,
}

fn programs(expansion: u8) -> Vec<Vec<CraftActionId>> {
    use CraftActionId::*;
    let mut p = vec![
        vec![BasicTouch, StandardTouch, AdvancedTouch],
        vec![BasicTouch, RefinedTouch],
        vec![Observe, AdvancedTouch],
        vec![
            Innovation,
            BasicTouch,
            StandardTouch,
            AdvancedTouch,
            BasicTouch,
        ],
        vec![GreatStrides, ByregotsBlessing],
        vec![Innovation, GreatStrides, ByregotsBlessing],
        vec![GreatStrides, Innovation, ByregotsBlessing],
        vec![HeartAndSoul, IntensiveSynthesis],
        vec![HeartAndSoul, TricksOfTheTrade],
        vec![HeartAndSoul, PreciseTouch],
    ];
    // Treat a buff plus its useful consumers as one search edge; every action
    // is still simulated separately, with actual CP, durability and terminal checks.
    if expansion != 3 {
        for n in 1..=if expansion > 0 { 4 } else { 0 } {
            let mut progress = vec![Veneration];
            progress.extend(std::iter::repeat_n(Groundwork, n));
            p.push(progress);
            let mut prudent = vec![Innovation];
            prudent.extend(std::iter::repeat_n(PrudentTouch, n));
            p.push(prudent);
            if n <= 3 {
                let mut progress = vec![WasteNot, Veneration];
                progress.extend(std::iter::repeat_n(Groundwork, n));
                p.push(progress);
                let mut progress = vec![Veneration, WasteNot];
                progress.extend(std::iter::repeat_n(Groundwork, n));
                p.push(progress);
                let mut quality = vec![WasteNot, Innovation];
                quality.extend(std::iter::repeat_n(PreparatoryTouch, n));
                p.push(quality);
            }
        }
        if expansion > 1 {
            for n in 1..=4 {
                let mut prep = vec![Innovation];
                prep.extend(std::iter::repeat_n(PreparatoryTouch, n));
                p.push(prep);
                let mut delicate = vec![Innovation];
                delicate.extend(std::iter::repeat_n(DelicateSynthesis, n));
                p.push(delicate);
                let mut quality = vec![WasteNot2, Innovation];
                quality.extend(std::iter::repeat_n(PreparatoryTouch, n));
                p.push(quality);
                if n <= 3 {
                    let mut quality = vec![Manipulation, Innovation];
                    quality.extend(std::iter::repeat_n(PreparatoryTouch, n));
                    p.push(quality);
                }
            }
            p.push(vec![
                Innovation,
                GreatStrides,
                PreparatoryTouch,
                GreatStrides,
                ByregotsBlessing,
            ]);
            p.push(vec![
                WasteNot2,
                Innovation,
                PreparatoryTouch,
                PreparatoryTouch,
                PreparatoryTouch,
                PreparatoryTouch,
            ]);
        }
    } else {
        // Low-resource optimal routes frequently interleave efficient progress
        // and quality instead of committing to a pure Groundwork or touch arm.
        // These remain generic mechanics motifs and are evaluated for every case.
        for n in 1..=4 {
            let mut delicate = vec![Veneration];
            delicate.extend(std::iter::repeat_n(DelicateSynthesis, n));
            p.push(delicate);
            let mut careful = vec![Veneration];
            careful.extend(std::iter::repeat_n(CarefulSynthesis, n));
            p.push(careful);
            if n <= 3 {
                let mut repaired = vec![Manipulation, Veneration];
                repaired.extend(std::iter::repeat_n(DelicateSynthesis, n));
                p.push(repaired);
                let mut repaired = vec![Manipulation, Innovation];
                repaired.extend(std::iter::repeat_n(DelicateSynthesis, n));
                p.push(repaired);
            }
        }
        p.extend([
            vec![Manipulation, BasicTouch, RefinedTouch],
            vec![Innovation, BasicTouch, RefinedTouch],
            vec![Manipulation, Innovation, BasicTouch, RefinedTouch],
            vec![BasicTouch, RefinedTouch, DelicateSynthesis],
        ]);
    }
    p.extend(
        [
            Reflect,
            MuscleMemory,
            BasicTouch,
            StandardTouch,
            AdvancedTouch,
            RefinedTouch,
            PreparatoryTouch,
            PrudentTouch,
            TrainedFinesse,
            ByregotsBlessing,
            DelicateSynthesis,
            Innovation,
            GreatStrides,
            QuickInnovation,
            TrainedPerfection,
            Manipulation,
            WasteNot,
            WasteNot2,
            MastersMend,
            ImmaculateMend,
            Veneration,
            Groundwork,
            CarefulSynthesis,
            PrudentSynthesis,
            BasicSynthesis,
            IntensiveSynthesis,
            PreciseTouch,
            TricksOfTheTrade,
        ]
        .into_iter()
        .map(|a| vec![a]),
    );
    p
}

fn priority(r: &RecipeProfile, c: &CrafterProfile, s: &CraftState) -> f64 {
    let rf = RecipeFormulaInput {
        recipe_level: r.recipe_level,
        progress_divider: r.progress_divider,
        quality_divider: r.quality_divider,
        progress_modifier: r.progress_modifier,
        quality_modifier: r.quality_modifier,
    };
    let cf = CrafterFormulaInput {
        craftsmanship: c.craftsmanship as f64,
        control: c.control as f64,
    };
    let bp = calculate_base_progress(&rf, &cf).floor().max(1.0);
    let bq = calculate_base_quality(&rf, &cf).floor();
    // Search ordering, not a probability, feasibility certificate, or upper bound.
    let durable_cp = (112.0 / (r.durability_max - 5).max(1) as f64).min(96.0 / 40.0);
    let resource = s.cp as f64
        + durable_cp
            * (s.durability as f64
                + 5.0 * s.buffs.manipulation as f64
                + 4.0 * s.buffs.waste_not as f64
                + if s.trained_perfection_available || s.trained_perfection_active {
                    15.0
                } else {
                    0.0
                });
    let remaining_progress = (r.progress_required - s.progress).max(0) as f64;
    let progress_reserve = remaining_progress / (bp * 3.6) * (18.0 + 20.0 * durable_cp);
    let iq = s.inner_quiet as f64 / 10.0;
    s.quality as f64
        + (resource - progress_reserve) * bq * 0.085 * (0.5 + 0.5 * iq)
        + bq * 4.0 * iq * iq
        + bq * (s.buffs.innovation as f64 * 0.35 + s.buffs.great_strides as f64 * 0.8)
        + bp * s.buffs.veneration as f64 * 0.2
        + bp * s.buffs.muscle_memory as f64 * 0.2
}

fn useful(before: &CraftState, after: &CraftState, a: CraftActionId) -> bool {
    use CraftActionId::*;
    match a {
        Innovation => after.buffs.innovation > before.buffs.innovation,
        GreatStrides => after.buffs.great_strides > before.buffs.great_strides,
        Veneration => after.buffs.veneration > before.buffs.veneration,
        Manipulation => after.buffs.manipulation > before.buffs.manipulation,
        WasteNot | WasteNot2 => after.buffs.waste_not > before.buffs.waste_not,
        MastersMend | ImmaculateMend => after.durability > before.durability,
        TricksOfTheTrade => after.cp > before.cp,
        _ => true,
    }
}

fn search(
    case: &GenericEpisodeCase,
    width: usize,
    cap: usize,
    expansion: u8,
) -> (Option<Node>, usize) {
    let r = &case.rollout.recipe;
    let c = &case.rollout.crafter;
    let limit = case.rollout.max_steps.min(64) as usize;
    let programs = programs(expansion);
    let mut work = 0;
    let mut frontier = vec![Node {
        state: case.rollout.initial_state.clone(),
        actions: vec![],
        priority: 0.0,
    }];
    let mut best: Option<Node> = None;
    for _ in 0..limit {
        let mut next = Vec::new();
        let mut seen = HashSet::new();
        for n in frontier {
            for p in &programs {
                if n.actions.len() + p.len() > limit || work >= cap {
                    continue;
                }
                let mut s = n.state.clone();
                let mut actions = n.actions.clone();
                let mut valid = true;
                for &a in p {
                    if s.terminal != CraftTerminal::None || work >= cap {
                        valid = false;
                        break;
                    }
                    let preview = preview_action(r, c, &s, a);
                    if !preview.legal || preview.success_rate != 1.0 {
                        valid = false;
                        break;
                    }
                    if s.quality >= r.quality_max
                        && (preview.action.category == ActionCategory::Quality
                            || matches!(
                                a,
                                CraftActionId::Innovation
                                    | CraftActionId::GreatStrides
                                    | CraftActionId::QuickInnovation
                            ))
                    {
                        valid = false;
                        break;
                    }
                    work += 1;
                    let after = apply_observed_outcome(
                        r,
                        c,
                        &s,
                        a,
                        ObservedActionOutcome {
                            success: true,
                            next_condition: MaterialCondition::Normal,
                        },
                    )
                    .unwrap()
                    .next_state;
                    if !useful(&s, &after, a) {
                        valid = false;
                        break;
                    }
                    s = after;
                    actions.push(a);
                }
                if !valid {
                    continue;
                }
                // A progress-complete, below-required-quality route is useful
                // research evidence, not successful hard-quality delivery.
                // Keep its real Failed terminal; callers must not relabel it.
                if s.progress >= r.progress_required {
                    if best.as_ref().is_none_or(|b| {
                        s.quality > b.state.quality
                            || (s.quality == b.state.quality && actions.len() < b.actions.len())
                    }) {
                        best = Some(Node {
                            state: s,
                            actions,
                            priority: 0.0,
                        });
                    }
                } else if s.terminal == CraftTerminal::None {
                    let mut key = s.clone();
                    key.step = key.step.min(2);
                    if seen.insert(key) {
                        next.push(Node {
                            priority: priority(r, c, &s),
                            state: s,
                            actions,
                        });
                    }
                }
            }
        }
        if work >= cap
            || best
                .as_ref()
                .is_some_and(|b| b.state.quality >= r.quality_max)
        {
            break;
        }
        next.sort_by(|a, b| {
            b.priority
                .total_cmp(&a.priority)
                .then_with(|| a.actions.cmp(&b.actions))
        });
        let mut buckets = HashMap::new();
        let diverse = next.into_iter().filter(|n| {
            let key = (
                n.state.progress as i64 * 8 / r.progress_required.max(1) as i64,
                n.state.inner_quiet / 2,
                n.state.buffs.innovation > 0,
                n.state.combo_from,
            );
            let used = buckets.entry(key).or_insert(0);
            *used += 1;
            *used <= 4
        });
        // Keep progress banking and quality building alive concurrently. A
        // single scalar score must not remove every funded-progress branch.
        let mut bands: BTreeMap<i64, VecDeque<Node>> = BTreeMap::new();
        for n in diverse {
            bands
                .entry(n.state.progress as i64 * 8 / r.progress_required.max(1) as i64)
                .or_default()
                .push_back(n);
        }
        frontier = Vec::new();
        while frontier.len() < width {
            let before = frontier.len();
            for band in bands.values_mut() {
                if frontier.len() == width {
                    break;
                }
                if let Some(n) = band.pop_front() {
                    frontier.push(n);
                }
            }
            if frontier.len() == before {
                break;
            }
        }
        if frontier.is_empty() {
            break;
        }
    }
    (best, work)
}

pub(crate) fn plan(case: &GenericEpisodeCase, width: usize, cap: usize) -> (Option<Node>, usize) {
    // Both searches are generic and run for every input. Retain their actual
    // best replay, rather than selecting a search mode from benchmark IDs.
    // The first three arms keep their former budget when cap is 1.4M; the
    // focused mixed-resource arm gets the remaining 200k transitions.
    let established_cap = cap * 2 / 7;
    let (a, wa) = search(case, width, established_cap, 2);
    if a.as_ref()
        .is_some_and(|n| n.state.quality >= case.rollout.recipe.quality_max)
    {
        return (a, wa);
    }
    let (b, wb) = search(case, width, established_cap, 1);
    if b.as_ref()
        .is_some_and(|n| n.state.quality >= case.rollout.recipe.quality_max)
    {
        return (b, wa + wb);
    }
    let (c, wc) = search(case, width, established_cap, 0);
    let (d, wd) = search(case, width, cap - established_cap * 3, 3);
    let best = a.into_iter().chain(b).chain(c).chain(d).max_by(|a, b| {
        a.state
            .quality
            .cmp(&b.state.quality)
            .then_with(|| b.actions.len().cmp(&a.actions.len()))
    });
    (best, wa + wb + wc + wd)
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let width = args.get(1).map_or(96, |s| s.parse().unwrap());
    let cap = args.get(2).map_or(100_000, |s| s.parse().unwrap());
    assert!((1..=512).contains(&width) && (1..=2_000_000).contains(&cap));
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        if line.trim().is_empty() {
            continue;
        }
        let case = parse_generic_episode_case(&line).unwrap();
        let started = Instant::now();
        let (route, work) = plan(&case, width, cap);
        let micros = started.elapsed().as_micros();
        if let Some(n) = route {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}",
                case.rollout.case_id,
                n.state.quality,
                n.state.cp,
                n.state.durability,
                work,
                micros,
                n.actions
                    .iter()
                    .map(|a| a.as_str())
                    .collect::<Vec<_>>()
                    .join(",")
            );
        } else {
            println!("{}\t-\t-\t-\t{}\t{}\t-", case.rollout.case_id, work, micros);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> GenericEpisodeCase {
        let input =
            std::fs::read_to_string(std::env::var("NORMAL_REFERENCE_TEST_INPUT").unwrap()).unwrap();
        parse_generic_episode_case(input.lines().next().unwrap()).unwrap()
    }
    #[test]
    fn complete_routes_are_legal_bounded_and_replay_actual_conditions() {
        let mut case = fixture();
        case.rollout.recipe.progress_required = 400;
        for &condition in MaterialCondition::ALL {
            case.rollout.initial_state =
                CraftState::initial(&case.rollout.recipe, &case.rollout.crafter);
            case.rollout.initial_state.condition = condition;
            let (route, work) = plan(&case, 16, 5000);
            assert!(work <= 5000);
            let route = route.expect("simple progress target has a funded route");
            assert!(route.actions.len() <= 64);
            let mut s = case.rollout.initial_state.clone();
            for a in route.actions {
                let preview = preview_action(&case.rollout.recipe, &case.rollout.crafter, &s, a);
                assert!(preview.legal);
                assert_eq!(preview.success_rate, 1.0);
                s = apply_observed_outcome(
                    &case.rollout.recipe,
                    &case.rollout.crafter,
                    &s,
                    a,
                    ObservedActionOutcome {
                        success: true,
                        next_condition: MaterialCondition::Normal,
                    },
                )
                .unwrap()
                .next_state;
            }
            assert_eq!(s, route.state);
            assert_eq!(s.terminal, CraftTerminal::Completed);
        }
    }
    #[test]
    fn missing_required_quality_and_tiny_budget_do_not_fabricate_a_route() {
        let mut case = fixture();
        case.rollout.recipe.required_quality = case.rollout.recipe.quality_max;
        case.rollout.initial_state.cp = 0;
        case.rollout.initial_state.durability = 1;
        assert!(plan(&case, 16, 500).0.is_none());
        let (_, work) = plan(&fixture(), 16, 1);
        assert!(work <= 1);
    }
    #[test]
    fn progress_only_witness_remains_a_hard_quality_failure() {
        let mut case = fixture();
        case.rollout.recipe.progress_required = 1;
        case.rollout.recipe.required_quality = case.rollout.recipe.quality_max;
        case.rollout.initial_state.cp = 0;
        case.rollout.initial_state.durability = 10;
        let (route, _) = plan(&case, 16, 500);
        let route = route.expect("progress witness exists");
        assert_eq!(route.state.terminal, CraftTerminal::Failed);
        assert!(route.state.quality < case.rollout.recipe.required_quality);
    }
}
