<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'

type EquipmentProfile = Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus' | 'specialist'>

const props = defineProps<{
  recipe: RecipeProfile
  qualityTarget?: number
  initial?: EquipmentProfile | null
  defaultProfile?: EquipmentProfile
}>()
const emit = defineEmits<{
  start: [profile: EquipmentProfile]
}>()

const stats = reactive({
  craftsmanship: props.initial?.craftsmanship ?? props.defaultProfile?.craftsmanship ?? 5408,
  control: props.initial?.control ?? props.defaultProfile?.control ?? 5237,
  maxCp: props.initial?.maxCp ?? props.defaultProfile?.maxCp ?? 749,
  cosmicToolGoodBonus: props.initial?.cosmicToolGoodBonus ?? props.defaultProfile?.cosmicToolGoodBonus ?? true,
  specialist: props.initial?.specialist ?? props.defaultProfile?.specialist ?? false,
})

const objectiveCopy = computed(() => {
  if (props.recipe.requiredQuality > 0) {
    return '此配方必須同時完成作業與必要品質。'
  }
  if (props.qualityTarget !== undefined && props.qualityTarget >= props.recipe.qualityMax) {
    return `遊戲判定上只要作業完成即成功；本策略以安全完工並達到滿品質 ${props.recipe.qualityMax.toLocaleString()} 為目標。`
  }
  if (props.qualityTarget !== undefined) {
    return `遊戲判定上只要作業完成即成功；本策略以安全完工並達到品質 ${props.qualityTarget.toLocaleString()} 為目標。`
  }
  return '此配方作業完成即成功，決策器會保留完工路線並提高品質。'
})

function start(): void {
  emit('start', {
    craftsmanship: Math.max(1, Math.round(stats.craftsmanship)),
    control: Math.max(1, Math.round(stats.control)),
    maxCp: Math.max(1, Math.round(stats.maxCp)),
    cosmicToolGoodBonus: stats.cosmicToolGoodBonus,
    specialist: stats.specialist,
  })
}
</script>

<template>
  <section class="setup-card" aria-labelledby="setup-title">
    <div class="setup-copy">
      <p class="section-kicker">READY TO SIMULATE</p>
      <h2 id="setup-title">輸入裝備三圍</h2>
      <p>
        目前目標為「{{ recipe.displayName }}」。預設裝備值來自目前的實戰 profile；
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
      <button type="submit" class="primary-button start-button">開始這場製作</button>
    </form>
    <p class="setup-note">套用後會保存在此瀏覽器，下次測試會直接帶入。</p>
  </section>
</template>
