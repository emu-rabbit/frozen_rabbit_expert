<script setup lang="ts">
import { externalLinks } from '@/config/externalLinks'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="faq-view">
    <header class="faq-header">
      <h1 class="page-title">{{ t('nav.faq') }}</h1>
      <p class="page-description">{{ t('faq.description') }}</p>
    </header>

    <section class="faq-list" :aria-label="t('nav.faq')">
      <article class="faq-card">
        <div class="faq-card-inner">
          <div class="faq-question-row">
            <div class="faq-badge faq-badge--question" aria-hidden="true">Q</div>
            <div class="faq-copy">
              <h2>{{ t('faq.algorithmQuestion') }}</h2>
              <div class="faq-answer-row">
                <div class="faq-badge faq-badge--answer" aria-hidden="true">A</div>
                <p>{{ t('faq.algorithmAnswer') }}</p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="faq-card">
        <div class="faq-card-inner">
          <div class="faq-question-row">
            <div class="faq-badge faq-badge--question" aria-hidden="true">Q</div>
            <div class="faq-copy">
              <h2>{{ t('faq.optimalQuestion') }}</h2>
              <div class="faq-answer-row">
                <div class="faq-badge faq-badge--answer" aria-hidden="true">A</div>
                <p>{{ t('faq.optimalAnswer') }}</p>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="faq-card">
        <div class="faq-card-inner">
          <div class="faq-question-row">
            <div class="faq-badge faq-badge--question" aria-hidden="true">Q</div>
            <div class="faq-copy">
              <h2>{{ t('faq.integrationQuestion') }}</h2>
              <div class="faq-answer-row">
                <div class="faq-badge faq-badge--answer" aria-hidden="true">A</div>
                <i18n-t keypath="faq.integrationAnswer" scope="global" tag="p">
                  <template #guide>
                    <a
                      :href="externalLinks.solverIntegrationGuide"
                      class="faq-inline-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ t('faq.integrationGuideLink') }}
                      <i class="pi pi-external-link" aria-hidden="true"></i>
                    </a>
                  </template>
                </i18n-t>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="faq-card">
        <div class="faq-card-inner">
          <div class="faq-question-row">
            <div class="faq-badge faq-badge--question" aria-hidden="true">Q</div>
            <div class="faq-copy">
              <h2>{{ t('faq.rabbitQuestion') }}</h2>
              <div class="faq-answer-row">
                <div class="faq-badge faq-badge--answer" aria-hidden="true">A</div>
                <p>{{ t('faq.rabbitAnswer') }}</p>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <footer class="faq-footer">
      <p>{{ t('faq.footer', { email: 'mausu2526@gmail.com' }) }}</p>
    </footer>
  </div>
</template>
