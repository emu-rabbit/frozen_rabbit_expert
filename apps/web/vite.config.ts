import { copyFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const noticesSource = fileURLToPath(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url))
const noticesTarget = fileURLToPath(new URL('./dist/THIRD_PARTY_NOTICES.md', import.meta.url))

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    vue(),
    {
      name: 'copy-third-party-notices',
      apply: 'build',
      async closeBundle() {
        await copyFile(noticesSource, noticesTarget)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 4173,
    strictPort: true,
  },
})
