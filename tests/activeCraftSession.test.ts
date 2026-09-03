import { nextTick, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  ACTION_IDS,
  ACTIONS,
  type CrafterProfile,
} from '@frozen-rabbit-expert/domain'
import { COSMIC_EXPERT_CATALOG_VERSION } from '@frozen-rabbit-expert/data'
import { WEB_PLANNER_POLICY, type PlannerReply } from '../apps/web/src/runtime/planner/protocol'
import type { EquipmentProfile } from '../apps/web/src/composables/useEquipmentProfiles'
import type { CosmicMission, MissionItem } from '../apps/web/src/types/missionData'

const recommend = vi.hoisted(() => vi.fn())

vi.mock('../apps/web/src/runtime/planner', async () => {
  const protocol = await import('../apps/web/src/runtime/planner/protocol')
  return {
    ...protocol,
    plannerRuntime: { recommend },
  }
})

import {
  actionNeedsObservedCondition,
  startCraftSession,
  useActiveCraftSession,
} from '../apps/web/src/composables/useActiveCraftSession'
import { useRecommendationOutcome } from '../apps/web/src/composables/useRecommendationOutcome'

const reply = (action: PlannerReply['action']): PlannerReply => ({
  action,
  option: null,
  persona: null,
  policyVersion: WEB_PLANNER_POLICY,
  contextFingerprint: 'test-context',
})

const item: MissionItem = {
  recipeId: 37_006,
  itemId: 1,
  names: { tw: '測試製作物' },
  icon: '/test.png',
}
const mission: CosmicMission = {
  id: 1,
  names: { tw: '測試任務' },
  job: 'weaver',
  jobId: 8,
  jobIcon: '/job.png',
  rank: 'a',
  planet: 'sinus-ardorum',
  types: ['timed'],
  items: [item],
}
const equipmentProfile: EquipmentProfile = {
  id: 'test-profile',
  kind: 'custom',
  name: '測試裝備',
  jobs: ['weaver'],
  level: 100,
  craftsmanship: 5_408,
  control: 5_237,
  maxCp: 749,
  food: null,
  medicine: null,
  relicToolGoodBonus: true,
  specialist: true,
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
}
const crafter: CrafterProfile = {
  level: 100,
  craftsmanship: 5_408,
  control: 5_237,
  maxCp: 749,
  cosmicToolGoodBonus: true,
  specialist: true,
}

describe('active craft session input lock', () => {
  it('accepts only one action across a rapid repeated condition tap', async () => {
    let releaseContinuation!: (value: PlannerReply) => void
    const continuation = new Promise<PlannerReply>((resolve) => {
      releaseContinuation = resolve
    })
    recommend
      .mockReset()
      .mockResolvedValueOnce(reply('basicTouch'))
      .mockReturnValueOnce(continuation)

    startCraftSession({ mission, item, equipmentProfile, crafter })
    await vi.waitFor(() => expect(useActiveCraftSession().recommendation.value?.action).toBe('basicTouch'))

    const craft = useActiveCraftSession()
    const firstTap = craft.resolveAction('basicTouch', true, 'good')
    const repeatedTap = craft.resolveAction('basicTouch', true, 'good')

    expect(craft.inputLocked.value).toBe(true)
    expect(craft.actionCount.value).toBe(1)
    expect(recommend).toHaveBeenCalledTimes(2)

    releaseContinuation(reply('basicSynthesis'))
    await Promise.all([firstTap, repeatedTap])

    expect(craft.inputLocked.value).toBe(false)
    expect(craft.actionCount.value).toBe(1)
    expect(craft.state.value?.step).toBe(2)
    expect(craft.state.value?.condition).toBe('good')
  })
})

describe('craft action condition reporting', () => {
  it('asks for the next condition after Observe and every ordinary advancing action', () => {
    expect(actionNeedsObservedCondition('observe', 'normal')).toBe(true)

    for (const action of ACTION_IDS.filter(action => !ACTIONS[action].noStep)) {
      expect(actionNeedsObservedCondition(action, 'normal'), action).toBe(true)
    }
  })

  it('distinguishes no-step preservation, explicit rerolls, and forced next conditions', () => {
    expect(actionNeedsObservedCondition('finalAppraisal', 'normal')).toBe(false)
    expect(actionNeedsObservedCondition('heartAndSoul', 'normal')).toBe(false)
    expect(actionNeedsObservedCondition('quickInnovation', 'normal')).toBe(false)
    expect(actionNeedsObservedCondition('carefulObservation', 'normal')).toBe(true)

    expect(actionNeedsObservedCondition('observe', 'goodOmen')).toBe(false)
    expect(actionNeedsObservedCondition('observe', 'robust')).toBe(false)
  })

  it('restores condition reporting when the solver recommends the same action again', async () => {
    const recommendation = shallowRef<PlannerReply | null>(reply('observe'))
    const reportedSuccess = useRecommendationOutcome(recommendation, () => false)

    expect(reportedSuccess.value).toBe(true)
    reportedSuccess.value = null
    recommendation.value = reply('observe')
    await nextTick()

    expect(reportedSuccess.value).toBe(true)
  })
})

describe('active craft session export', () => {
  it('exports the current anonymous replay contract and runtime identities', () => {
    recommend.mockReset().mockResolvedValue(reply('basicTouch'))
    startCraftSession({ mission, item, equipmentProfile, crafter })

    const exported = useActiveCraftSession().exportSession()

    expect(exported?.manifest).toMatchObject({
      schema: 'expert-session-v0.11.0',
      scenarioId: 'cosmic-expert-37006',
      modelVersions: {
        plannerPolicy: WEB_PLANNER_POLICY,
        recipeCatalog: COSMIC_EXPERT_CATALOG_VERSION,
      },
    })
    expect(exported?.events.map(event => event.type)).toEqual([
      'craftStarted',
      'conditionSelected',
    ])
    const serialized = JSON.stringify(exported)
    expect(serialized).not.toContain(equipmentProfile.name)
    expect(serialized).not.toContain(mission.names.tw)
    expect(serialized).not.toContain('support')
  })
})
