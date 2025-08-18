<template>
  <v-card 
    class="sequence-card" 
    :class="{ 'live-sequence': isLive }"
    @click="navigateToSequence"
    hover
    :elevation="isLive ? 4 : 1"
  >
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon 
          :icon="isLive ? 'mdi-broadcast' : 'mdi-folder-multiple'"
          :color="isLive ? 'primary' : 'default'"
          class="me-2"
        />
        <div>
          <div class="sequence-id">{{ sequence.sequenceId }}</div>
          <div v-if="sequence.folderPath" class="folder-path text-caption text-medium-emphasis">
            {{ sequence.folderPath }}
          </div>
        </div>
      </div>
      
      <StatusBadge :phase="sequence.phase" />
    </v-card-title>
    
    <v-card-text>
      <v-row class="align-center">
        <v-col cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-format-list-numbered" size="small" class="me-1" />
            <span class="detail-label">Tasks:</span>
            <v-chip size="small" variant="outlined" class="ml-2">
              {{ taskCount }}
            </v-chip>
          </div>
        </v-col>
        
        <v-col v-if="sequence.currentTaskPath" cols="12" sm="6" md="8">
          <div class="detail-item">
            <v-icon icon="mdi-play-circle" size="small" class="me-1" />
            <span class="detail-label">Current:</span>
            <v-chip size="small" variant="tonal" color="primary" class="ml-2">
              {{ sequence.currentTaskPath }}
            </v-chip>
          </div>
        </v-col>
        
        <v-col cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-clock-outline" size="small" class="me-1" />
            <span class="detail-label">Duration:</span>
            <DurationDisplay 
              :duration="sequence.stats?.totalDuration" 
              class="ml-2"
            />
          </div>
        </v-col>
        
        <v-col v-if="sequence.stats?.totalPauseTime" cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-pause" size="small" class="me-1" />
            <span class="detail-label">Pause Time:</span>
            <DurationDisplay 
              :duration="sequence.stats.totalPauseTime" 
              class="ml-2"
            />
          </div>
        </v-col>
      </v-row>
      
      <!-- Task Progress -->
      <div v-if="taskStats.total > 0" class="mt-3">
        <div class="d-flex justify-space-between align-center mb-2">
          <span class="text-caption font-weight-medium">Progress</span>
          <span class="text-caption">{{ taskStats.completed }}/{{ taskStats.total }} tasks</span>
        </div>
        
        <v-progress-linear
          :model-value="progressPercentage"
          height="8"
          rounded
          :color="getProgressColor()"
          class="mb-2"
        />
        
        <div class="task-status-chips">
          <v-chip
            v-if="taskStats.running > 0"
            size="x-small"
            variant="flat"
            color="primary"
            class="me-1"
          >
            {{ taskStats.running }} running
          </v-chip>
          
          <v-chip
            v-if="taskStats.completed > 0"
            size="x-small"
            variant="flat"
            color="success"
            class="me-1"
          >
            {{ taskStats.completed }} completed
          </v-chip>
          
          <v-chip
            v-if="taskStats.failed > 0"
            size="x-small"
            variant="flat"
            color="error"
            class="me-1"
          >
            {{ taskStats.failed }} failed
          </v-chip>
        </div>
      </div>
      
      <div class="mt-3">
        <div class="detail-item">
          <v-icon icon="mdi-update" size="small" class="me-1" />
          <span class="detail-label">Last Updated:</span>
          <span class="ml-2 text-caption">{{ formatDate(sequence.lastUpdate) }}</span>
        </div>
      </div>
      
      <!-- Live Activity Indicator -->
      <v-alert
        v-if="isLive"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
      >
        <v-icon icon="mdi-broadcast" class="me-2" />
        Live sequence activity - click to view details
      </v-alert>
    </v-card-text>
    
    <v-card-actions class="justify-end">
      <v-btn
        variant="outlined"
        size="small"
        @click.stop="navigateToSequence"
      >
        <v-icon icon="mdi-open-in-new" size="small" class="me-1" />
        Details
      </v-btn>
      
      <v-btn
        v-if="isLive"
        variant="flat"
        color="primary"
        size="small"
        @click.stop="navigateToLive"
      >
        <v-icon icon="mdi-broadcast" size="small" class="me-1" />
        Live Activity
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { SequenceStatus } from '@/stores/types';
import StatusBadge from './StatusBadge.vue';
import DurationDisplay from './DurationDisplay.vue';

export interface SequenceCardProps {
  sequence: SequenceStatus;
  isLive?: boolean;
}

const props = withDefaults(defineProps<SequenceCardProps>(), {
  isLive: false
});

const router = useRouter();

const navigateToSequence = () => {
  router.push(`/sequence/${props.sequence.sequenceId}`);
};

const navigateToLive = () => {
  router.push('/live');
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

const taskCount = computed(() => {
  if (!props.sequence.tasks || !Array.isArray(props.sequence.tasks)) {
    return 0;
  }
  return props.sequence.tasks.length;
});

const taskStats = computed(() => {
  if (!props.sequence.tasks || !Array.isArray(props.sequence.tasks)) {
    return { total: 0, completed: 0, running: 0, failed: 0, pending: 0 };
  }
  
  const stats = {
    total: props.sequence.tasks.length,
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0
  };
  
  props.sequence.tasks.forEach(task => {
    switch (task.phase) {
      case 'done':
        stats.completed++;
        break;
      case 'running':
        stats.running++;
        break;
      case 'failed':
        stats.failed++;
        break;
      default:
        stats.pending++;
    }
  });
  
  return stats;
});

const progressPercentage = computed(() => {
  if (taskStats.value.total === 0) return 0;
  return (taskStats.value.completed / taskStats.value.total) * 100;
});

const getProgressColor = () => {
  if (taskStats.value.failed > 0) return 'error';
  if (taskStats.value.running > 0) return 'primary';
  if (taskStats.value.completed === taskStats.value.total) return 'success';
  return 'primary';
};
</script>

<style scoped>
.sequence-card {
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.sequence-card:hover {
  transform: translateY(-1px);
}

.live-sequence {
  border: 2px solid rgb(var(--v-theme-primary));
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.1);
  }
}

.sequence-id {
  font-weight: 600;
  font-size: 1.1rem;
  color: rgb(var(--v-theme-on-surface));
}

.folder-path {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.875rem;
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface-variant));
}

.task-status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>