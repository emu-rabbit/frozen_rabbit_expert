import { createRouter, createWebHashHistory } from 'vue-router'
import AppLayout from '@/app/AppLayout.vue'

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'start',
          component: () => import('@/views/StartView.vue'),
        },
        {
          path: 'equipment-profiles',
          name: 'equipment-profiles',
          component: () => import('@/views/EquipmentProfilesView.vue'),
        },
        {
          path: 'favorites',
          name: 'favorites',
          component: () => import('@/views/FavoritesView.vue'),
        },
        {
          path: 'faq',
          name: 'faq',
          component: () => import('@/views/FaqView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
