use std::str::FromStr;

use crate::{
    COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION, CraftActionId, CraftState, CrafterProfile,
    GenericDecision, GenericEpisodeCase, GenericObjective, GenericSolverVersion,
    ObservedActionOutcome, PlannerContext, RecipeProfile, RiskPreference, advance_planner_context,
    apply_observed_outcome, parse_generic_episode_case, planner_context_fingerprint,
    recommend_portfolio_version,
};

pub const WEB_PLANNER_ABI_VERSION: &str = "rust-web-planner-abi-v1";
pub const WEB_PLANNER_MAX_INPUT_BYTES: usize = 64 * 1024;
pub const WEB_PLANNER_MAX_OUTPUT_BYTES: usize = 16 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WebPlannerAdvance {
    Reset,
    Continue(CraftActionId),
    Deviate(CraftActionId),
}

#[derive(Clone, Debug, PartialEq)]
struct WebPlannerIdentity {
    solver_version: GenericSolverVersion,
    risk: RiskPreference,
    recipe: RecipeProfile,
    crafter: CrafterProfile,
    objective: GenericObjective,
    random_condition_mask: u16,
    action_limit: u32,
}

impl WebPlannerIdentity {
    fn from_case(case: &GenericEpisodeCase) -> Self {
        Self {
            solver_version: case.solver_version,
            risk: case.risk,
            recipe: case.rollout.recipe,
            crafter: case.rollout.crafter,
            objective: case.objective,
            random_condition_mask: case.random_condition_mask,
            action_limit: case.rollout.max_steps,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PendingDecision {
    decision: GenericDecision,
    before_state: CraftState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WebPlannerReply {
    pub action: Option<CraftActionId>,
    pub option: Option<String>,
    pub persona: Option<String>,
    pub policy_version: &'static str,
    pub context_fingerprint: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WebPlannerSession {
    identity: Option<WebPlannerIdentity>,
    context: PlannerContext,
    pending: Option<PendingDecision>,
}

fn observed_transition_matches(
    identity: &WebPlannerIdentity,
    before: &CraftState,
    action: CraftActionId,
    after: &CraftState,
) -> bool {
    [true, false].into_iter().any(|success| {
        apply_observed_outcome(
            &identity.recipe,
            &identity.crafter,
            before,
            action,
            ObservedActionOutcome {
                success,
                next_condition: after.condition,
            },
        )
        .is_ok_and(|transition| transition.next_state == *after)
    })
}

impl WebPlannerSession {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn recommend_case(
        &mut self,
        case: &GenericEpisodeCase,
        advance: WebPlannerAdvance,
    ) -> Result<WebPlannerReply, String> {
        if case.solver_version.as_str() != COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION {
            return Err(format!(
                "Web planner requires {COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION}, got {}",
                case.solver_version.as_str(),
            ));
        }
        let next_identity = WebPlannerIdentity::from_case(case);
        match advance {
            WebPlannerAdvance::Reset => {
                self.identity = Some(next_identity.clone());
                self.context = PlannerContext {
                    action_limit: next_identity.action_limit,
                    ..PlannerContext::default()
                };
                self.pending = None;
            }
            WebPlannerAdvance::Continue(action) => {
                let identity = self.identity.as_ref().ok_or_else(|| {
                    "continue requires an initialized Web planner session".to_owned()
                })?;
                if identity != &next_identity {
                    return Err(
                        "continue identity changed; reset the Web planner session".to_owned()
                    );
                }
                let pending = self
                    .pending
                    .take()
                    .ok_or_else(|| "continue requires a pending recommendation".to_owned())?;
                if pending.decision.action != action {
                    self.pending = Some(pending);
                    return Err(
                        "continued action does not match the pending recommendation".to_owned()
                    );
                }
                if !observed_transition_matches(
                    identity,
                    &pending.before_state,
                    action,
                    &case.rollout.initial_state,
                ) {
                    self.pending = Some(pending);
                    return Err(
                        "observed state is not a valid outcome of the pending action".to_owned(),
                    );
                }
                advance_planner_context(
                    &mut self.context,
                    case.solver_version,
                    pending.decision,
                    &pending.before_state,
                    &case.rollout.initial_state,
                );
            }
            WebPlannerAdvance::Deviate(action) => {
                let identity = self.identity.as_ref().ok_or_else(|| {
                    "deviate requires an initialized Web planner session".to_owned()
                })?;
                if identity != &next_identity {
                    return Err(
                        "deviate identity changed; reset the Web planner session".to_owned()
                    );
                }
                let pending = self
                    .pending
                    .take()
                    .ok_or_else(|| "deviate requires a pending recommendation".to_owned())?;
                if !observed_transition_matches(
                    identity,
                    &pending.before_state,
                    action,
                    &case.rollout.initial_state,
                ) {
                    self.pending = Some(pending);
                    return Err(
                        "observed state is not a valid outcome of the deviating action".to_owned(),
                    );
                }
                self.context = PlannerContext {
                    action_limit: next_identity.action_limit,
                    ..PlannerContext::default()
                };
            }
        }

        if self.context.action_uses >= self.context.action_limit {
            self.pending = None;
            return Ok(WebPlannerReply {
                action: None,
                option: None,
                persona: None,
                policy_version: COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION,
                context_fingerprint: planner_context_fingerprint(
                    case.solver_version,
                    &self.context,
                ),
            });
        }

        let report = recommend_portfolio_version(
            case.solver_version,
            &case.rollout.recipe,
            &case.rollout.crafter,
            &case.rollout.initial_state,
            case.objective,
            case.risk,
            &self.context,
            Some(case.random_condition_mask),
        );
        let decision = report.decision;
        self.pending = decision.map(|decision| PendingDecision {
            decision,
            before_state: case.rollout.initial_state.clone(),
        });
        Ok(WebPlannerReply {
            action: decision.map(|decision| decision.action),
            option: decision.map(|decision| decision.option.as_str().to_owned()),
            persona: decision.map(|decision| decision.persona.as_str().to_owned()),
            policy_version: COMPLETION_AWARE_PORTFOLIO_POLICY_VERSION,
            context_fingerprint: planner_context_fingerprint(case.solver_version, &self.context),
        })
    }

    pub fn recommend_request(&mut self, request: &str) -> Result<WebPlannerReply, String> {
        let (advance, case) = parse_web_planner_request(request)?;
        self.recommend_case(&case, advance)
    }
}

pub fn parse_web_planner_request(
    request: &str,
) -> Result<(WebPlannerAdvance, GenericEpisodeCase), String> {
    if request.is_empty() {
        return Err("Web planner request must not be empty".to_owned());
    }
    if request.len() > WEB_PLANNER_MAX_INPUT_BYTES {
        return Err(format!(
            "Web planner request exceeds {WEB_PLANNER_MAX_INPUT_BYTES} bytes",
        ));
    }
    let request = request.trim_end_matches(['\r', '\n']);
    if request.contains(['\r', '\n']) {
        return Err("Web planner request must contain exactly one TSV row".to_owned());
    }
    let (advance, episode) = request
        .split_once('\t')
        .ok_or_else(|| "Web planner request is missing the advance mode".to_owned())?;
    let advance = if advance == "reset" {
        WebPlannerAdvance::Reset
    } else if let Some(action) = advance.strip_prefix("continue:") {
        WebPlannerAdvance::Continue(CraftActionId::from_str(action)?)
    } else if let Some(action) = advance.strip_prefix("deviate:") {
        WebPlannerAdvance::Deviate(CraftActionId::from_str(action)?)
    } else {
        return Err(format!("unknown Web planner advance mode: {advance}"));
    };
    let case = parse_generic_episode_case(episode).map_err(|error| error.message)?;
    Ok((advance, case))
}

fn sanitized_cell(value: &str) -> String {
    value.replace(['\t', '\r', '\n'], " ")
}

pub fn format_web_planner_reply(reply: &WebPlannerReply) -> String {
    [
        WEB_PLANNER_ABI_VERSION.to_owned(),
        "ok".to_owned(),
        reply.policy_version.to_owned(),
        reply
            .action
            .map_or_else(|| "-".to_owned(), |action| action.as_str().to_owned()),
        reply.option.clone().unwrap_or_else(|| "-".to_owned()),
        reply.persona.clone().unwrap_or_else(|| "-".to_owned()),
        sanitized_cell(&reply.context_fingerprint),
    ]
    .join("\t")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GenericTraceMode, MaterialCondition, execute_generic_episode};

    const F36_CASE_PREFIX: &str = include_str!("../tests/fixtures/web-bridge-f36-prefix.tsv");

    fn f36_case() -> GenericEpisodeCase {
        // Keep the long fixture reviewable; append the final Robust transition
        // row here instead of hiding a line-ending distinction in the file.
        let fixture = format!("{}\t1\t1\t1\t1\t1\t1\t1\t1\t0", F36_CASE_PREFIX.trim(),);
        parse_generic_episode_case(&fixture).unwrap()
    }

    #[test]
    fn stateful_bridge_matches_the_first_two_native_episode_actions() {
        let mut case = f36_case();
        case.trace_mode = GenericTraceMode::Full;
        let native = execute_generic_episode(&case).unwrap();
        assert!(native.actions.len() >= 2);

        let mut session = WebPlannerSession::default();
        let first = session
            .recommend_case(&case, WebPlannerAdvance::Reset)
            .unwrap();
        assert_eq!(first.action, Some(native.actions[0]));

        case.rollout.initial_state = native.steps[0].after_state.clone();
        let second = session
            .recommend_case(&case, WebPlannerAdvance::Continue(native.steps[0].action))
            .unwrap();
        assert_eq!(second.action, Some(native.actions[1]));
    }

    #[test]
    fn bridge_fails_closed_on_identity_and_observed_state_mismatch() {
        let case = f36_case();
        let mut session = WebPlannerSession::default();
        let first = session
            .recommend_case(&case, WebPlannerAdvance::Reset)
            .unwrap();
        let action = first.action.unwrap();

        let mut changed = case.clone();
        changed.risk = RiskPreference::Aggressive;
        assert!(
            session
                .recommend_case(&changed, WebPlannerAdvance::Continue(action))
                .unwrap_err()
                .contains("identity changed")
        );

        assert!(
            session
                .recommend_case(&case, WebPlannerAdvance::Continue(action))
                .unwrap_err()
                .contains("not a valid outcome")
        );
    }

    #[test]
    fn evaluator_private_weights_are_not_part_of_web_planner_identity() {
        let mut case = f36_case();
        case.trace_mode = GenericTraceMode::Full;
        let native = execute_generic_episode(&case).unwrap();
        let mut session = WebPlannerSession::default();
        let first = session
            .recommend_case(&case, WebPlannerAdvance::Reset)
            .unwrap();
        assert_eq!(first.action, Some(native.actions[0]));

        case.rollout.initial_state = native.steps[0].after_state.clone();
        for row in &mut case.rollout.condition_transition_weights {
            row[MaterialCondition::Normal.index()] = 12.0;
            for condition in &MaterialCondition::ALL[1..] {
                row[condition.index()] = 0.35;
            }
        }
        let second = session
            .recommend_case(&case, WebPlannerAdvance::Continue(native.actions[0]))
            .unwrap();
        assert_eq!(second.action, Some(native.actions[1]));
    }

    #[test]
    fn bridge_stops_at_the_declared_action_limit() {
        let mut case = f36_case();
        case.trace_mode = GenericTraceMode::Full;
        case.rollout.max_steps = 1;
        let native = execute_generic_episode(&case).unwrap();
        assert_eq!(native.actions.len(), 1);

        let mut session = WebPlannerSession::default();
        let first = session
            .recommend_case(&case, WebPlannerAdvance::Reset)
            .unwrap();
        assert_eq!(first.action, Some(native.actions[0]));

        case.rollout.initial_state = native.steps[0].after_state.clone();
        let stopped = session
            .recommend_case(&case, WebPlannerAdvance::Continue(native.actions[0]))
            .unwrap();
        assert_eq!(stopped.action, None);
        assert_eq!(
            stopped.context_fingerprint,
            planner_context_fingerprint(case.solver_version, &native.planner_context),
        );
    }
}
