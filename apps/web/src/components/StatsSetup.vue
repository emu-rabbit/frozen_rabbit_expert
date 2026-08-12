<script setup lang="ts">
import { reactive } from 'vue'
import type { CrafterProfile, RecipeProfile } from '@frozen-rabbit-expert/domain'

const props = defineProps<{ recipe: RecipeProfile; initial?: Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus'> | null }>()
const emit = defineEmits<{
  start: [profile: Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus'>]
}>()

const stats = reactive({
  craftsmanship: props.initial?.craftsmanship ?? 5408,
  control: props.initial?.control ?? 5237,
  maxCp: props.initial?.maxCp ?? 749,
  cosmicToolGoodBonus: props.initial?.cosmicToolGoodBonus ?? true,
})

function start(): void {
  emit('start', {
    craftsmanship: Math.max(1, Math.round(stats.craftsmanship)),
    control: Math.max(1, Math.round(stats.control)),
    maxCp: Math.max(1, Math.round(stats.maxCp)),
    cosmicToolGoodBonus: stats.cosmicToolGoodBonus,
  })
}
</script>

<template>
  <section class="setup-card" aria-labelledby="setup-title">
    <div class="setup-copy">
      <p class="section-kicker">READY TO SIMULATE</p>
      <h2 id="setup-title">輸入裝備三圍</h2>
      <p>配方固定為「{{ recipe.displayName }}」。預設值是目前完成 31／72 測試所使用的裝備與藥水後數值。</p>
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
      <button type="submit" class="primary-button start-button">開始這場製作</button>
    </form>
    <p class="setup-note">套用後會保存在此瀏覽器，下次測試會直接帶入。</p>
  </section>
</template>
