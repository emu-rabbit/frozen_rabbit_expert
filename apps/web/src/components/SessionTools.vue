<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { CraftState, CrafterProfile, MaterialCondition, RecipeProfile } from '@frozen-rabbit-expert/domain'

const props = defineProps<{
  recipe: RecipeProfile
  crafter: CrafterProfile
  state: CraftState
  canUndo: boolean
}>()
const emit = defineEmits<{
  undo: []
  export: []
  restart: [profile: Pick<CrafterProfile, 'craftsmanship' | 'control' | 'maxCp' | 'cosmicToolGoodBonus'>]
  resync: [patch: Partial<CraftState>, reason: string]
}>()

const showStats = ref(false)
const showResync = ref(false)
const stats = reactive({
  craftsmanship: props.crafter.craftsmanship,
  control: props.crafter.control,
  maxCp: props.crafter.maxCp,
  cosmicToolGoodBonus: props.crafter.cosmicToolGoodBonus,
})
const correction = reactive({
  progress: props.state.progress,
  quality: props.state.quality,
  durability: props.state.durability,
  cp: props.state.cp,
  innerQuiet: props.state.innerQuiet,
  condition: props.state.condition as MaterialCondition,
})
const reason = ref('與遊戲內數值不一致')

watch(() => props.state, (state) => Object.assign(correction, {
  progress: state.progress, quality: state.quality, durability: state.durability,
  cp: state.cp, innerQuiet: state.innerQuiet, condition: state.condition,
}), { deep: true })

function restart(): void {
  emit('restart', {
    craftsmanship: Math.max(1, Math.round(stats.craftsmanship)),
    control: Math.max(1, Math.round(stats.control)),
    maxCp: Math.max(1, Math.round(stats.maxCp)),
    cosmicToolGoodBonus: stats.cosmicToolGoodBonus,
  })
  showStats.value = false
}

function resync(): void {
  const progress = Math.max(0, Math.min(props.recipe.progressRequired, Math.round(correction.progress)))
  const quality = Math.max(0, Math.min(props.recipe.qualityMax, Math.round(correction.quality)))
  const durability = Math.min(props.recipe.durabilityMax, Math.round(correction.durability))
  const terminal = progress >= props.recipe.progressRequired
    ? quality >= props.recipe.requiredQuality ? 'completed' : 'failed'
    : durability <= 0 ? 'failed' : 'none'
  emit('resync', {
    progress, quality, durability,
    cp: Math.max(0, Math.min(props.crafter.maxCp, Math.round(correction.cp))),
    innerQuiet: Math.max(0, Math.min(10, Math.round(correction.innerQuiet))),
    condition: correction.condition,
    terminal,
    failureReason: terminal === 'failed' ? (progress >= props.recipe.progressRequired ? 'required-quality' : 'durability') : null,
  }, reason.value.trim() || '手動校正')
  showResync.value = false
}
</script>

<template>
  <section class="session-tools" aria-label="製作工作階段工具">
    <div class="tool-buttons">
      <button type="button" class="ghost-button" :disabled="!canUndo" @click="emit('undo')">↶ 復原上一步</button>
      <button type="button" class="ghost-button" @click="showStats = !showStats">更換三圍／重新開始</button>
      <button type="button" class="ghost-button" @click="showResync = !showResync">進階：校正狀態</button>
      <button type="button" class="ghost-button" @click="emit('export')">匯出紀錄</button>
    </div>

    <form v-if="showStats" class="tool-form" @submit.prevent="restart">
      <div class="tool-form-heading">
        <div><span class="field-label">EQUIPMENT STATS</span><h3>輸入遊戲角色面板三圍</h3></div>
        <p>套用後會重置目前這一場模擬。</p>
      </div>
      <div class="input-grid">
        <label>作業精度<input v-model.number="stats.craftsmanship" type="number" min="1" required /></label>
        <label>加工精度<input v-model.number="stats.control" type="number" min="1" required /></label>
        <label>CP<input v-model.number="stats.maxCp" type="number" min="1" required /></label>
      </div>
      <label class="toggle-field tool-toggle">
        <input v-model="stats.cosmicToolGoodBonus" type="checkbox" role="switch" />
        <span><strong>裝備宇宙工具</strong><small>高品質時使用 1.75× 品質倍率</small></span>
      </label>
      <button type="submit" class="primary-button">套用並開始新製作</button>
    </form>

    <form v-if="showResync" class="tool-form" @submit.prevent="resync">
      <div class="tool-form-heading">
        <div><span class="field-label">STATE RESYNC</span><h3>用遊戲畫面校正目前狀態</h3></div>
        <p>這是除錯用進階功能，正常模擬不需要操作。</p>
      </div>
      <div class="input-grid resync-grid">
        <label>作業<input v-model.number="correction.progress" type="number" min="0" :max="recipe.progressRequired" /></label>
        <label>品質<input v-model.number="correction.quality" type="number" min="0" :max="recipe.qualityMax" /></label>
        <label>耐久<input v-model.number="correction.durability" type="number" :max="recipe.durabilityMax" /></label>
        <label>CP<input v-model.number="correction.cp" type="number" min="0" :max="crafter.maxCp" /></label>
        <label>內靜<input v-model.number="correction.innerQuiet" type="number" min="0" max="10" /></label>
        <label>Condition<select v-model="correction.condition"><option value="normal">通常</option><option value="good">高品質</option><option value="centered">安定</option><option value="sturdy">結實</option><option value="pliant">高效</option><option value="malleable">大進展</option></select></label>
      </div>
      <label class="reason-input">校正原因<input v-model="reason" type="text" maxlength="100" /></label>
      <button type="submit" class="primary-button">記錄校正</button>
    </form>
  </section>
</template>
