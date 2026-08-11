import type { CraftActionId } from '@frozen-rabbit-expert/domain'

export type TechniqueCoverage = 'poc-supported' | 'mechanics-pending' | 'mission-pending'

export interface GuideTechnique {
  id: string
  category:
    | 'opener'
    | 'progress-control'
    | 'condition-response'
    | 'inner-quiet'
    | 'buff-window'
    | 'durability'
    | 'cp-reserve'
    | 'finisher'
    | 'specialist'
    | 'mission'
  summary: string
  coverage: TechniqueCoverage
  actions: readonly CraftActionId[]
  sequences?: readonly (readonly CraftActionId[])[]
  sources: readonly string[]
}

const OFFICIAL_ACTION_GUIDE = 'https://na.finalfantasyxiv.com/crafting_gathering_guide/weaver/'
const ICY_VEINS_EXPERT_GUIDE = 'https://www.icy-veins.com/ffxiv/expert-crafting'
const THALS_EXPERT_GUIDE = 'https://thiria.com/expert/guide/'
const EXPERT_CONDITION_REFERENCE = 'https://ffxiv.consolegameswiki.com/wiki/Expert_Recipes'

/**
 * Machine-readable research catalog. These are candidate-generating and test
 * signals, not exact mechanics and not unconditional action rules.
 */
export const GUIDE_TECHNIQUES: readonly GuideTechnique[] = [
  {
    id: 'muscle-memory-progress-staging',
    category: 'opener',
    summary: 'Use Muscle Memory and a short Veneration window to approach, but not cross, a reliable progress finisher.',
    coverage: 'poc-supported',
    actions: ['muscleMemory', 'veneration', 'rapidSynthesis', 'groundwork', 'carefulSynthesis', 'finalAppraisal'],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE],
  },
  {
    id: 'reflect-quality-opener',
    category: 'opener',
    summary: 'Reflect trades early progress certainty for faster Inner Quiet growth when later conditions can supply progress.',
    coverage: 'poc-supported',
    actions: ['reflect', 'rapidSynthesis', 'intensiveSynthesis'],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE],
  },
  {
    id: 'progress-headroom',
    category: 'progress-control',
    summary: 'Keep enough progress headroom to spend remaining resources on quality and preserve a deterministic finishing route.',
    coverage: 'poc-supported',
    actions: ['basicSynthesis', 'carefulSynthesis', 'prudentSynthesis', 'finalAppraisal'],
    sources: [ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'condition-resource-conversion',
    category: 'condition-response',
    summary: 'Treat conditions as competing resource opportunities: Good for quality/CP/progress, Centered for risky actions, Sturdy for durability, Pliant for CP, and Malleable for progress.',
    coverage: 'poc-supported',
    actions: [
      'preciseTouch', 'tricksOfTheTrade', 'intensiveSynthesis', 'rapidSynthesis',
      'hastyTouch', 'preparatoryTouch', 'manipulation', 'immaculateMend',
      'veneration', 'innovation', 'groundwork',
    ],
    sources: [EXPERT_CONDITION_REFERENCE, ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'touch-combo-economy',
    category: 'inner-quiet',
    summary: 'Compare full Touch routes, including their CP discount, durability, Inner Quiet growth, condition opportunity, and buff-slot cost.',
    coverage: 'poc-supported',
    actions: ['basicTouch', 'standardTouch', 'advancedTouch', 'refinedTouch', 'observe'],
    sequences: [
      ['basicTouch', 'standardTouch', 'advancedTouch'],
      ['basicTouch', 'refinedTouch'],
      ['observe', 'advancedTouch'],
    ],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'inner-quiet-efficient-growth',
    category: 'inner-quiet',
    summary: 'Reach ten Inner Quiet efficiently using Precise, Prudent, Preparatory, Refined, and combo Touch routes before spending CP on the final quality burst.',
    coverage: 'poc-supported',
    actions: ['preciseTouch', 'prudentTouch', 'preparatoryTouch', 'refinedTouch', 'basicTouch'],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE],
  },
  {
    id: 'innovation-window-packing',
    category: 'buff-window',
    summary: 'Evaluate the complete four-step Innovation schedule, including setup actions that consume a slot and the final Byregot window.',
    coverage: 'poc-supported',
    actions: ['innovation', 'basicTouch', 'standardTouch', 'advancedTouch', 'observe', 'trainedFinesse', 'greatStrides', 'byregotsBlessing'],
    sequences: [
      ['innovation', 'basicTouch', 'standardTouch', 'advancedTouch'],
      ['innovation', 'observe', 'advancedTouch', 'observe', 'advancedTouch'],
      ['innovation', 'greatStrides', 'byregotsBlessing'],
    ],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'durability-cycle-efficiency',
    category: 'durability',
    summary: 'Avoid repair overcap and compare Manipulation, Mend, Waste Not, Prudent, Preparatory, and Trained Perfection over the actions their durability enables.',
    coverage: 'poc-supported',
    actions: ['manipulation', 'mastersMend', 'immaculateMend', 'wasteNot', 'wasteNot2', 'prudentTouch', 'preparatoryTouch', 'trainedPerfection'],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'quality-finisher-reserve',
    category: 'finisher',
    summary: 'Reserve recipe-specific CP, durability, progress actions, Innovation, Great Strides, and Byregot instead of using a universal fixed reserve.',
    coverage: 'poc-supported',
    actions: ['innovation', 'greatStrides', 'byregotsBlessing', 'trainedFinesse', 'basicSynthesis', 'carefulSynthesis'],
    sequences: [
      ['innovation', 'greatStrides', 'byregotsBlessing'],
      ['greatStrides', 'observe', 'byregotsBlessing'],
    ],
    sources: [ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'primed-robust-good-omen',
    category: 'condition-response',
    summary: 'Primed extends the next buff, Robust preserves durability and forces Sturdy, and Good Omen enables deliberate next-step setup.',
    coverage: 'mechanics-pending',
    actions: ['innovation', 'manipulation', 'greatStrides', 'preparatoryTouch'],
    sources: [EXPERT_CONDITION_REFERENCE, ICY_VEINS_EXPERT_GUIDE],
  },
  {
    id: 'specialist-condition-control',
    category: 'specialist',
    summary: 'Careful Observation, Heart and Soul, and Quick Innovation change condition access or preserve a finisher window without normal step semantics.',
    coverage: 'mechanics-pending',
    actions: ['observe', 'innovation', 'preciseTouch', 'intensiveSynthesis', 'tricksOfTheTrade'],
    sources: [OFFICIAL_ACTION_GUIDE, ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
  {
    id: 'stellar-action-allocation',
    category: 'mission',
    summary: 'Material Miracle and Stellar Steady Hand require mission-time and cross-craft allocation rather than ordinary per-step buff scoring.',
    coverage: 'mission-pending',
    actions: ['rapidSynthesis', 'hastyTouch'],
    sources: [ICY_VEINS_EXPERT_GUIDE, THALS_EXPERT_GUIDE],
  },
] as const

export const POC_GUIDE_TECHNIQUES = GUIDE_TECHNIQUES.filter(
  (technique) => technique.coverage === 'poc-supported',
)
