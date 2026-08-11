<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import type { Recommendation } from '@frozen-rabbit-expert/solver'
import ActionIcon from './ActionIcon.vue'

defineProps<{ recommendation: Recommendation; locked?: boolean }>()
const emit = defineEmits<{ select: [action: CraftActionId] }>()
const { t } = useI18n()
</script>

<template>
  <section class="recommendation-card" aria-labelledby="recommendation-title" aria-live="polite">
    <div class="recommendation-main">
      <ActionIcon :action="recommendation.action" size="large" />
      <div class="recommendation-copy">
        <div class="recommendation-kicker">
          <span>{{ t(`solver.phase.${recommendation.phase}`) }}</span>
          <span class="recommendation-model">LOOKAHEAD · GUIDE π₀</span>
        </div>
        <h2 id="recommendation-title">{{ t(`action.${recommendation.action}`) }}</h2>
        <p>{{ t(`solver.reason.${recommendation.reasons[0]}`) }}</p>
        <div class="recommendation-statuses">
          <span :class="`finisher-status finisher-status--${recommendation.progressFinisher}`">
            {{ t(`solver.finisher.${recommendation.progressFinisher}`) }}
          </span>
          <span>{{ t(`solver.coverage.${recommendation.confidence.policyCoverage}`) }}</span>
          <span>{{ t('solver.conditionAssumed') }}</span>
        </div>
      </div>
      <button type="button" class="primary-button recommendation-use" :disabled="locked" @click="emit('select', recommendation.action)">
        使用此技能
      </button>
    </div>

    <div v-if="recommendation.alternatives.length" class="recommendation-alternatives">
      <span class="alternative-label">替代選擇</span>
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
  </section>
</template>
