import { describe, expect, it } from 'vitest'
import { messages } from '../apps/web/src/i18n/messages'

describe('Traditional Chinese crafting action names', () => {
  it('uses the official Traditional Chinese names for the two trained actions', () => {
    expect(messages.tw.action.trainedFinesse).toBe('工匠的神技')
    expect(messages.tw.action.trainedPerfection).toBe('工匠的絕技')
    expect(messages.tw.action.delicateSynthesis).toBe('精密製作')
  })
})
