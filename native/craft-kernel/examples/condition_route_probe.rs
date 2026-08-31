//! Research-only route repair controller. No product identity or adoption claim.
//! Keeps its route explicitly inside an episode; never reads an episode seed
//! while choosing actions. Future conditions are Normal in this first probe.
#[allow(dead_code)]
mod normal_route_probe;
use frozen_rabbit_craft_kernel::*;
use std::{
    collections::HashSet,
    io::{self, BufRead},
    time::Instant,
};

fn utility(o: GenericObjective, q: i32) -> f64 {
    if q <= 0 {
        return 0.0;
    }
    if o.quality_utility_kind == QualityUtilityKind::HqChance {
        // Same community curve as the kernel; this probe has no runtime API.
        const HQ: [u8; 51] = [
            15, 15, 15, 16, 16, 17, 17, 17, 18, 18, 18, 19, 19, 20, 20, 21, 22, 23, 24, 26, 28, 31,
            34, 38, 42, 47, 52, 58, 64, 68, 71, 74, 76, 78, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
            90, 91, 92, 94, 96, 98, 100,
        ];
        let p = (i64::from(q) * 100 / i64::from(o.quality_maximum)).clamp(0, 100) as usize;
        return if p < 50 {
            (1 + p * 14 / 50) as f64 / 100.0
        } else {
            HQ[p - 50] as f64 / 100.0
        };
    }
    let t = &o.quality_milestones[..o.quality_milestone_count as usize];
    let j = t.iter().take_while(|&&v| q >= v).count();
    if j == t.len() {
        return 1.0;
    }
    let lo = if j == 0 { 0 } else { t[j - 1] };
    (j as f64 + (q - lo) as f64 / (t[j] - lo) as f64) / t.len() as f64
}

fn terminal_value(case: &GenericEpisodeCase, s: &CraftState) -> f64 {
    if s.terminal == CraftTerminal::Completed {
        let completion = match case.risk {
            RiskPreference::Stable => 4.0,
            RiskPreference::Balanced => 2.0,
            RiskPreference::Aggressive => 1.0,
        };
        return completion + utility(case.objective, s.quality);
    }
    // Search guidance only, NOT delivered utility. It allows a below-threshold
    // basic route to remain an aspiration while actual conditions can improve it.
    if s.progress >= case.rollout.recipe.progress_required {
        return 0.1 * s.quality as f64 / case.rollout.recipe.quality_max as f64;
    }
    0.0
}

fn advance(
    case: &GenericEpisodeCase,
    s: &CraftState,
    a: CraftActionId,
    success: bool,
) -> Option<CraftState> {
    let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, s, a);
    if !p.legal {
        return None;
    }
    apply_observed_outcome(
        &case.rollout.recipe,
        &case.rollout.crafter,
        s,
        a,
        ObservedActionOutcome {
            success,
            next_condition: MaterialCondition::Normal,
        },
    )
    .ok()
    .map(|r| r.next_state)
}

fn finish(
    case: &GenericEpisodeCase,
    start: &CraftState,
    limit: usize,
) -> Option<(CraftState, Vec<CraftActionId>)> {
    use CraftActionId::*;
    let actions = [
        IntensiveSynthesis,
        Groundwork,
        CarefulSynthesis,
        PrudentSynthesis,
        BasicSynthesis,
        Veneration,
        TrainedPerfection,
        MastersMend,
        ImmaculateMend,
    ];
    let mut frontier = vec![(start.clone(), vec![])];
    let mut seen = HashSet::new();
    for _ in 0..limit.min(7) {
        let mut next = Vec::new();
        for (s, path) in frontier {
            for &a in &actions {
                let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, &s, a);
                if !p.legal || p.success_rate != 1.0 {
                    continue;
                }
                let after = advance(case, &s, a, true).unwrap();
                let mut ap = path.clone();
                ap.push(a);
                if after.progress >= case.rollout.recipe.progress_required {
                    return Some((after, ap));
                }
                if after.terminal == CraftTerminal::None && seen.insert(after.clone()) {
                    next.push((after, ap));
                }
            }
        }
        next.sort_by_key(|(s, _)| std::cmp::Reverse((s.progress, s.cp, s.durability)));
        next.truncate(12);
        frontier = next;
    }
    None
}

fn replay(
    case: &GenericEpisodeCase,
    start: &CraftState,
    queue: &[CraftActionId],
    root_success: bool,
    remaining: usize,
) -> Option<(CraftState, Vec<CraftActionId>)> {
    if queue.is_empty() || queue.len() > remaining {
        return None;
    }
    let mut s = start.clone();
    let mut actual = Vec::new();
    for (i, &a) in queue.iter().enumerate() {
        if s.terminal != CraftTerminal::None {
            break;
        }
        let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, &s, a);
        if !p.legal || (i > 0 && p.success_rate != 1.0) {
            return None;
        }
        s = advance(case, &s, a, i > 0 || root_success)?;
        actual.push(a);
    }
    if s.terminal == CraftTerminal::None {
        let (end, tail) = finish(case, &s, remaining - actual.len())?;
        s = end;
        actual.extend(tail);
    }
    Some((s, actual))
}

fn alternatives(
    case: &GenericEpisodeCase,
    s: &CraftState,
    queue: &[CraftActionId],
) -> Vec<Vec<CraftActionId>> {
    let mut choices = vec![queue.to_vec()];
    for &a in CraftActionId::ALL {
        let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, s, a);
        if !p.legal {
            continue;
        }
        // Insert a useful opportunity or replace one/two consumed route actions.
        for skip in 0..=2.min(queue.len()) {
            let mut q = vec![a];
            q.extend_from_slice(&queue[skip..]);
            choices.push(q);
        }
    }
    // Moving an already-funded skill forward exposes Pliant/Primed recovery,
    // Good quality, and Sturdy/Malleable consumers without a recipe-ID rule.
    for i in 1..queue.len().min(10) {
        let mut q = queue.to_vec();
        let a = q.remove(i);
        q.insert(0, a);
        choices.push(q);
    }
    let mut seen = HashSet::new();
    choices.retain(|q| !q.is_empty() && seen.insert(q.clone()));
    choices
}

fn choose(
    case: &GenericEpisodeCase,
    s: &CraftState,
    queue: &[CraftActionId],
    remaining: usize,
) -> Option<(CraftActionId, Vec<CraftActionId>, f64)> {
    let mut best = None;
    for q in alternatives(case, s, queue) {
        let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, s, q[0]);
        if !p.legal {
            continue;
        }
        let Some((success, success_path)) = replay(case, s, &q, true, remaining) else {
            continue;
        };
        let failure_value = if p.success_rate < 1.0 {
            replay(case, s, &q, false, remaining).map_or(0.0, |(f, _)| terminal_value(case, &f))
        } else {
            0.0
        };
        let value = p.success_rate * terminal_value(case, &success)
            + (1.0 - p.success_rate) * failure_value;
        // Strict improvement retains the incumbent on ties, avoiding gratuitous
        // buffs, rerolls or no-step loops. No probability cutoff bans gambles.
        if best.as_ref().is_none_or(|(_, _, v)| value > *v + 1e-10) {
            best = Some((q[0], success_path, value));
        }
    }
    best
}

fn episode(
    case: &GenericEpisodeCase,
    adaptive: bool,
) -> (CraftState, Vec<CraftActionId>, usize, usize, usize, usize) {
    let r = &case.rollout;
    let mut s = r.initial_state.clone();
    let mut queue = Vec::new();
    let mut used = Vec::new();
    let mut random = EpisodeRandomStream::new(r.seed);
    let mut cursor = r.initial_cursor;
    random.advance_condition_draws(cursor.condition_draws);
    random.advance_success_draws(cursor.success_draws);
    let mut context = PlannerContext {
        action_limit: r.max_steps,
        ..PlannerContext::default()
    };
    let (mut replans, mut edits, mut random_uses, mut fallback) = (0, 0, 0, 0);
    while s.terminal == CraftTerminal::None && used.len() < (r.max_steps as usize).min(64) {
        let remaining = (r.max_steps as usize).min(64) - used.len();
        if queue.is_empty() || replay(case, &s, &queue, true, remaining).is_none() {
            let mut local = case.clone();
            local.rollout.initial_state = s.clone();
            local.rollout.max_steps = remaining as u32;
            queue = normal_route_probe::plan(&local, 256, 800000)
                .0
                .map_or(Vec::new(), |n| n.actions);
            replans += 1;
        }
        let next = if adaptive {
            choose(case, &s, &queue, remaining)
        } else {
            queue.first().copied().map(|a| (a, queue.clone(), 0.0))
        };
        let decision = if let Some((a, path, _)) = next {
            edits += usize::from(queue != path);
            queue = path;
            GenericDecision {
                action: a,
                option: PlannerOption::BuildQuality,
                persona: PlannerPersona::GuideContinuation,
                route: None,
            }
        } else {
            fallback += 1;
            let Some(d) = recommend_generic_action_with_model(
                case.solver_version,
                &r.recipe,
                &r.crafter,
                &s,
                case.objective,
                case.risk,
                &context,
                Some(case.random_condition_mask),
            ) else {
                break;
            };
            d
        };
        let p = preview_action(&r.recipe, &r.crafter, &s, decision.action);
        assert!(p.legal);
        random_uses += usize::from(p.success_rate < 1.0);
        let draw = draw_simulated_action_outcome(
            &p,
            &s,
            &r.condition_transition_weights[s.condition.index()],
            &mut random,
            cursor,
        );
        let after =
            apply_observed_outcome(&r.recipe, &r.crafter, &s, decision.action, draw.observed)
                .unwrap()
                .next_state;
        advance_planner_context(&mut context, case.solver_version, decision, &s, &after);
        if queue.first() == Some(&decision.action) {
            queue.remove(0);
        } else {
            queue.clear();
        }
        cursor = draw.cursor_after;
        s = after;
        used.push(decision.action);
    }
    (s, used, replans, edits, random_uses, fallback)
}

fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    let adaptive = args.get(1).map(String::as_str) != Some("fixed");
    let forced = args
        .get(2)
        .map(|s| s.parse::<MaterialCondition>().expect("condition"));
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        if line.is_empty() {
            continue;
        }
        let mut case = parse_generic_episode_case(&line).unwrap();
        if let Some(condition) = forced {
            case.rollout.initial_state.condition = condition;
        }
        let started = Instant::now();
        let (s, a, replans, edits, random_uses, fallback) = episode(&case, adaptive);
        println!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            case.rollout.case_id,
            s.terminal.as_str(),
            s.quality,
            if s.terminal == CraftTerminal::Completed {
                utility(case.objective, s.quality)
            } else {
                0.0
            },
            started.elapsed().as_micros(),
            replans,
            edits,
            random_uses,
            fallback,
            s.progress,
            a.iter().map(|a| a.as_str()).collect::<Vec<_>>().join(",")
        );
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
    fn all_conditions_choose_legal_actions_without_access_to_future_seed() {
        let mut case = fixture();
        case.rollout.recipe.progress_required = 400;
        for &condition in MaterialCondition::ALL {
            let mut state = case.rollout.initial_state.clone();
            state.condition = condition;
            let mut local = case.clone();
            local.rollout.initial_state = state.clone();
            let q = normal_route_probe::plan(&local, 32, 10000)
                .0
                .unwrap()
                .actions;
            let first = choose(&case, &state, &q, 64).unwrap();
            assert!(
                preview_action(&case.rollout.recipe, &case.rollout.crafter, &state, first.0).legal
            );
            case.rollout.seed ^= 0xdeadbeef;
            assert_eq!(Some(first), choose(&case, &state, &q, 64));
        }
    }
    #[test]
    fn gamble_failure_is_not_counted_as_delivery() {
        let mut case = fixture();
        case.rollout.recipe.progress_required = 400;
        let mut s = case.rollout.initial_state.clone();
        s.cp = 0;
        s.durability = 10;
        let q = [CraftActionId::RapidSynthesis];
        let success = replay(&case, &s, &q, true, 1).unwrap().0;
        let failure = replay(&case, &s, &q, false, 1).unwrap().0;
        assert_eq!(success.terminal, CraftTerminal::Completed);
        assert_eq!(terminal_value(&case, &failure), 0.0);
        let p = preview_action(&case.rollout.recipe, &case.rollout.crafter, &s, q[0]);
        assert_eq!(p.success_rate, 0.5);
    }
}
