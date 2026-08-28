use crate::{ActionPreview, CraftActionId, CraftState, CraftTerminal};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ContinuationEngine {
    Semantic,
    Budgeted,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RouteIntent {
    ProgressSetup,
    QualityBuild,
    BurstSetup,
    Burst,
    Finish,
    Recovery,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct RoutePlan {
    pub intent: RouteIntent,
    pub engine: ContinuationEngine,
    pub setup: Option<CraftActionId>,
    pub consumer: Option<CraftActionId>,
    pub interrupt: bool,
}

#[derive(Clone, Debug, Default, Eq, Hash, PartialEq)]
pub struct RouteMemory {
    pub active: Option<RoutePlan>,
    pub suspended: Option<RoutePlan>,
    pub state_signature: Option<u64>,
    pub switches: u32,
    pub interrupts: u32,
    pub resumes: u32,
    pub consumers_used: u32,
    pub rebuilds: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CandidateSource {
    Semantic,
    Budgeted,
    Route,
    Progress,
    Quality,
    Condition,
    Resource,
    Specialist,
    BestEffort,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateProposal {
    pub decision: super::super::GenericDecision,
    pub sources: Vec<CandidateSource>,
    /// Funded, observed-state-derived suffix, evaluated under the same worlds
    /// as other proposals. Actual execution still replans after every event.
    pub continuation_actions: Vec<CraftActionId>,
}

/// A found suffix is a witness under its declared Normal continuation.
/// Unknown preserves the distinction between search limits and impossibility.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CompletionEvidence {
    Completed,
    NormalRoute(CraftActionId),
    TerminalFailure,
    Unknown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BranchEvidence {
    pub probability: f64,
    /// Reference transition uses Normal except forced and no-step conditions.
    pub reference_state: CraftState,
    pub completion: CompletionEvidence,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CandidateEvidence {
    pub proposal: CandidateProposal,
    pub preview: ActionPreview,
    pub success: BranchEvidence,
    pub failure: Option<BranchEvidence>,
    pub completion_probability: f64,
    pub delivered_quality_utility: f64,
    pub unfinished_potential: f64,
    pub expected_actions: f64,
    pub forecast_samples: usize,
    pub forecast_horizon: usize,
    pub score: f64,
    /// Per-sample expected value, retaining the exact root branch weights.
    pub sample_values: Vec<f64>,
    pub selection_score: f64,
    /// Screened proposals retain their pilot evidence for diagnostics only.
    pub screened_out: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PortfolioWork {
    pub forecast_cache_hits: usize,
    pub completion_cache_hits: usize,
    pub proposals: usize,
    pub distinct_actions: usize,
    pub producer_calls: usize,
    pub continuation_calls: usize,
    pub continuation_cache_hits: usize,
    pub projected_transitions: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PortfolioRecommendation {
    pub decision: Option<super::super::GenericDecision>,
    pub candidates: Vec<CandidateEvidence>,
    pub work: PortfolioWork,
}

pub(crate) fn signature(state: &CraftState) -> u64 {
    hash_bytes(format!("{state:?}").as_bytes())
}

pub(crate) fn hash_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100_0000_01b3)
    })
}

impl RouteMemory {
    pub fn matches(&self, state: &CraftState) -> bool {
        self.state_signature == Some(signature(state))
    }

    pub(crate) fn observe(
        &mut self,
        decision: super::super::GenericDecision,
        before: &CraftState,
        after: &CraftState,
    ) {
        if self.state_signature.is_some() && !self.matches(before) {
            self.active = None;
            self.suspended = None;
            self.rebuilds = self.rebuilds.saturating_add(1);
        }
        let previous = self.active;
        if previous.is_some_and(|route| route.consumer == Some(decision.action))
            || self
                .suspended
                .is_some_and(|route| route.consumer == Some(decision.action))
        {
            self.consumers_used = self.consumers_used.saturating_add(1);
        }
        match decision.route {
            Some(route) if after.terminal == CraftTerminal::None => {
                if route.interrupt && previous.is_some_and(|active| !active.interrupt) {
                    self.suspended = previous;
                    self.interrupts = self.interrupts.saturating_add(1);
                }
                if !route.interrupt
                    && self.suspended.is_some_and(|saved| {
                        saved.intent == route.intent && saved.engine == route.engine
                    })
                {
                    self.suspended = None;
                    self.resumes = self.resumes.saturating_add(1);
                }
                if previous.is_some_and(|active| active.intent != route.intent) {
                    self.switches = self.switches.saturating_add(1);
                }
                self.active = Some(route);
            }
            _ => {
                self.active = None;
                self.suspended = None;
            }
        }
        self.state_signature = Some(signature(after));
    }
}
