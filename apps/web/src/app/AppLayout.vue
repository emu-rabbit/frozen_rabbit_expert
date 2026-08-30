<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import LanguageSelectModal from '@/components/modals/LanguageSelectModal.vue'
import SponsorModal from '@/components/modals/SponsorModal.vue'
import { usePreferences } from '@/composables/usePreferences'
import { plannerRuntime } from '@/runtime/planner'
import logo from '@/assets/logo.png'

const { t, locale } = useI18n()
const { language, initialized, isDarkMode } = usePreferences()
const isMobileMenuOpen = ref(false)
const isSponsorModalOpen = ref(false)
const isLanguageModalOpen = ref(!initialized.value)

watch(language, (nextLanguage) => {
  locale.value = nextLanguage
  document.title = `${t('app.title')} | Frozen Rabbit's Cosmic`
}, { immediate: true })

watch(isDarkMode, (dark) => {
  document.documentElement.classList.toggle('dark', dark)
}, { immediate: true })

const handleLanguagePreview = (nextLanguage: string) => {
  language.value = nextLanguage as typeof language.value
}

const handleLanguageSelect = (nextLanguage: string) => {
  handleLanguagePreview(nextLanguage)
  initialized.value = true
  isLanguageModalOpen.value = false
}

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
}

onMounted(() => {
  void plannerRuntime.initialize()
})

onBeforeUnmount(() => {
  plannerRuntime.dispose()
})
</script>

<template>
  <div class="app-frame">
    <header class="mobile-header">
      <div class="mobile-brand">
        <img :src="logo" :alt="t('app.logoAlt')" />
        <span>{{ t('app.title') }}</span>
      </div>
      <button
        class="mobile-menu-button"
        type="button"
        :aria-label="t('common.toggleMenu')"
        :aria-expanded="isMobileMenuOpen"
        @click="isMobileMenuOpen = !isMobileMenuOpen"
      >
        <i class="pi" :class="isMobileMenuOpen ? 'pi-times' : 'pi-bars'"></i>
      </button>
    </header>

    <button
      class="mobile-backdrop"
      :class="{ 'mobile-backdrop--open': isMobileMenuOpen }"
      type="button"
      :aria-label="t('common.closeMenu')"
      @click="closeMobileMenu"
    ></button>

    <aside class="sidebar-drawer" :class="{ 'sidebar-drawer--open': isMobileMenuOpen }">
      <AppSidebar
        @navigate="closeMobileMenu"
        @open-sponsor="isSponsorModalOpen = true"
      />
    </aside>

    <main class="main-scroll">
      <div class="cosmic-glow" aria-hidden="true"></div>
      <RouterView />
    </main>

    <SponsorModal v-model:visible="isSponsorModalOpen" />
    <LanguageSelectModal
      v-model:visible="isLanguageModalOpen"
      @preview-language="handleLanguagePreview"
      @select="handleLanguageSelect"
    />
  </div>
</template>
