<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type CraftState, type RecipeProfile } from '@frozen-rabbit-expert/domain'

const props = defineProps<{ recipe: RecipeProfile; state: CraftState; qualityTarget?: number; specialist?: boolean }>()
const { t } = useI18n()

const progressPercent = computed(() => Math.min(100, props.state.progress / props.recipe.progressRequired * 100))
const displayedQualityTarget = computed(() => props.qualityTarget ?? props.recipe.qualityMax)
const qualityPercent = computed(() => Math.min(100, props.state.quality / displayedQualityTarget.value * 100))
const qualityLabel = computed(() => {
  if (displayedQualityTarget.value < props.recipe.qualityMax) return '品質（任務滿分目標）'
  if (props.qualityTarget !== undefined && props.recipe.requiredQuality === 0) return '品質（滿品質目標）'
  return '品質'
})
const activeBuffs = computed(() => Object.entries(props.state.buffs).filter(([, duration]) => duration > 0))
</script>

<template>
  <section class="state-panel" aria-label="目前製作狀態">
    <div class="state-primary">
      <div class="state-condition" :data-condition="state.condition">
        <span class="condition-dot" aria-hidden="true" />
        <span><small>目前球色</small><strong>{{ t(`condition.${state.condition}`) }}</strong></span>
      </div>
      <div class="resource-item"><small>耐久</small><strong>{{ state.durability }}</strong></div>
      <div class="resource-item"><small>CP</small><strong>{{ state.cp }}</strong></div>
      <div class="resource-item"><small>內靜</small><strong>{{ state.innerQuiet }}</strong></div>
    </div>

    <div class="state-meters">
      <div class="meter-block">
        <div class="meter-copy"><span>作業</span><strong>{{ state.progress.toLocaleString() }} / {{ recipe.progressRequired.toLocaleString() }}</strong></div>
        <div class="meter-track"><span class="meter-fill progress" :style="{ width: `${progressPercent}%` }" /></div>
      </div>
      <div class="meter-block">
        <div class="meter-copy"><span>{{ qualityLabel }}</span><strong>{{ state.quality.toLocaleString() }} / {{ displayedQualityTarget.toLocaleString() }}</strong></div>
        <div class="meter-track"><span class="meter-fill quality" :style="{ width: `${qualityPercent}%` }" /></div>
      </div>
    </div>

    <details v-if="activeBuffs.length" class="buff-details">
      <summary>{{ activeBuffs.length }} 個增益生效中</summary>
      <div class="buff-list"><span v-for="([buff, duration]) in activeBuffs" :key="buff" class="buff-chip">{{ buff }} · {{ duration }}</span></div>
    </details>
    <div v-if="specialist" class="buff-list" aria-label="專家技能剩餘次數">
      <span class="buff-chip">設計變動 · {{ state.carefulObservationUsesLeft }} / 3</span>
      <span class="buff-chip">專心致志 · {{ state.heartAndSoulAvailable ? '可用' : state.heartAndSoulActive ? '生效中' : '已用' }}</span>
      <span class="buff-chip">快速改革 · {{ state.quickInnovationAvailable ? '可用' : '已用' }}</span>
    </div>
  </section>
</template>
