<script setup lang="ts">
import type { CraftActionId } from '@frozen-rabbit-expert/domain'
import { ACTION_ICON_PATHS } from '../actionIcons'

withDefaults(defineProps<{ action: CraftActionId; size?: 'small' | 'medium' | 'large' }>(), {
  size: 'medium',
})
</script>

<template>
  <span class="action-icon" :class="`action-icon--${size}`" aria-hidden="true">
    <img :src="ACTION_ICON_PATHS[action]" alt="" width="80" height="80">
  </span>
</template>
