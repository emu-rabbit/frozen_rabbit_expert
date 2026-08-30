<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { externalLinks } from '@/config/externalLinks'

defineProps<{ visible: boolean }>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const { t } = useI18n()

const close = () => emit('update:visible', false)

const openSponsor = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer')
  close()
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-layer">
      <button class="modal-backdrop" type="button" :aria-label="t('common.close')" @click="close"></button>
      <section class="sponsor-modal" role="dialog" aria-modal="true" :aria-labelledby="'sponsor-modal-title'">
        <button class="modal-close" type="button" :aria-label="t('common.close')" @click="close">
          <i class="pi pi-times"></i>
        </button>

        <div class="sponsor-intro">
          <div class="sponsor-heart"><i class="pi pi-heart-fill"></i></div>
          <h2 id="sponsor-modal-title">{{ t('sponsor.title') }}</h2>
          <p>{{ t('sponsor.description', { email: externalLinks.contactEmail }) }}</p>
          <div class="secure-donation"><i class="pi pi-lock"></i> Secure Donation</div>
        </div>

        <div class="sponsor-options">
          <button type="button" class="sponsor-option sponsor-option--tw" @click="openSponsor(externalLinks.ecPay)">
            <span class="sponsor-option-icon"><i class="pi pi-credit-card"></i></span>
            <span>
              <strong>{{ t('sponsor.twProvider') }}</strong>
              <small>{{ t('sponsor.twDescription') }}</small>
            </span>
            <i class="pi pi-chevron-right"></i>
          </button>
          <button type="button" class="sponsor-option sponsor-option--global" @click="openSponsor(externalLinks.koFi)">
            <span class="sponsor-option-icon"><i class="pi pi-globe"></i></span>
            <span>
              <strong>{{ t('sponsor.globalProvider') }}</strong>
              <small>{{ t('sponsor.globalDescription') }}</small>
            </span>
            <i class="pi pi-chevron-right"></i>
          </button>
          <p class="sponsor-note">{{ t('sponsor.note') }}</p>
        </div>
      </section>
    </div>
  </Transition>
</template>
