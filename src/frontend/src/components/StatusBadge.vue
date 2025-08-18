<template>
  <v-chip 
    :color="color" 
    :variant="variant"
    size="small" 
    label
    class="status-badge"
  >
    <v-icon 
      v-if="icon" 
      :icon="icon" 
      start 
      size="small"
      :class="{ 'spinning': phase === 'running' }"
    />
    {{ displayText }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface StatusBadgeProps {
  phase: string;
  variant?: 'flat' | 'outlined' | 'elevated' | 'tonal';
  size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large';
}

const props = withDefaults(defineProps<StatusBadgeProps>(), {
  variant: 'flat',
  size: 'small'
});

const color = computed(() => {
  switch (props.phase) {
    case 'running':
      return 'primary';
    case 'done':
      return 'success';
    case 'failed':
      return 'error';
    case 'paused':
      return 'warning';
    case 'interrupted':
      return 'orange';
    case 'waiting':
      return 'info';
    default:
      return 'grey';
  }
});

const icon = computed(() => {
  switch (props.phase) {
    case 'running':
      return 'mdi-loading';
    case 'done':
      return 'mdi-check-circle';
    case 'failed':
      return 'mdi-alert-circle';
    case 'paused':
      return 'mdi-pause-circle';
    case 'interrupted':
      return 'mdi-stop-circle';
    case 'waiting':
      return 'mdi-clock-outline';
    default:
      return 'mdi-circle-outline';
  }
});

const displayText = computed(() => {
  return props.phase.charAt(0).toUpperCase() + props.phase.slice(1);
});
</script>

<style scoped>
.status-badge {
  font-weight: 500;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>