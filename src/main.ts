import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'

// Import Cesium CSS
import 'cesium/Build/Cesium/Widgets/widgets.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'menu',
      component: () => import('./components/MainMenu.vue')
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('./components/GameArena.vue')
    }
  ]
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
