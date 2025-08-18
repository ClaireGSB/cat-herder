<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/taskStore'
import { initializeWebSocket } from '@/services/websocket'

const route = useRoute()
const taskStore = useTaskStore()
const drawer = ref(false)

// Navigation items
const navigationItems = [
  {
    title: 'History',
    icon: 'mdi-history',
    to: '/history',
    description: 'View run history'
  },
  {
    title: 'Live Activity', 
    icon: 'mdi-broadcast',
    to: '/live',
    description: 'Monitor real-time activity',
    badge: taskStore.hasLiveActivity
  }
]

// Check if current route is active
const isActiveRoute = (to: string) => {
  return route.path === to || route.path.startsWith(to + '/')
}

// Initialize app
onMounted(() => {
  // Initialize WebSocket connection for real-time updates
  initializeWebSocket()
  
  // Load initial data if we're on the history page
  if (route.path === '/' || route.path === '/history') {
    loadInitialData()
  }
})

// Load initial application data
const loadInitialData = async () => {
  try {
    // Fetch history data
    const historyResponse = await fetch('/api/history')
    if (historyResponse.ok) {
      const historyData = await historyResponse.json()
      taskStore.updateFromHistory(historyData)
    }
    
    // Fetch live data  
    const liveResponse = await fetch('/api/live')
    if (liveResponse.ok) {
      const liveData = await liveResponse.json()
      taskStore.updateFromLive(liveData)
    }
  } catch (error) {
    console.error('Error loading initial data:', error)
  }
}
</script>

<template>
  <v-app>
    <!-- App Bar -->
    <v-app-bar 
      color="primary" 
      density="compact"
      :elevation="2"
    >
      <template v-slot:prepend>
        <v-app-bar-nav-icon
          v-if="$vuetify.display.mobile"
          @click="drawer = !drawer"
        />
      </template>

      <v-app-bar-title class="d-flex align-center">
        <v-icon icon="mdi-robot" size="large" class="me-2" />
        <span class="font-weight-bold">Claude Project</span>
        <v-chip 
          size="x-small" 
          variant="outlined" 
          color="white"
          class="ml-2 hidden-sm-and-down"
        >
          Dashboard
        </v-chip>
      </v-app-bar-title>

      <v-spacer />

      <!-- Desktop Navigation -->
      <div v-if="!$vuetify.display.mobile" class="d-flex align-center">
        <v-btn
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          :variant="isActiveRoute(item.to) ? 'flat' : 'text'"
          :color="isActiveRoute(item.to) ? 'white' : 'default'"
          size="small"
          class="mx-1"
        >
          <v-icon :icon="item.icon" size="small" class="me-2" />
          {{ item.title }}
          <v-badge
            v-if="item.badge"
            color="orange"
            dot
            offset-x="4"
            offset-y="4"
          />
        </v-btn>
      </div>

      <!-- Connection Status -->
      <v-chip
        :color="taskStore.isConnected ? 'success' : 'error'"
        variant="outlined"
        size="x-small"
        class="ml-2 hidden-xs"
      >
        <v-icon 
          :icon="taskStore.isConnected ? 'mdi-wifi' : 'mdi-wifi-off'" 
          size="small"
          class="me-1"
        />
        {{ taskStore.isConnected ? 'Online' : 'Offline' }}
      </v-chip>
    </v-app-bar>

    <!-- Mobile Navigation Drawer -->
    <v-navigation-drawer
      v-if="$vuetify.display.mobile"
      v-model="drawer"
      temporary
    >
      <v-list density="compact">
        <v-list-item
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          :active="isActiveRoute(item.to)"
        >
          <template v-slot:prepend>
            <v-icon :icon="item.icon" />
            <v-badge
              v-if="item.badge"
              color="orange"
              dot
              offset-x="4"
              offset-y="4"
            />
          </template>
          
          <v-list-item-title>{{ item.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ item.description }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      
      <!-- Connection status in drawer -->
      <template v-slot:append>
        <v-divider />
        <v-list>
          <v-list-item>
            <template v-slot:prepend>
              <v-icon 
                :icon="taskStore.isConnected ? 'mdi-wifi' : 'mdi-wifi-off'"
                :color="taskStore.isConnected ? 'success' : 'error'"
              />
            </template>
            <v-list-item-title>
              {{ taskStore.isConnected ? 'Connected' : 'Disconnected' }}
            </v-list-item-title>
            <v-list-item-subtitle>WebSocket Status</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </template>
    </v-navigation-drawer>

    <!-- Main Content -->
    <v-main>
      <!-- Global Loading Progress Bar -->
      <v-progress-linear
        v-if="taskStore.isLoading"
        indeterminate
        color="primary"
        height="3"
        class="position-absolute"
        style="top: 0; left: 0; right: 0; z-index: 1000;"
      />
      
      <!-- Global Error Alert -->
      <v-alert
        v-if="taskStore.error"
        type="error"
        variant="tonal"
        density="compact"
        closable
        class="ma-4"
        @click:close="taskStore.setError(null)"
      >
        {{ taskStore.error }}
      </v-alert>

      <!-- Router View -->
      <router-view />
    </v-main>
  </v-app>
</template>

<style scoped>
/* Custom app styles */
:deep(.v-app-bar-title) {
  overflow: visible;
}

/* Live activity badge animation */
:deep(.v-badge__badge) {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 152, 0, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 152, 0, 0);
  }
}
</style>
