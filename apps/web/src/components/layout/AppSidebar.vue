<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { externalLinks } from '@/config/externalLinks'
import logo from '@/assets/logo.png'
import packageJson from '../../../package.json'

const emit = defineEmits<{
  navigate: []
  'open-sponsor': []
}>()

const { t } = useI18n()
const route = useRoute()
const version = packageJson.version
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
