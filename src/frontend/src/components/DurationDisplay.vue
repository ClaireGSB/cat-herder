<template>
  <span class="duration-display" :class="{ 'text-muted': !duration }">
    {{ formattedDuration }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface DurationDisplayProps {
  duration?: number | null;
  showMs?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<DurationDisplayProps>(), {
  duration: null,
  showMs: false,
  placeholder: 'N/A'
});

const formattedDuration = computed(() => {
  if (!props.duration || props.duration <= 0) {
    return props.placeholder;
  }

  const totalSeconds = Math.floor(props.duration);
  const ms = Math.floor((props.duration % 1) * 1000);
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let result = '';
  
  if (hours > 0) {
    result += `${hours}h `;
  }
  
  if (minutes > 0 || hours > 0) {
    result += `${minutes}m `;
  }
  
  result += `${seconds}s`;
  
  if (props.showMs && ms > 0 && hours === 0 && minutes === 0) {
    result += `.${ms.toString().padStart(3, '0')}`;
  }
  
  return result.trim();
});
</script>

<style scoped>
.duration-display {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>