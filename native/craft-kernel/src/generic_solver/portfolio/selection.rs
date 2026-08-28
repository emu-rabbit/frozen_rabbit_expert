use super::*;

fn paired_standard_error(candidate: &[f64], reference: &[f64]) -> f64 {
    assert_eq!(candidate.len(), reference.len());
    if candidate.len() < 2 {
        return 0.0;
    }
    let differences: Vec<_> = candidate
        .iter()
        .zip(reference)
        .map(|(candidate, reference)| candidate - reference)
        .collect();
    let n = differences.len() as f64;
    let mean = differences.iter().sum::<f64>() / n;
    let variance = differences
        .iter()
        .map(|value| (value - mean).powi(2))
        .sum::<f64>()
        / (n - 1.0);
    (variance / n).sqrt()
}

pub(super) fn reference_index(input: Input<'_>, candidates: &[CandidateEvidence]) -> Option<usize> {
    let active = input
        .context
        .route_memory
        .matches(input.state)
        .then_some(
            input
                .context
                .route_memory
                .suspended
                .or(input.context.route_memory.active),
        )
        .flatten();
    let risk = input.risk;
    let random_condition_mask = input.random_condition_mask;
    let reference_engine = active.map(|route| route.engine).unwrap_or_else(|| {
        if condition_set_portfolio_uses_budgeted_condition(
            input.recipe,
            risk,
            random_condition_mask,
        ) {
            ContinuationEngine::Budgeted
        } else {
            ContinuationEngine::Semantic
        }
    });
    candidates.iter().position(|entry| {
        entry
            .proposal
            .decision
            .route
            .is_some_and(|route| route.engine == reference_engine)
            && entry.proposal.sources.iter().any(|source| {
                matches!(
                    source,
                    CandidateSource::Semantic | CandidateSource::Budgeted
                )
            })
    })
}

pub(super) fn select(input: Input<'_>, result: &mut PortfolioRecommendation) {
    let Input {
        state,
        context,
        risk,
        ..
    } = input;
    let certain_failure = |entry: &&CandidateEvidence| {
        entry.success.completion == CompletionEvidence::TerminalFailure
            && entry
                .failure
                .as_ref()
                .is_none_or(|branch| branch.completion == CompletionEvidence::TerminalFailure)
    };
    let has_surviving_action = result
        .candidates
        .iter()
        .filter(|entry| !entry.screened_out)
        .any(|entry| !certain_failure(&entry));
    let active = context
        .route_memory
        .matches(state)
        .then_some(
            context
                .route_memory
                .suspended
                .or(context.route_memory.active),
        )
        .flatten();
    let continues = |entry: &CandidateEvidence| {
        active.is_some_and(|route| {
            entry
                .proposal
                .decision
                .route
                .is_some_and(|candidate| candidate.engine == route.engine)
        })
    };
    // The established capability is the reference for paired policy improvement.
    // A noisy alternative pays for uncertainty in its incremental value.
    let reference = reference_index(input, &result.candidates);
    if let Some(index) = reference {
        let values = result.candidates[index].sample_values.clone();
        let penalty = match risk {
            RiskPreference::Stable => 1.0,
            RiskPreference::Balanced => 0.5,
            RiskPreference::Aggressive => 0.25,
        };
        for entry in &mut result.candidates {
            if entry.screened_out {
                continue;
            }
            entry.selection_score =
                entry.score - penalty * paired_standard_error(&entry.sample_values, &values);
        }
    }
    result.decision = result
        .candidates
        .iter()
        .filter(|entry| !entry.screened_out)
        .max_by(|left, right| {
            (has_surviving_action && !certain_failure(left))
                .cmp(&(has_surviving_action && !certain_failure(right)))
                .then_with(|| left.selection_score.total_cmp(&right.selection_score))
                .then_with(|| continues(left).cmp(&continues(right)))
                .then_with(|| right.expected_actions.total_cmp(&left.expected_actions))
                .then_with(|| {
                    right
                        .proposal
                        .decision
                        .action
                        .cmp(&left.proposal.decision.action)
                })
        })
        .map(|entry| entry.proposal.decision);
}

#[cfg(test)]
mod tests {
    use super::paired_standard_error;

    #[test]
    fn comparison_uses_paired_gain_variation_instead_of_independent_route_variance() {
        let reference = [0.0, 3.0, 0.0, 3.0];
        let constant_gain = [0.1, 3.1, 0.1, 3.1];
        assert!(paired_standard_error(&constant_gain, &reference) < 1e-12);
        assert!(paired_standard_error(&[3.0, 0.0, 3.0, 0.0], &reference) > 1.0);
        assert_eq!(paired_standard_error(&reference, &reference), 0.0);
        assert_eq!(paired_standard_error(&[1.0], &[0.0]), 0.0);
    }
}
