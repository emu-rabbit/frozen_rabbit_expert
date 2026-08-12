<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  fileName: string
  itemName: string
  size?: 'small' | 'medium' | 'large'
}>(), { size: 'medium' })

const source = computed(() => `${import.meta.env.BASE_URL}item-icons/${props.fileName}`)
</script>

<template>
  <img
    class="item-icon"
    :class="`item-icon--${size}`"
    :src="source"
    :alt="`${itemName} icon`"
    width="80"
    height="80"
  />
</template>
