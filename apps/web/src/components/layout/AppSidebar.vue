<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { externalLinks } from '@/config/externalLinks'
import { useActiveCraftSession } from '@/composables/useActiveCraftSession'
import type { DataLocale } from '@/types/missionData'
import logo from '@/assets/logo.png'
import packageJson from '../../../package.json'

const emit = defineEmits<{
  navigate: []
  'open-sponsor': []
}>()

const { t, locale } = useI18n()
const route = useRoute()
const craftSession = useActiveCraftSession()
const version = packageJson.version
const activeItemName = computed(() => {
  const names = craftSession.activeSession.value?.item.names
  if (!names) return ''
  const language = locale.value as DataLocale
  return names[language] || names.en || Object.values(names)[0] || ''
})
</script>

<template>
  <div class="app-sidebar">
    <div class="sidebar-brand">
      <h1>
        <img :src="logo" :alt="t('app.logoAlt')" />
        <span>{{ t('app.title') }}</span>
      </h1>
      <p>{{ t('app.subtitle') }}</p>
    </div>

    <nav class="sidebar-navigation" :aria-label="t('nav.primary')">
      <RouterLink
        to="/"
        class="sidebar-link sidebar-link--primary"
        :class="{ 'sidebar-link--active': route.name === 'start' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-play-circle"></i>
        <span>{{ t('nav.start') }}</span>
      </RouterLink>

      <RouterLink
        to="/equipment-profiles"
        class="sidebar-link sidebar-link--primary"
        :class="{ 'sidebar-link--active': route.name === 'equipment-profiles' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-id-card"></i>
        <span>{{ t('nav.equipmentProfiles') }}</span>
      </RouterLink>

      <RouterLink
        v-if="craftSession.activeSession.value"
        to="/solver"
        class="sidebar-link sidebar-link--primary sidebar-link--craft"
        :class="{ 'sidebar-link--active': route.name === 'solver' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-hammer"></i>
        <span>
          <strong>{{ t('nav.solver') }}</strong>
          <small>{{ activeItemName }}</small>
        </span>
      </RouterLink>

      <hr class="sidebar-separator" />

      <RouterLink
        to="/favorites"
        class="sidebar-link sidebar-link--primary"
        :class="{ 'sidebar-link--active': route.name === 'favorites' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-star"></i>
        <span>{{ t('nav.favorites') }}</span>
      </RouterLink>

      <RouterLink
        to="/faq"
        class="sidebar-link sidebar-link--primary"
        :class="{ 'sidebar-link--active': route.name === 'faq' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-question-circle"></i>
        <span>{{ t('nav.faq') }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-footer">
      <RouterLink
        to="/settings"
        class="sidebar-link sidebar-link--settings"
        :class="{ 'sidebar-link--active': route.name === 'settings' }"
        @click="emit('navigate')"
      >
        <i class="pi pi-cog"></i>
        <span>{{ t('nav.settings') }}</span>
      </RouterLink>

      <div class="sidebar-external-links">
        <button class="sponsor-link" type="button" @click="emit('open-sponsor')">
          <i class="pi pi-heart-fill"></i>
          <span>{{ t('nav.sponsor') }}</span>
        </button>
        <a
          class="github-link"
          :href="externalLinks.github"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="pi pi-github"></i>
          <span>{{ t('nav.github') }}</span>
        </a>
      </div>

      <div class="sidebar-version">v{{ version }}</div>
    </div>
  </div>
</template>
