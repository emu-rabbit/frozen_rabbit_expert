import type {
  CraftActionId,
  CrafterProfile,
  CraftState,
  RecipeProfile,
  SourceMetadata,
} from './types'

interface EmpiricalQualityCorrection {
  id: string
  recipeId: number
  control: number
  actionId: CraftActionId
  condition: CraftState['condition']
  innerQuiet: number
  innovationActive: boolean
  greatStridesActive: boolean
  calculatedGain: number
  observedGain: number
  source: SourceMetadata
}

export const EMPIRICAL_QUALITY_CORRECTIONS: readonly EmpiricalQualityCorrection[] = [
  {
    id: 'tw-7.51-recipe-36282-advanced-touch-control-5140-iq3-innovation',
    recipeId: 36282,
    control: 5140,
    actionId: 'advancedTouch',
    condition: 'normal',
    innerQuiet: 3,
    innovationActive: true,
    greatStridesActive: false,
    calculatedGain: 936,
    observedGain: 935,
    source: {
      sourceKind: 'empirical',
      patch: '7.51',
      verifiedAt: '2026-08-11',
      confidence: 'verified',
      sourceRevision: 'tw-player-capture:1786427113729+1786427155682+1786427178106',
      notes: [
        'TW client forecasted 935 quality and applied 935 for Advanced Touch at quality 1344.',
        'The same action sequence in Teamcraft simulator revision 74e167a produced quality 2280 instead of 2279.',
        'Correction is a temporary compatibility guard while the general game rounding pipeline is being identified.',
      ],
    },
  },
]

interface QualityCorrectionContext {
  recipe: RecipeProfile
  crafter: CrafterProfile
  state: CraftState
  actionId: CraftActionId
  calculatedGain: number
}

export function applyEmpiricalQualityCorrection(context: QualityCorrectionContext): number {
  const correction = EMPIRICAL_QUALITY_CORRECTIONS.find((candidate) => (
    candidate.recipeId === context.recipe.canonicalRecipeId
    && candidate.control === context.crafter.control
    && candidate.actionId === context.actionId
    && candidate.condition === context.state.condition
    && candidate.innerQuiet === context.state.innerQuiet
    && candidate.innovationActive === (context.state.buffs.innovation > 0)
    && candidate.greatStridesActive === (context.state.buffs.greatStrides > 0)
    && candidate.calculatedGain === context.calculatedGain
  ))

  return correction?.observedGain ?? context.calculatedGain
}
