<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import type { Recommendation } from '@frozen-rabbit-expert/solver'
import ActionIcon from './ActionIcon.vue'

defineProps<{
  recommendation: Recommendation
  locked?: boolean
  plannerStatus: 'idle' | 'analyzing' | 'ready' | 'timed-out' | 'failed'
  plannerDurationMs?: number | null
  plannerError?: string | null
}>()
const emit = defineEmits<{ select: [action: CraftActionId] }>()
const { t } = useI18n()
</script>

<template>
  <section class="recommendation-card" aria-labelledby="recommendation-title" aria-live="polite">
    <div class="recommendation-main">
      <ActionIcon :action="recommendation.action" size="large" />
      <div class="recommendation-copy">
        <div class="recommendation-kicker">
          <span>推薦下一步</span>
          <span>{{ t(`solver.phase.${recommendation.phase}`) }}</span>
        </div>
        <h2 id="recommendation-title">{{ t(`action.${recommendation.action}`) }}</h2>
        <p>{{ t(`solver.reason.${recommendation.reasons[0]}`) }}</p>
      </div>
    </div>

    <p v-if="plannerError" class="recommendation-warning">{{ plannerError }}</p>

    <slot name="report" />

    <details class="recommendation-details">
      <summary>判斷依據與替代選擇</summary>
      <div class="recommendation-detail-content">
        <div class="recommendation-statuses">
          <span :class="`finisher-status finisher-status--${recommendation.progressFinisher}`">
            {{ t(`solver.finisher.${recommendation.progressFinisher}`) }}
          </span>
          <span>{{ t(`solver.coverage.${recommendation.confidence.policyCoverage}`) }}</span>
          <span v-if="plannerStatus === 'ready' && plannerDurationMs !== null && plannerDurationMs !== undefined">強決策 {{ plannerDurationMs.toFixed(0) }} ms</span>
          <span v-else-if="plannerStatus === 'timed-out' || plannerStatus === 'failed'">已使用快速備援</span>
        </div>
        <div v-if="recommendation.alternatives.length" class="recommendation-alternatives">
          <button
            v-for="alternative in recommendation.alternatives"
            :key="alternative.action"
            type="button"
            class="alternative-action"
            :disabled="locked"
            @click="emit('select', alternative.action)"
          >
            <ActionIcon :action="alternative.action" size="small" />
            <span><strong>{{ t(`action.${alternative.action}`) }}</strong><small>{{ t(`solver.tradeoff.${alternative.tradeoff}`) }}</small></span>
          </button>
        </div>
        <p class="model-limit">未來球色仍是未知；這是依目前狀態的推薦，不是保證成功。</p>
      </div>
    </details>
  </section>
</template>
