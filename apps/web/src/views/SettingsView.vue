<script setup lang="ts">
import SelectButton from 'primevue/selectbutton'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreferences } from '@/composables/usePreferences'
import { externalLinks } from '@/config/externalLinks'

const { t } = useI18n()
const { language, isDarkMode } = usePreferences()

const languageOptions = [
  { label: '繁體中文', value: 'tw' },
  { label: '简体中文', value: 'cn' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
]

const dataSources = computed(() => [
  { name: 'Teamcraft', description: t('settings.sources.teamcraft'), href: externalLinks.teamcraft },
  { name: 'XIVAPI', description: t('settings.sources.xivapi'), href: externalLinks.xivapi },
])
</script>

<template>
  <div class="settings-view">
    <header class="settings-header">
      <h1>{{ t('settings.title') }}</h1>
      <p>{{ t('settings.description') }}</p>
    </header>

    <div class="settings-stack">
      <section class="settings-card">
        <div class="settings-section-heading">
          <i class="pi pi-palette"></i>
          <h2>{{ t('settings.appearanceTitle') }}</h2>
        </div>
        <p class="settings-section-description">{{ t('settings.appearanceDescription') }}</p>
        <div class="settings-row">
          <div>
            <strong>{{ t('settings.darkMode') }}</strong>
            <span>{{ t('settings.darkModeDescription') }}</span>
          </div>
          <button
            class="theme-switch"
            :class="{ 'theme-switch--active': isDarkMode }"
            type="button"
            role="switch"
            :aria-checked="isDarkMode"
            :aria-label="t('settings.darkMode')"
            @click="isDarkMode = !isDarkMode"
          >
            <span><i :class="isDarkMode ? 'pi pi-moon' : 'pi pi-sun'"></i></span>
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-section-heading">
          <i class="pi pi-language"></i>
          <h2>{{ t('settings.languageTitle') }}</h2>
        </div>
        <p class="settings-section-description">{{ t('settings.languageDescription') }}</p>
        <div class="settings-language-scroll">
          <SelectButton
            v-model="language"
            :options="languageOptions"
            option-label="label"
            option-value="value"
            class="settings-language-toggle"
            :aria-label="t('settings.languageTitle')"
            :allow-empty="false"
          />
        </div>
      </section>

      <section class="settings-card settings-card--sources">
        <div class="settings-section-heading">
          <i class="pi pi-database"></i>
          <h2>{{ t('settings.dataSourcesTitle') }}</h2>
        </div>
        <p class="settings-section-description">{{ t('settings.dataSourcesDescription') }}</p>
        <div class="source-grid">
          <a
            v-for="source in dataSources"
            :key="source.name"
            :href="source.href"
            target="_blank"
            rel="noopener noreferrer"
            class="source-link"
          >
            <span>
              <strong>{{ source.name }}</strong>
              <small>{{ source.description }}</small>
            </span>
            <i class="pi pi-external-link"></i>
          </a>
        </div>
      </section>

    </div>
  </div>
</template>
