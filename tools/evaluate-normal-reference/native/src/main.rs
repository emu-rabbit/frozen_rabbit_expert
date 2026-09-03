//! Research-only adapter. Raphael is external and never linked into the product.
use frozen_rabbit_craft_kernel::research as kernel;
use raphael_sim::{Action, ActionMask, Condition, Settings, SimulationState};
use raphael_solver::{AtomicFlag, MacroSolver, SolverException, SolverSettings};
use serde_json::{Value, json};
use std::{cell::RefCell, io::{self, BufRead, Write}, time::{Duration, Instant}};

fn action_id(action: Action) -> kernel::CraftActionId {
    let name = match action {
        Action::MasterMend => "mastersMend".to_owned(),
        Action::WasteNot2 => "wasteNot2".to_owned(),
        other => { let name = format!("{other:?}"); name[..1].to_lowercase() + &name[1..] }
    };
    name.parse().unwrap_or_else(|_| panic!("unsupported reference action {name}"))
}

fn settings(case: &kernel::GenericEpisodeCase) -> Settings {
    let r = case.rollout.recipe;
    let c = case.rollout.crafter;
    assert_eq!(c.level, 100, "base formula currently validated for level 100 only");
    assert_eq!(case.rollout.initial_state, kernel::CraftState::initial(&r, &c));
    let rf = kernel::RecipeFormulaInput { recipe_level: r.recipe_level,
        progress_divider: r.progress_divider, quality_divider: r.quality_divider,
        progress_modifier: r.progress_modifier, quality_modifier: r.quality_modifier };
    let cf = kernel::CrafterFormulaInput { craftsmanship: c.craftsmanship as f64, control: c.control as f64 };
    let mut allowed = ActionMask::regular().remove(Action::StellarSteadyHand)
        .remove(Action::RapidSynthesis).remove(Action::HastyTouch).remove(Action::DaringTouch);
    if c.specialist { allowed = allowed.add(Action::HeartAndSoul).add(Action::QuickInnovation); }
    Settings { max_cp: c.max_cp.try_into().unwrap(), max_durability: r.durability_max.try_into().unwrap(),
        max_progress: r.progress_required.try_into().unwrap(), max_quality: r.quality_max.try_into().unwrap(),
        base_progress: kernel::calculate_base_progress(&rf, &cf).floor() as u16,
        base_quality: kernel::calculate_base_quality(&rf, &cf).floor() as u16,
        job_level: 100, allowed_actions: allowed, adversarial: false, backload_progress: false,
        stellar_steady_hand_charges: 0 }
}

fn snapshot(state: &kernel::CraftState) -> Value {
    json!({"cp":state.cp,"durability":state.durability,"progress":state.progress,
        "quality":state.quality,"innerQuiet":state.inner_quiet,"step":state.step,
        "terminal":state.terminal.as_str(),"buffs":format!("{:?}",state.buffs)})
}

fn replay(case: &kernel::GenericEpisodeCase, settings: &Settings, actions: &[Action]) -> Value {
    let mut reference = SimulationState::new(settings);
    let mut local = case.rollout.initial_state.clone();
    let mut steps = Vec::new();
    let mut mismatches = Vec::new();
    let mut legal = true;
    for (index, &action) in actions.iter().enumerate() {
        reference = reference.use_action(action, Condition::Normal, settings).unwrap();
        let id = action_id(action);
        let preview = kernel::preview_action(&case.rollout.recipe, &case.rollout.crafter, &local, id);
        if !preview.legal || preview.success_rate != 1.0 { legal = false; break; }
        let before = snapshot(&local);
        local = kernel::apply_observed_outcome(&case.rollout.recipe, &case.rollout.crafter, &local, id,
            kernel::ObservedActionOutcome { success: true, next_condition: kernel::MaterialCondition::Normal }).unwrap().next_state;
        // Raphael retains overflow progress/quality, while the product caps them.
        let terminal = reference.is_final(settings);
        let same_resources = local.cp == reference.cp as i32 && local.durability.max(0) == reference.durability as i32
            && local.progress == i32::from(reference.progress).min(case.rollout.recipe.progress_required)
            && local.quality == i32::from(reference.quality).min(case.rollout.recipe.quality_max);
        // Terminal buff/combo ticking differs, but cannot affect any later action.
        // Preserve both raw representations in the trace and compare active effects before terminal.
        let same_effects = local.inner_quiet == reference.effects.inner_quiet() as i32
            && local.buffs.waste_not == reference.effects.waste_not() as i32
            && local.buffs.innovation == reference.effects.innovation() as i32
            && local.buffs.veneration == reference.effects.veneration() as i32
            && local.buffs.great_strides == reference.effects.great_strides() as i32
            && local.buffs.manipulation == reference.effects.manipulation() as i32
            && local.buffs.muscle_memory == reference.effects.muscle_memory() as i32
            && local.trained_perfection_active == reference.effects.trained_perfection_active()
            && local.heart_and_soul_active == reference.effects.heart_and_soul_active()
            && local.trained_perfection_available == reference.effects.trained_perfection_available()
            && local.heart_and_soul_available == reference.effects.heart_and_soul_available()
            && local.quick_innovation_available == reference.effects.quick_innovation_available();
        let same = same_resources && (terminal || same_effects);
        if !same { mismatches.push(index); }
        steps.push(json!({"index":index,"action":id.as_str(),"before":before,"after":snapshot(&local),
            "cpCost":preview.cp_cost,"durabilityCost":preview.durability_cost,
            "reference":{"cp":reference.cp,"durability":reference.durability,"progress":reference.progress,
            "quality":reference.quality,"effects":format!("{:?}",reference.effects)},"same":same}));
    }
    json!({"legal":legal,"stepCount":steps.len(),"mismatchSteps":mismatches,"steps":steps,
        "local":snapshot(&local),"referenceQuality":reference.quality.min(settings.max_quality),
        "referenceCompleted":reference.progress>=settings.max_progress,
        "hardQualityMet":local.progress>=case.rollout.recipe.progress_required && local.quality>=case.rollout.recipe.required_quality})
}

fn solve(case: &kernel::GenericEpisodeCase, budget_ms: u64) -> Value {
    let settings = settings(case);
    let flag = AtomicFlag::new();
    let signal = flag.clone();
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    let timer = std::thread::spawn(move || {
        if done_rx.recv_timeout(Duration::from_millis(budget_ms)).is_err() { signal.set(); }
    });
    let best = RefCell::new(Vec::new());
    let started = Instant::now();
    let mut solver = MacroSolver::new(SolverSettings { simulator_settings: settings,
        allow_non_max_quality_solutions: true }, Box::new(|actions| {
            *best.borrow_mut() = actions.to_vec();
            // Preserve the incumbent even if an external watchdog terminates the process.
            println!("{}", json!({"event":"incumbent","caseId":case.rollout.case_id,
                "actions":actions.iter().map(|a|action_id(*a).as_str()).collect::<Vec<_>>(),
                "replay":replay(case,&settings,actions)}));
            io::stdout().flush().unwrap();
        }), Box::new(|_| {}), flag);
    let solved = solver.solve();
    let _ = done_tx.send(());
    timer.join().unwrap();
    let (status, actions) = match solved {
        Ok(actions) => ("optimal",actions),
        Err(SolverException::NoSolution) => ("no-solution", Vec::new()),
        Err(SolverException::Interrupted) => ("interrupted",best.borrow().clone()),
        Err(error) => panic!("reference solver failed: {error:?}"),
    };
    json!({"event":"result","caseId":case.rollout.case_id,"status":status,
        "elapsedMs":started.elapsed().as_millis(),"budgetMs":budget_ms,
        "settings":format!("{settings:?}"),"stats":format!("{:?}",solver.runtime_stats()),
        "actions":actions.iter().map(|a|action_id(*a).as_str()).collect::<Vec<_>>(),
        "replay":if actions.is_empty(){Value::Null}else{replay(case,&settings,&actions)}})
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let budget_ms: u64 = args.get(1).expect("budget ms").parse().unwrap();
    assert!((1..=300_000).contains(&budget_ms));
    rayon::ThreadPoolBuilder::new().num_threads(1).build_global().unwrap();
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        if line.is_empty() { continue; }
        let case = kernel::parse_generic_episode_case(&line).unwrap();
        let result = if args.get(2).is_some_and(|mode| mode == "policy") {
            let mut case = case;
            case.trace_mode = kernel::GenericTraceMode::Full;
            let result = kernel::execute_generic_episode(&case).unwrap();
            json!({"event":"policy","caseId":case.rollout.case_id,"solver":case.solver_version.as_str(),
                "seed":case.rollout.seed,"risk":case.risk.as_str(),"stop":result.stop_reason.as_str(),
                "local":snapshot(&result.final_state),"computeNs":result.recommendation_ns,
                "actions":result.actions.iter().map(|a|a.as_str()).collect::<Vec<_>>(),
                "steps":result.steps.iter().map(|s|json!({"action":s.action.as_str(),"success":s.success,
                    "before":snapshot(&s.before_state),"after":snapshot(&s.after_state)})).collect::<Vec<_>>()})
        } else { solve(&case, budget_ms) };
        println!("{result}");
        io::stdout().flush().unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn action_names_and_settings_replay() {
        assert_eq!(action_id(Action::MasterMend), kernel::CraftActionId::MastersMend);
        assert_eq!(action_id(Action::WasteNot2), kernel::CraftActionId::WasteNot2);
        // Fixed native input is supplied by the canonical matrix; no ID-specific policy.
        let input = std::env::var("NORMAL_REFERENCE_TEST_INPUT").expect("test corpus path");
        let lines = std::fs::read_to_string(input).unwrap();
        for line in lines.lines() {
            let case = kernel::parse_generic_episode_case(line).unwrap();
            let config = settings(&case);
            assert!(!config.allowed_actions.has(Action::TrainedEye));
            assert!(!config.allowed_actions.has(Action::StellarSteadyHand));
            for actions in [vec![Action::Reflect,Action::BasicTouch,Action::StandardTouch,Action::AdvancedTouch],
                vec![Action::MuscleMemory,Action::Veneration,Action::Groundwork],
                vec![Action::Manipulation,Action::WasteNot2,Action::PreparatoryTouch]] {
                let mut state = SimulationState::new(&config);
                let mut prefix = Vec::new();
                for action in actions {
                    if state.is_final(&config) { break; }
                    state = state.use_action(action, Condition::Normal, &config).unwrap();
                    prefix.push(action);
                }
                let replay = replay(&case,&config,&prefix);
                assert_eq!(replay["legal"],true);
                assert_eq!(replay["mismatchSteps"],json!([]),"{} {replay}",case.rollout.case_id);
            }
        }
    }
}
