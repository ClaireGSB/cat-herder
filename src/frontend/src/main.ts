import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import '@mdi/font/css/materialdesignicons.css'

import './style.css'
import App from './App.vue'
import { webSocketService } from './services/websocket'

// Create Vuetify instance
const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light'
  }
})

// Create Pinia store
const pinia = createPinia()

// Create router (we'll add routes later)
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./components/TaskStoreTest.vue')
    }
  ]
})

const app = createApp(App)
  .use(pinia)
  .use(router)
  .use(vuetify)

app.mount('#app')

// Initialize WebSocket service after the app is mounted and Pinia is available
webSocketService.initialize()

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  webSocketService.disconnect()
})
