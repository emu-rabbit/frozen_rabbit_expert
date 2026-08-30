import { ref, watch } from 'vue'
import { i18n, supportedLanguages, type AppLanguage } from '@/i18n'

const STORAGE_KEYS = {
  language: 'frozen-rabbit-cosmic-language',
  initialized: 'frozen-rabbit-cosmic-initialized',
  darkMode: 'frozen-rabbit-cosmic-dark-mode',
} as const

const readLanguage = (): AppLanguage => {
  const stored = localStorage.getItem(STORAGE_KEYS.language)
  return supportedLanguages.includes(stored as AppLanguage) ? stored as AppLanguage : 'tw'
}

const language = ref<AppLanguage>(readLanguage())
const initialized = ref(localStorage.getItem(STORAGE_KEYS.initialized) === 'true')
const isDarkMode = ref(localStorage.getItem(STORAGE_KEYS.darkMode) === 'true')

const documentLanguages: Record<AppLanguage, string> = {
  tw: 'zh-Hant',
  cn: 'zh-Hans',
  en: 'en',
  ja: 'ja',
}

watch(language, (value) => {
  localStorage.setItem(STORAGE_KEYS.language, value)
  i18n.global.locale.value = value
  document.documentElement.lang = documentLanguages[value]
}, { immediate: true })
watch(initialized, (value) => localStorage.setItem(STORAGE_KEYS.initialized, String(value)))
watch(isDarkMode, (value) => localStorage.setItem(STORAGE_KEYS.darkMode, String(value)))

export function usePreferences() {
  return { language, initialized, isDarkMode }
}
