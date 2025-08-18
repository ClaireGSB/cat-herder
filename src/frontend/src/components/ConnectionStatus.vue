<template>
  <v-chip
    :color="statusColor"
    size="small"
    variant="tonal"
    :prepend-icon="statusIcon"
    class="connection-status"
  >
    {{ statusText }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { webSocketService, ConnectionState } from '@/services/websocket'
const connectionState = ref<ConnectionState>(ConnectionState.DISCONNECTED)

// Update connection state periodically
let interval: number | null = null

const statusColor = computed(() => {
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'success'
    case ConnectionState.CONNECTING:
    case ConnectionState.RECONNECTING:
      return 'warning'
    case ConnectionState.DISCONNECTED:
      return 'grey'
    case ConnectionState.ERROR:
      return 'error'
    default:
      return 'grey'
  }
})

const statusIcon = computed(() => {
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'mdi-wifi'
    case ConnectionState.CONNECTING:
    case ConnectionState.RECONNECTING:
      return 'mdi-wifi-sync'
    case ConnectionState.DISCONNECTED:
      return 'mdi-wifi-off'
    case ConnectionState.ERROR:
      return 'mdi-wifi-alert'
    default:
      return 'mdi-wifi-off'
  }
})

const statusText = computed(() => {
  switch (connectionState.value) {
    case ConnectionState.CONNECTED:
      return 'Live'
    case ConnectionState.CONNECTING:
      return 'Connecting...'
    case ConnectionState.RECONNECTING:
      return 'Reconnecting...'
    case ConnectionState.DISCONNECTED:
      return 'Disconnected'
    case ConnectionState.ERROR:
      return 'Connection Error'
    default:
      return 'Unknown'
  }
})

const updateConnectionState = () => {
  connectionState.value = webSocketService.getConnectionState()
}

onMounted(() => {
  // Update connection state immediately
  updateConnectionState()
  
  // Check connection state every second
  interval = window.setInterval(updateConnectionState, 1000)
})

onUnmounted(() => {
  if (interval) {
    window.clearInterval(interval)
  }
})

// Force reconnect when clicked (useful for debugging)
// const handleClick = () => {
//   if (connectionState.value === ConnectionState.ERROR || connectionState.value === ConnectionState.DISCONNECTED) {
//     webSocketService.forceReconnect()
//   }
// }
</script>

<style scoped>
.connection-status {
  cursor: pointer;
  transition: opacity 0.2s;
}

.connection-status:hover {
  opacity: 0.8;
}
</style>