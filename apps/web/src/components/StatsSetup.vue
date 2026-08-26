<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'
import { RISK_PREFERENCES, type RiskPreference } from '@frozen-rabbit-expert/solver'

type EquipmentProfile = Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'>

const props = defineProps<{
  recipe: RecipeProfile
  initial?: EquipmentProfile | null
  defaultProfile?: EquipmentProfile
  initialRiskPreference?: RiskPreference
}>()
const emit = defineEmits<{
  start: [profile: EquipmentProfile, riskPreference: RiskPreference]
}>()

const riskPreference = ref<RiskPreference>(props.initialRiskPreference ?? 'balanced')

const stats = reactive({
  craftsmanship: props.initial?.craftsmanship ?? props.defaultProfile?.craftsmanship ?? 5408,
  control: props.initial?.control ?? props.defaultProfile?.control ?? 5237,
  maxCp: props.initial?.maxCp ?? props.defaultProfile?.maxCp ?? 749,
  cosmicToolGoodBonus: props.initial?.cosmicToolGoodBonus ?? props.defaultProfile?.cosmicToolGoodBonus ?? true,
  specialist: props.initial?.specialist ?? props.defaultProfile?.specialist ?? false,
})

const objectiveCopy = computed(() => {
  if (props.recipe.requiredQuality > 0) {
    return `此配方必須同時完成作業與必要品質，決策器會繼續追求滿品質 ${props.recipe.qualityMax.toLocaleString()}。`
  }
  if (props.recipe.qualityOutcome === 'hq-chance') {
    return '遊戲判定上只要作業完成即成功；決策器以 50%／75%／100% HQ 機率檔位保護交貨決策，並持續比較更高 HQ 機率。'
  }
  return '遊戲判定上只要作業完成即成功；一般收藏品依 100／300／700／滿品質四檔比較，沒有一般四檔的收藏品則持續提高品質。'
})

function start(): void {
  emit('start', {
    craftsmanship: Math.max(1, Math.round(stats.craftsmanship)),
    control: Math.max(1, Math.round(stats.control)),
    maxCp: Math.max(1, Math.round(stats.maxCp)),
    cosmicToolGoodBonus: stats.cosmicToolGoodBonus,
    specialist: stats.specialist,
  }, riskPreference.value)
}
</script>

<template>
  <section class="setup-card" aria-labelledby="setup-title">
    <div class="setup-copy">
      <p class="section-kicker">READY TO SIMULATE</p>
      <h2 id="setup-title">輸入裝備三圍</h2>
      <p>
        目前目標為「{{ recipe.displayName }}」。此配方使用跨配方通用策略的開發預覽；
        {{ objectiveCopy }}
      </p>
    </div>
    <form class="stats-form" @submit.prevent="start">
      <label>
        <span>作業精度</span>
        <input v-model.number="stats.craftsmanship" name="craftsmanship" type="number" min="1" required inputmode="numeric" />
      </label>
      <label>
        <span>加工精度</span>
        <input v-model.number="stats.control" name="control" type="number" min="1" required inputmode="numeric" />
      </label>
      <label>
        <span>CP</span>
        <input v-model.number="stats.maxCp" name="cp" type="number" min="1" required inputmode="numeric" />
      </label>
      <label class="toggle-field">
        <input v-model="stats.cosmicToolGoodBonus" name="cosmicToolGoodBonus" type="checkbox" role="switch" />
        <span><strong>裝備宇宙工具</strong><small>高品質時，品質倍率由 1.5× 提高為 1.75×</small></span>
      </label>
      <label class="toggle-field">
        <input v-model="stats.specialist" name="specialist" type="checkbox" role="switch" />
        <span><strong>使用專家證</strong><small>啟用設計變動、專心致志與快速改革；三圍請填角色面板最終值，不會重複加成</small></span>
      </label>
      <fieldset class="risk-preference-field">
        <legend>決策取向</legend>
        <p>三種模式都遵守技能合法性與必要品質；差別是願意為高品質承擔多少隨機失敗風險。</p>
        <div class="risk-preference-options">
          <label v-for="preference in RISK_PREFERENCES" :key="preference" :class="{ active: riskPreference === preference }">
            <input v-model="riskPreference" type="radio" name="riskPreference" :value="preference" />
            <span>
              <strong>{{ preference === 'stable' ? '穩健' : preference === 'balanced' ? '平衡' : '進取' }}</strong>
              <small>{{ preference === 'stable' ? '優先保住完工路線' : preference === 'balanced' ? '兼顧完成與品質尾端' : '接受更高變異追求高品質' }}</small>
            </span>
          </label>
        </div>
      </fieldset>
      <button type="submit" class="primary-button start-button">開始這場製作</button>
    </form>
    <p class="setup-note">套用後會保存在此瀏覽器，下次測試會直接帶入。</p>
  </section>
</template>
