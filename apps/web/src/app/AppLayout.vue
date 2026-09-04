<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import LanguageSelectModal from '@/components/modals/LanguageSelectModal.vue'
import SponsorModal from '@/components/modals/SponsorModal.vue'
import { appLogoUrl } from '@/config/brandAssets'
import { usePreferences } from '@/composables/usePreferences'
import { plannerRuntime } from '@/runtime/planner'

const { t, locale } = useI18n()
const route = useRoute()
const { language, initialized, isDarkMode } = usePreferences()
const isMobileMenuOpen = ref(false)
const isSponsorModalOpen = ref(false)
const isLanguageModalOpen = ref(!initialized.value)
const mainScroll = ref<HTMLElement | null>(null)

watch(() => route.fullPath, () => {
  void nextTick(() => mainScroll.value?.scrollTo({ top: 0 }))
})

watch(language, (nextLanguage) => {
  locale.value = nextLanguage
  document.title = `${t('app.title')} | FFXIV ${t('app.subtitle')}`
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

onBeforeUnmount(() => {
  plannerRuntime.dispose()
})
</script>

<template>
  <div class="app-frame">
    <header class="mobile-header">
      <div class="mobile-brand">
        <img :src="appLogoUrl" :alt="t('app.logoAlt')" />
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

    <main ref="mainScroll" class="main-scroll">
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
