use std::io::{self, Read};
use std::process::ExitCode;
use std::time::Instant;

use frozen_rabbit_craft_kernel::{
    AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION, CACHED_PORTFOLIO_POLICY_VERSION,
    CERTIFIED_PORTFOLIO_POLICY_VERSION, COMPACT_PORTFOLIO_POLICY_VERSION,
    CONSTRUCTION_PORTFOLIO_POLICY_VERSION, COORDINATED_PORTFOLIO_POLICY_VERSION,
    EQUIVALENT_PORTFOLIO_POLICY_VERSION, EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
    GENERIC_BUDGETED_CONDITION_POLICY_VERSION,
    GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
    GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION,
    GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION,
    GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION, GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION,
    GENERIC_DELIVERY_SHIELD_POLICY_VERSION, GENERIC_EPISODE_ABI_VERSION,
    GENERIC_EPISODE_MAX_OUTPUT_BYTES, GENERIC_EPISODE_PROTOCOL_VERSION,
    GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION, GENERIC_GUIDE_DIRECT_PROBE_VERSION,
    GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION, GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION,
    GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION, GENERIC_HARD_QUALITY_POLICY_VERSION,
    GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION,
    GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION,
    GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
    GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION, GENERIC_OPTION_MPC_POLICY_VERSION,
    GENERIC_OPTION_ROUTE_POLICY_VERSION, GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION,
    GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
    GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION, GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION,
    GENERIC_RUST_BASELINE_POLICY_VERSION, GENERIC_RUST_PRIMARY_POLICY_VERSION,
    GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
    GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION,
    GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION, GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION,
    GENERIC_TS_MIGRATION_PORT_POLICY_VERSION, OBJECTIVE_PORTFOLIO_POLICY_VERSION,
    ORACLE_PARITY_VERSION, QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
    RESOURCE_PORTFOLIO_POLICY_VERSION, ROUTE_PORTFOLIO_POLICY_VERSION, execute_generic_episode,
    format_generic_episode_error, format_generic_episode_result, generic_episode_build_profile,
    generic_episode_rows_fnv1a64, generic_episode_rustc, generic_episode_target,
    parse_generic_episode_case, validate_generic_episode_batch,
};

fn main() -> ExitCode {
    let mut input = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut input) {
        println!(
            "{}",
            format_generic_episode_error("__batch__", &format!("failed to read stdin: {error}"))
        );
        return ExitCode::from(2);
    }
    let lines = input
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    if lines.len() == 1 {
        let header = lines[0].split('\t').collect::<Vec<_>>();
        if header.as_slice()
            == [
                GENERIC_EPISODE_PROTOCOL_VERSION,
                "__handshake__",
                "handshake",
            ]
        {
            println!(
                "{}",
                [
                    GENERIC_EPISODE_PROTOCOL_VERSION,
                    "__handshake__",
                    "handshake",
                    "ok",
                    GENERIC_EPISODE_ABI_VERSION,
                    ORACLE_PARITY_VERSION,
                    generic_episode_build_profile(),
                    generic_episode_target(),
                    generic_episode_rustc(),
                    GENERIC_RUST_BASELINE_POLICY_VERSION,
                    GENERIC_HARD_QUALITY_POLICY_VERSION,
                    GENERIC_RUST_PRIMARY_POLICY_VERSION,
                    GENERIC_OPTION_ROUTE_POLICY_VERSION,
                    GENERIC_OPTION_MPC_POLICY_VERSION,
                    GENERIC_GUIDE_OPTION_MPC_POLICY_VERSION,
                    GENERIC_GUIDE_LEASE_MPC_POLICY_VERSION,
                    GENERIC_GUIDE_PHASE_MPC_POLICY_VERSION,
                    GENERIC_STRATEGY_PORTFOLIO_MPC_POLICY_VERSION,
                    GENERIC_CAPABILITY_PORTFOLIO_MPC_POLICY_VERSION,
                    GENERIC_DEEP_PORTFOLIO_MPC_POLICY_VERSION,
                    GENERIC_STRATEGY_PROGRAM_MPC_POLICY_VERSION,
                    GENERIC_OPPORTUNITY_RESERVE_POLICY_VERSION,
                    GENERIC_DELIVERY_SHIELD_POLICY_VERSION,
                    GENERIC_BUDGETED_CONDITION_POLICY_VERSION,
                    GENERIC_TS_MIGRATION_PORT_POLICY_VERSION,
                    GENERIC_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
                    GENERIC_CAPABILITY_CONDITION_SET_PORTFOLIO_POLICY_VERSION,
                    GENERIC_CONDITION_CONTINUATION_PORTFOLIO_POLICY_VERSION,
                    GENERIC_OBJECTIVE_CAPABILITY_PORTFOLIO_POLICY_VERSION,
                    GENERIC_PROGRESS_QUALITY_SHIELD_POLICY_VERSION,
                    GENERIC_SPECIALIST_RESOURCE_PORTFOLIO_POLICY_VERSION,
                    GENERIC_PROGRESS_BANK_PORTFOLIO_POLICY_VERSION,
                    GENERIC_FLAT_OPPORTUNITY_PORTFOLIO_POLICY_VERSION,
                    GENERIC_SPECIALIST_RESOURCE_GUARD_POLICY_VERSION,
                    ROUTE_PORTFOLIO_POLICY_VERSION,
                    RESOURCE_PORTFOLIO_POLICY_VERSION,
                    COORDINATED_PORTFOLIO_POLICY_VERSION,
                    CONSTRUCTION_PORTFOLIO_POLICY_VERSION,
                    CACHED_PORTFOLIO_POLICY_VERSION,
                    COMPACT_PORTFOLIO_POLICY_VERSION,
                    CERTIFIED_PORTFOLIO_POLICY_VERSION,
                    QUALITY_BOUND_PORTFOLIO_POLICY_VERSION,
                    EQUIVALENT_PORTFOLIO_POLICY_VERSION,
                    OBJECTIVE_PORTFOLIO_POLICY_VERSION,
                    AGGRESSIVE_RESOURCE_PORTFOLIO_POLICY_VERSION,
                    EXPERIMENTAL_PORTFOLIO_POLICY_VERSION,
                    GENERIC_GUIDE_DIRECT_PROBE_VERSION,
                    GENERIC_INTEGRATED_GUIDE_DIRECT_PROBE_VERSION,
                    GENERIC_PROGRESS_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
                    GENERIC_OPPORTUNITY_RESERVE_GUIDE_DIRECT_PROBE_VERSION,
                    GENERIC_RISK_FORWARD_DIRECT_PROBE_VERSION,
                ]
                .join("\t"),
            );
            return ExitCode::SUCCESS;
        }
    }
    if lines.is_empty() {
        println!(
            "{}",
            format_generic_episode_error("__batch__", "generic episode input must not be empty")
        );
        return ExitCode::from(2);
    }

    let mut cases = Vec::with_capacity(lines.len());
    for line in lines {
        match parse_generic_episode_case(line) {
            Ok(case) => cases.push(case),
            Err(error) => {
                println!(
                    "{}",
                    format_generic_episode_error(&error.case_id, &error.message)
                );
                return ExitCode::from(2);
            }
        }
    }
    if let Err(message) = validate_generic_episode_batch(&cases) {
        println!("{}", format_generic_episode_error("__batch__", &message));
        return ExitCode::from(2);
    }

    let started = Instant::now();
    let mut rows = Vec::with_capacity(cases.len());
    let mut transitions = 0_u64;
    for case in &cases {
        match execute_generic_episode(case) {
            Ok(result) => {
                transitions = transitions.saturating_add(result.actions.len() as u64);
                rows.push(format_generic_episode_result(&result));
            }
            Err(message) => {
                println!(
                    "{}",
                    format_generic_episode_error(&case.rollout.case_id, &message)
                );
                return ExitCode::from(2);
            }
        }
    }
    let kernel_ns = started.elapsed().as_nanos();
    let output_bytes = rows.iter().map(|row| row.len() + 1).sum::<usize>();
    if output_bytes > GENERIC_EPISODE_MAX_OUTPUT_BYTES {
        println!(
            "{}",
            format_generic_episode_error(
                "__batch__",
                &format!(
                    "generic episode output bytes {output_bytes} exceed {GENERIC_EPISODE_MAX_OUTPUT_BYTES}"
                ),
            )
        );
        return ExitCode::from(2);
    }
    let hash = generic_episode_rows_fnv1a64(&rows);
    for row in rows {
        println!("{row}");
    }
    println!(
        "{}\t__batch__\tsummary\tok\t{}\t{}\t{}\t{}\t{:016x}",
        GENERIC_EPISODE_PROTOCOL_VERSION,
        cases.len(),
        transitions,
        kernel_ns,
        output_bytes,
        hash,
    );
    ExitCode::SUCCESS
}
