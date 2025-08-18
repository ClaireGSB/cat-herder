<template>
  <v-card 
    class="task-card" 
    :class="{ 'live-task': isLive }"
    @click="navigateToTask"
    hover
    :elevation="isLive ? 4 : 1"
  >
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon 
          :icon="isLive ? 'mdi-broadcast' : 'mdi-cog'"
          :color="isLive ? 'primary' : 'default'"
          class="me-2"
        />
        <div>
          <div class="task-id">{{ task.taskId }}</div>
          <div v-if="task.taskPath" class="task-path text-caption text-medium-emphasis">
            {{ task.taskPath }}
          </div>
        </div>
      </div>
      
      <StatusBadge :phase="task.phase" />
    </v-card-title>
    
    <v-card-text>
      <v-row class="align-center">
        <v-col v-if="task.pipeline" cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-pipe" size="small" class="me-1" />
            <span class="detail-label">Pipeline:</span>
            <v-chip size="small" variant="outlined" class="ml-2">
              {{ task.pipeline }}
            </v-chip>
          </div>
        </v-col>
        
        <v-col v-if="task.currentStep" cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-step-forward" size="small" class="me-1" />
            <span class="detail-label">Step:</span>
            <v-chip size="small" variant="tonal" color="primary" class="ml-2">
              {{ task.currentStep }}
            </v-chip>
          </div>
        </v-col>
        
        <v-col cols="12" sm="6" md="4">
          <div class="detail-item">
            <v-icon icon="mdi-clock-outline" size="small" class="me-1" />
            <span class="detail-label">Duration:</span>
            <DurationDisplay 
              :duration="task.stats?.totalDuration" 
              class="ml-2"
            />
          </div>
        </v-col>
      </v-row>
      
      <div class="mt-2">
        <div class="detail-item">
          <v-icon icon="mdi-update" size="small" class="me-1" />
          <span class="detail-label">Last Updated:</span>
          <span class="ml-2 text-caption">{{ formatDate(task.lastUpdate) }}</span>
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
        Live activity - click to view details
      </v-alert>
    </v-card-text>
    
    <v-card-actions class="justify-end">
      <v-btn
        variant="outlined"
        size="small"
        @click.stop="navigateToTask"
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
// import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { TaskStatus } from '@/stores/types';
import StatusBadge from './StatusBadge.vue';
import DurationDisplay from './DurationDisplay.vue';

export interface TaskCardProps {
  task: TaskStatus;
  isLive?: boolean;
}

const props = withDefaults(defineProps<TaskCardProps>(), {
  isLive: false
});

const router = useRouter();

const navigateToTask = () => {
  router.push(`/task/${props.task.taskId}`);
};

const navigateToLive = () => {
  router.push('/live');
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};
</script>

<style scoped>
.task-card {
  margin-bottom: 16px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.task-card:hover {
  transform: translateY(-1px);
}

.live-task {
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

.task-id {
  font-weight: 600;
  font-size: 1.1rem;
  color: rgb(var(--v-theme-on-surface));
}

.task-path {
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
</style>