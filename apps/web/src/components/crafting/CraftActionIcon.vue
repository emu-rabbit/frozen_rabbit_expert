<script setup lang="ts">
import type { CraftActionId } from '@frozen-rabbit-expert/domain'

const props = defineProps<{ action: CraftActionId; size?: 'small' | 'large' }>()

const filenames: Partial<Record<CraftActionId, string>> = {
  basicSynthesis: 'basic-synthesis.png', rapidSynthesis: 'rapid-synthesis.png', carefulSynthesis: 'careful-synthesis.png',
  groundwork: 'groundwork.png', prudentSynthesis: 'prudent-synthesis.png', intensiveSynthesis: 'intensive-synthesis.png', muscleMemory: 'muscle-memory.png',
  basicTouch: 'basic-touch.png', hastyTouch: 'hasty-touch.png', standardTouch: 'standard-touch.png', advancedTouch: 'advanced-touch.png',
  prudentTouch: 'prudent-touch.png', preparatoryTouch: 'preparatory-touch.png', preciseTouch: 'precise-touch.png', byregotsBlessing: 'byregots-blessing.png',
  trainedFinesse: 'trained-finesse.png', refinedTouch: 'refined-touch.png', daringTouch: 'daring-touch.png', reflect: 'reflect.png',
  delicateSynthesis: 'delicate-synthesis.png', tricksOfTheTrade: 'tricks-of-the-trade.png', trainedPerfection: 'trained-perfection.png',
  mastersMend: 'masters-mend.png', immaculateMend: 'immaculate-mend.png', wasteNot: 'waste-not.png', wasteNot2: 'waste-not-ii.png',
  veneration: 'veneration.png', innovation: 'innovation.png', greatStrides: 'great-strides.png', manipulation: 'manipulation.png',
  observe: 'observe.png', finalAppraisal: 'final-appraisal.png',
}

const file = filenames[props.action]
const source = file ? `${import.meta.env.BASE_URL}action-icons/${file}` : null
</script>

<template>
  <span class="craft-action-icon" :class="`craft-action-icon--${size ?? 'large'}`" aria-hidden="true">
    <img v-if="source" :src="source" alt="" width="80" height="80" />
    <i v-else class="pi pi-sparkles"></i>
  </span>
</template>

<style scoped>
.craft-action-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border-radius: 0.85rem;
  background: #eaf4f1;
  color: #3e8f7a;
  box-shadow: inset 0 0 0 1px rgba(67, 115, 102, 0.1);
}
.craft-action-icon--large { width: 5.25rem; height: 5.25rem; }
.craft-action-icon--small { width: 2.6rem; height: 2.6rem; border-radius: 0.6rem; }
.craft-action-icon img { width: 100%; height: 100%; object-fit: cover; }
.craft-action-icon i { font-size: 1.4rem; }
html.dark .craft-action-icon { background: #17352e; color: #75bfa9; }
</style>
