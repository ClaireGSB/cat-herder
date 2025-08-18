<template>
  <div class="live-activity-view">
    <!-- Breadcrumbs -->
    <BreadcrumbNav 
      current-page="live"
      :items="[{ title: 'Live Activity', icon: 'mdi-broadcast', disabled: true }]"
    />
    
    <!-- Header -->
    <div class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center">
        <v-icon 
          icon="mdi-broadcast" 
          size="large" 
          color="primary" 
          class="me-3 live-icon"
        />
        <div>
          <h1 class="text-h4 font-weight-bold">Live Activity</h1>
          <p class="text-subtitle-1 text-medium-emphasis ma-0">
            Real-time monitoring of running tasks and sequences
          </p>
        </div>
      </div>
      
      <div class="d-flex align-center">
        <v-chip 
          :color="taskStore.isConnected ? 'success' : 'error'"
          variant="flat"
          size="small"
          class="me-2"
        >
          <v-icon 
            :icon="taskStore.isConnected ? 'mdi-wifi' : 'mdi-wifi-off'" 
            size="small"
            class="me-1"
          />
          {{ taskStore.isConnected ? 'Connected' : 'Disconnected' }}
        </v-chip>
        
        <v-btn
          @click="refreshData"
          :loading="taskStore.isLoading"
          icon="mdi-refresh"
          variant="text"
        />
      </div>
    </div>
    
    <!-- Connection Status Alert -->
    <v-alert
      v-if="!taskStore.isConnected"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      <v-icon icon="mdi-wifi-off" class="me-2" />
      WebSocket connection lost. Live updates are not available. 
      <v-btn @click="reconnectWebSocket" variant="text" size="small" class="ml-2">
        Reconnect
      </v-btn>
    </v-alert>
    
    <!-- No Live Activity -->
    <v-alert
      v-if="!taskStore.hasLiveActivity"
      type="info"
      variant="elevated"
      class="mb-4"
    >
      <div class="text-center py-4">
        <v-icon icon="mdi-sleep" size="64" class="mb-4 text-disabled" />
        <h3 class="text-h5 mb-2">No Live Activity</h3>
        <p class="text-medium-emphasis mb-4">
          There are no tasks or sequences currently running. 
          This page will automatically update when new activity begins.
        </p>
        <v-btn to="/history" variant="outlined">
          <v-icon icon="mdi-history" size="small" class="me-1" />
          View History
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Live Activity Content - Two Column Layout -->
    <v-container v-if="taskStore.hasLiveActivity" fluid class="pa-0">
      <v-row>
        <!-- Sidebar Column -->
        <v-col cols="12" md="4" class="sidebar-column">
          
          <!-- Live Task Info -->
          <v-card v-if="taskStore.liveTask" class="live-task-card mb-4" density="compact">
            <v-card-title class="d-flex justify-space-between align-center pa-3">
              <div class="d-flex align-center">
                <v-icon icon="mdi-broadcast" color="primary" class="me-2" size="small" />
                <div>
                  <div class="text-h6">{{ taskStore.liveTask.taskId }}</div>
                  <div v-if="taskStore.liveTask.taskPath" class="text-caption text-medium-emphasis">
                    {{ taskStore.liveTask.taskPath }}
                  </div>
                </div>
              </div>
              <StatusBadge :phase="taskStore.liveTask.phase" />
            </v-card-title>
            
            <v-card-text class="pa-3">
              <div v-if="taskStore.liveTask.pipeline" class="detail-item mb-2">
                <v-icon icon="mdi-pipe" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Pipeline</div>
                  <v-chip size="small" variant="outlined">{{ taskStore.liveTask.pipeline }}</v-chip>
                </div>
              </div>
              
              <div v-if="taskStore.liveTask.currentStep" class="detail-item mb-2">
                <v-icon icon="mdi-step-forward" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Current Step</div>
                  <v-chip size="small" variant="tonal" color="primary">{{ taskStore.liveTask.currentStep }}</v-chip>
                </div>
              </div>
              
              <div class="detail-item mb-2">
                <v-icon icon="mdi-clock-outline" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Duration</div>
                  <DurationDisplay :duration="taskStore.liveTask.stats?.totalDuration" />
                </div>
              </div>
              
              <v-btn
                :to="`/task/${taskStore.liveTask.taskId}`"
                variant="outlined"
                size="small"
                block
                class="mt-2"
              >
                <v-icon icon="mdi-open-in-new" size="small" class="me-1" />
                View Details
              </v-btn>
            </v-card-text>
          </v-card>
          
          <!-- Live Sequence Info -->
          <v-card v-if="taskStore.liveSequence" class="live-sequence-card mb-4" density="compact">
            <v-card-title class="d-flex justify-space-between align-center pa-3">
              <div class="d-flex align-center">
                <v-icon icon="mdi-broadcast" color="primary" class="me-2" size="small" />
                <div>
                  <div class="text-h6">{{ taskStore.liveSequence.sequenceId }}</div>
                  <div v-if="taskStore.liveSequence.folderPath" class="text-caption text-medium-emphasis">
                    {{ taskStore.liveSequence.folderPath }}
                  </div>
                </div>
              </div>
              <StatusBadge :phase="taskStore.liveSequence.phase" />
            </v-card-title>
            
            <v-card-text class="pa-3">
              <div class="detail-item mb-2">
                <v-icon icon="mdi-format-list-numbered" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Total Tasks</div>
                  <v-chip size="small" variant="outlined">
                    {{ taskStore.liveSequence.tasks?.length || 0 }}
                  </v-chip>
                </div>
              </div>
              
              <div v-if="taskStore.liveSequence.currentTaskPath" class="detail-item mb-2">
                <v-icon icon="mdi-play-circle" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Current Task</div>
                  <v-chip size="small" variant="tonal" color="primary">
                    {{ taskStore.liveSequence.currentTaskPath }}
                  </v-chip>
                </div>
              </div>
              
              <div class="detail-item mb-2">
                <v-icon icon="mdi-clock-outline" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Duration</div>
                  <DurationDisplay :duration="taskStore.liveSequence.stats?.totalDuration" />
                </div>
              </div>
              
              <!-- Sequence Progress -->
              <div v-if="sequenceTaskStats.total > 0" class="mt-3">
                <div class="d-flex justify-space-between align-center mb-2">
                  <span class="text-caption font-weight-medium">Progress</span>
                  <span class="text-caption">
                    {{ sequenceTaskStats.completed }}/{{ sequenceTaskStats.total }}
                  </span>
                </div>
                
                <v-progress-linear
                  :model-value="sequenceProgressPercentage"
                  height="8"
                  rounded
                  :color="getSequenceProgressColor()"
                  class="mb-2"
                />
                
                <div class="d-flex flex-wrap gap-1">
                  <v-chip
                    v-if="sequenceTaskStats.running > 0"
                    size="x-small"
                    variant="flat"
                    color="primary"
                  >
                    {{ sequenceTaskStats.running }} running
                  </v-chip>
                  
                  <v-chip
                    v-if="sequenceTaskStats.completed > 0"
                    size="x-small"
                    variant="flat"
                    color="success"
                  >
                    {{ sequenceTaskStats.completed }} done
                  </v-chip>
                  
                  <v-chip
                    v-if="sequenceTaskStats.failed > 0"
                    size="x-small"
                    variant="flat"
                    color="error"
                  >
                    {{ sequenceTaskStats.failed }} failed
                  </v-chip>
                </div>
              </div>
              
              <v-btn
                :to="`/sequence/${taskStore.liveSequence.sequenceId}`"
                variant="outlined"
                size="small"
                block
                class="mt-3"
              >
                <v-icon icon="mdi-open-in-new" size="small" class="me-1" />
                View Details
              </v-btn>
            </v-card-text>
          </v-card>
          
          <!-- Pipeline Steps -->
          <v-card v-if="shouldShowPipelineSteps" density="compact">
            <v-card-title class="pa-3">
              <v-icon icon="mdi-format-list-checks" class="me-2" size="small" />
              Pipeline Progress
            </v-card-title>
            <v-card-text class="pa-3">
              <PipelineSteps
                :steps="liveSteps"
                :logs="liveLogs"
                :show-log-buttons="false"
                :show-live-button="false"
              />
            </v-card-text>
          </v-card>
          
        </v-col>
        
        <!-- Main Log Viewer Column -->
        <v-col cols="12" md="8" class="main-column">
          <LogViewer
            :task-id="liveTaskId"
            :is-live-mode="true"
            class="full-height-log"
          />
        </v-col>
        
      </v-row>
    </v-container>
    
    <!-- Auto-refresh indicator -->
    <div class="text-center mt-8">
      <v-chip variant="outlined" size="small">
        <v-icon icon="mdi-autorenew" size="small" class="me-1" />
        Updates automatically via WebSocket
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '@/stores/taskStore';
import { initializeWebSocket } from '@/services/websocket';
import StatusBadge from '@/components/StatusBadge.vue';
import DurationDisplay from '@/components/DurationDisplay.vue';
import PipelineSteps from '@/components/PipelineSteps.vue';
import LogViewer from '@/components/LogViewer.vue';
import BreadcrumbNav from '@/components/BreadcrumbNav.vue';

const taskStore = useTaskStore();

// Sequence task statistics
const sequenceTaskStats = computed(() => {
  if (!taskStore.liveSequence?.tasks || !Array.isArray(taskStore.liveSequence.tasks)) {
    return { total: 0, completed: 0, running: 0, failed: 0, pending: 0 };
  }
  
  const stats = {
    total: taskStore.liveSequence.tasks.length,
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0
  };
  
  taskStore.liveSequence.tasks.forEach(task => {
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

const sequenceProgressPercentage = computed(() => {
  if (sequenceTaskStats.value.total === 0) return 0;
  return (sequenceTaskStats.value.completed / sequenceTaskStats.value.total) * 100;
});

const getSequenceProgressColor = () => {
  if (sequenceTaskStats.value.failed > 0) return 'error';
  if (sequenceTaskStats.value.running > 0) return 'primary';
  if (sequenceTaskStats.value.completed === sequenceTaskStats.value.total) return 'success';
  return 'primary';
};

// Computed properties for two-column layout
const shouldShowPipelineSteps = computed(() => {
  return (taskStore.liveTask?.steps && Object.keys(taskStore.liveTask.steps).length > 0);
});

const liveSteps = computed(() => {
  return taskStore.liveTask?.steps || {};
});

const liveLogs = computed(() => {
  return taskStore.liveTask?.logs || {};
});

const liveTaskId = computed(() => {
  return taskStore.liveTask?.taskId || '';
});

// Refresh live data from API
const refreshData = async () => {
  try {
    taskStore.setLoading(true);
    
    const response = await fetch('/api/live');
    if (!response.ok) {
      throw new Error(`Failed to fetch live data: ${response.status}`);
    }
    
    const liveData = await response.json();
    taskStore.updateFromLive(liveData);
    
  } catch (error) {
    console.error('Error refreshing live data:', error);
    taskStore.setError(error instanceof Error ? error.message : 'Failed to refresh live data');
  } finally {
    taskStore.setLoading(false);
  }
};

const reconnectWebSocket = () => {
  // Re-initialize WebSocket connection
  initializeWebSocket();
};


// Initialize WebSocket and load initial data
onMounted(() => {
  refreshData();
  initializeWebSocket();
});

// Cleanup on unmount
onUnmounted(() => {
  taskStore.setError(null);
});
</script>

<style scoped>
.live-activity-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.live-icon {
  animation: pulse 1.5s ease-in-out infinite;
}

.live-pulse {
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes live-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.1);
  }
}

.live-task-card,
.live-sequence-card {
  border: 2px solid rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary-container));
}

.detail-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
}

.detail-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface-variant));
  margin-bottom: 4px;
}

/* Two-column layout styles */
.sidebar-column {
  padding-right: 8px;
}

.main-column {
  padding-left: 8px;
}

.full-height-log {
  height: calc(100vh - 200px);
  min-height: 500px;
}

/* Responsive adjustments for sidebar */
@media (max-width: 960px) {
  .sidebar-column,
  .main-column {
    padding-left: 12px;
    padding-right: 12px;
  }
  
  .full-height-log {
    height: auto;
    min-height: 400px;
  }
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .live-activity-view {
    padding: 16px;
  }
  
  .d-flex.justify-space-between.align-center.mb-6 {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  
  .d-flex.justify-space-between.align-center.mb-6 > div:last-child {
    align-self: flex-end;
  }
}
</style>