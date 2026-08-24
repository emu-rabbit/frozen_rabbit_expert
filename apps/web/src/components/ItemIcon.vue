<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  fileName: string
  itemName: string
  size?: 'small' | 'medium' | 'large'
}>(), { size: 'medium' })

const source = computed(() => props.fileName.length > 0
  ? `${import.meta.env.BASE_URL}item-icons/${props.fileName}`
  : '')
const failed = ref(props.fileName.length === 0)
watch(source, () => { failed.value = props.fileName.length === 0 })
</script>

<template>
  <img
    v-if="!failed"
    class="item-icon"
    :class="`item-icon--${size}`"
    :src="source"
    :alt="`${itemName} icon`"
    width="80"
    height="80"
    @error="failed = true"
  />
  <span
    v-else
    class="item-icon item-icon--fallback"
    :class="`item-icon--${size}`"
    role="img"
    :aria-label="`${itemName} icon unavailable`"
  >◇</span>
</template>
