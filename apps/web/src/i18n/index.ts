import { createI18n } from 'vue-i18n'
import cn from './locales/cn'
import en from './locales/en'
import ja from './locales/ja'
import tw from './locales/tw'

export const supportedLanguages = ['tw', 'cn', 'en', 'ja'] as const
export type AppLanguage = (typeof supportedLanguages)[number]

export const i18n = createI18n({
  legacy: false,
  locale: 'tw',
  fallbackLocale: 'en',
  messages: { tw, cn, en, ja },
})
