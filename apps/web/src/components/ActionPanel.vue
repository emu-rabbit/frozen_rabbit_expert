<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ACTIONS,
  ACTION_IDS,
  previewAction,
  type ActionPreview,
  type CraftActionId,
  type CraftState,
  type CrafterProfile,
  type RecipeProfile,
} from '@frozen-rabbit-expert/domain'
import ActionIcon from './ActionIcon.vue'

const props = defineProps<{ recipe: RecipeProfile; crafter: CrafterProfile; state: CraftState; locked?: boolean; recommendedAction?: CraftActionId | undefined }>()
const emit = defineEmits<{ select: [action: CraftActionId] }>()
const { t } = useI18n()
const activeCategory = ref<'progress' | 'quality' | 'repair' | 'buff' | 'utility'>('progress')

const categories = ['progress', 'quality', 'repair', 'buff', 'utility'] as const
const previews = computed(() => ACTION_IDS
  .filter((id) => ACTIONS[id].specialistOnly !== true || props.crafter.specialist === true)
  .map((id) => previewAction(props.recipe, props.crafter, props.state, id)))
const visibleActions = computed(() => previews.value.filter((preview) => preview.action.category === activeCategory.value))

function reasonText(reason: string | undefined): string {
  const reasons: Record<string, string> = {
    terminal: '製作已結束', 'wrong-step': '只能在第一步使用', condition: '需要高品質 condition',
    'waste-not-conflict': '儉約生效時不可使用', 'inner-quiet-required': '需要至少 1 層內靜',
    'inner-quiet-ten-required': '需要 10 層內靜', 'expedience-required': '需要 Expedience',
    'already-used': '本次製作已使用', specialist: '需要啟用專家證',
    'careful-observation-exhausted': '本次製作的 3 次設計變動已用完',
    'heart-and-soul-active': '專心致志已生效',
    'heart-and-soul-unavailable': '本次製作已使用專心致志',
    'innovation-active': '改革已生效',
    'quick-innovation-unavailable': '本次製作已使用快速改革', cp: 'CP 不足',
  }
  return reason ? (reasons[reason] ?? reason) : ''
}

function detail(preview: ActionPreview): string {
  const parts: string[] = []
  if (preview.progressGain) parts.push(`作業 +${preview.progressGain}`)
  if (preview.qualityGain) parts.push(`品質 +${preview.qualityGain}`)
  if (preview.durabilityCost) parts.push(`耐久 -${preview.durabilityCost}`)
  if (preview.cpCost) parts.push(`CP -${preview.cpCost}`)
  if (preview.successRate < 1) parts.push(`成功率 ${Math.round(preview.successRate * 100)}%`)
  return parts.join(' · ') || '不直接增加作業或品質'
}

function select(preview: ActionPreview): void {
  if (preview.legal) emit('select', preview.action.id)
}
</script>

<template>
  <section class="panel action-panel" aria-labelledby="actions-title">
    <div class="panel-heading compact">
      <div>
        <p class="section-kicker">CHOOSE AN ACTION</p>
        <h2 id="actions-title">選擇本步技能</h2>
      </div>
      <span class="manual-label">球色由玩家指定</span>
    </div>

    <div class="category-tabs" role="tablist" aria-label="技能分類">
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        role="tab"
        :aria-selected="activeCategory === category"
        :class="{ active: activeCategory === category }"
        @click="activeCategory = category"
      >
        {{ t(`category.${category}`) }}
      </button>
    </div>

    <div class="action-grid">
      <button
        v-for="preview in visibleActions"
        :key="preview.action.id"
        type="button"
        class="action-card"
        :class="{ 'action-card--recommended': preview.action.id === recommendedAction }"
        :disabled="!preview.legal || locked"
        :aria-label="`${t(`action.${preview.action.id}`)}，${preview.legal ? detail(preview) : reasonText(preview.reason)}`"
        @click="select(preview)"
      >
        <ActionIcon :action="preview.action.id" />
        <span class="action-copy">
          <strong>{{ t(`action.${preview.action.id}`) }} <span v-if="preview.action.id === recommendedAction" class="recommended-chip">推薦</span></strong>
          <small>{{ preview.legal ? detail(preview) : reasonText(preview.reason) }}</small>
        </span>
      </button>
    </div>
  </section>
</template>
