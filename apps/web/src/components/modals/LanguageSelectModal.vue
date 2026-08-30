<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import logo from '@/assets/logo.png'

defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'preview-language': [language: string]
  select: [language: string]
}>()

const { t } = useI18n()
const selectedLanguage = ref<string | null>(null)
const languages = [
  { code: 'tw', name: '繁體中文', label: 'Traditional Chinese', badge: 'TW' },
  { code: 'cn', name: '简体中文', label: 'Simplified Chinese', badge: 'CN' },
  { code: 'en', name: 'English', label: 'English', badge: 'EN' },
  { code: 'ja', name: '日本語', label: 'Japanese', badge: 'JP' },
]

const preview = (language: string) => {
  selectedLanguage.value = language
  emit('preview-language', language)
}

const confirm = () => {
  if (selectedLanguage.value) emit('select', selectedLanguage.value)
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-layer language-modal-layer">
      <div class="modal-backdrop"></div>
      <section class="language-modal" role="dialog" aria-modal="true" :aria-labelledby="'language-modal-title'">
        <div class="language-modal-heading">
          <img :src="logo" :alt="t('app.logoAlt')" />
          <div>
            <h2 id="language-modal-title">{{ t('welcome.title') }}</h2>
            <p>{{ t('welcome.subtitle') }}</p>
          </div>
        </div>

        <div class="language-list">
          <button
            v-for="item in languages"
            :key="item.code"
            type="button"
            class="language-option"
            :class="{ 'language-option--selected': selectedLanguage === item.code }"
            @click="preview(item.code)"
          >
            <span class="language-badge">{{ item.badge }}</span>
            <span class="language-copy">
              <strong>{{ item.name }}</strong>
              <small>{{ item.label }}</small>
            </span>
            <span v-if="selectedLanguage === item.code" class="language-check">
              <i class="pi pi-check"></i>
            </span>
          </button>
        </div>

        <button
          class="language-confirm"
          type="button"
          :disabled="!selectedLanguage"
          @click="confirm"
        >
          {{ t('welcome.confirm') }}
        </button>
      </section>
    </div>
  </Transition>
</template>
