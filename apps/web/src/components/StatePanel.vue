<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type CraftState, type RecipeProfile } from '@frozen-rabbit-expert/domain'

const props = defineProps<{ recipe: RecipeProfile; state: CraftState }>()
const { t } = useI18n()

const progressPercent = computed(() => Math.min(100, props.state.progress / props.recipe.progressRequired * 100))
const qualityPercent = computed(() => Math.min(100, props.state.quality / props.recipe.qualityMax * 100))
const activeBuffs = computed(() => Object.entries(props.state.buffs).filter(([, duration]) => duration > 0))
</script>

<template>
  <section class="panel state-panel" aria-labelledby="state-title">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">CURRENT CRAFT</p>
        <h2 id="state-title">目前狀態</h2>
      </div>
      <span class="step-badge">STEP {{ state.step }}</span>
    </div>

    <div class="condition-hero" :data-condition="state.condition">
      <span class="condition-dot" aria-hidden="true" />
      <div>
        <span class="field-label">本步使用 condition</span>
        <strong>{{ t(`condition.${state.condition}`) }}</strong>
      </div>
    </div>

    <div class="meter-block">
      <div class="meter-copy"><span>作業</span><strong>{{ state.progress.toLocaleString() }} / {{ recipe.progressRequired.toLocaleString() }}</strong></div>
      <div class="meter-track"><span class="meter-fill progress" :style="{ width: `${progressPercent}%` }" /></div>
    </div>
    <div class="meter-block">
      <div class="meter-copy"><span>品質</span><strong>{{ state.quality.toLocaleString() }} / {{ recipe.qualityMax.toLocaleString() }}</strong></div>
      <div class="meter-track"><span class="meter-fill quality" :style="{ width: `${qualityPercent}%` }" /></div>
    </div>

    <div class="resource-grid">
      <div><span class="field-label">耐久</span><strong>{{ state.durability }} / {{ recipe.durabilityMax }}</strong></div>
      <div><span class="field-label">CP</span><strong>{{ state.cp }}</strong></div>
      <div><span class="field-label">內靜</span><strong>{{ state.innerQuiet }} / 10</strong></div>
    </div>

    <div v-if="activeBuffs.length" class="buff-list" aria-label="生效中的增益">
      <span v-for="([buff, duration]) in activeBuffs" :key="buff" class="buff-chip">{{ buff }} · {{ duration }}</span>
    </div>
    <p v-else class="empty-buffs">目前沒有持續性增益</p>

    <div v-if="state.terminal !== 'none'" class="terminal-banner" :class="state.terminal">
      {{ state.terminal === 'completed'
        ? '製作完成'
        : state.failureReason === 'required-quality'
          ? '製作失敗：作業完成時品質未達 18,900'
          : '製作失敗：耐久歸零' }}
    </div>
  </section>
</template>
