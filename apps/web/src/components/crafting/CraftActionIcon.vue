<script setup lang="ts">
import { computed } from 'vue'
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import { useMissionData } from '@/services/missionData'
import type { CraftJob } from '@/types/missionData'

const props = defineProps<{ action: CraftActionId; job: CraftJob; size?: 'small' | 'large' }>()
const { actionIcons } = useMissionData()

const source = computed(() => actionIcons.value?.[props.job]?.[props.action] ?? null)
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
