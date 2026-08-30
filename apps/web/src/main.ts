import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import 'primeicons/primeicons.css'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles/index.css'
import './styles/base.css'
import './styles/components.css'

const app = createApp(App)

app.use(i18n)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark',
    },
  },
})

app.mount('#app')

window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})
