<template>
  <div class="sequence-detail-view">
    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <v-progress-circular indeterminate size="64" class="mb-4" />
      <p class="text-h6">Loading sequence details...</p>
    </div>
    
    <!-- Error State -->
    <v-alert
      v-else-if="error"
      type="error"
      variant="elevated"
      class="mb-4"
    >
      <div class="d-flex justify-space-between align-center">
        <div>
          <div class="font-weight-medium mb-1">Failed to load sequence details</div>
          <div class="text-caption">{{ error }}</div>
        </div>
        <v-btn @click="loadSequenceDetails" variant="outlined" size="small">
          <v-icon icon="mdi-refresh" class="me-1" />
          Retry
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Sequence Not Found -->
    <v-alert
      v-else-if="!sequence"
      type="warning"
      variant="elevated"
      class="mb-4"
    >
      <div class="text-center">
        <v-icon icon="mdi-alert-circle" size="48" class="mb-2" />
        <h3>Sequence not found</h3>
        <p class="mb-2">The requested sequence "{{ sequenceId }}" could not be found.</p>
        <v-btn to="/history" variant="outlined">
          <v-icon icon="mdi-arrow-left" class="me-1" />
          Back to History
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Sequence Details -->
    <div v-else>
      <!-- Breadcrumbs -->
      <BreadcrumbNav 
        :sequence-id="sequenceId"
        current-page="sequence"
      />
      
      <!-- Sequence Overview -->
      <v-card class="mb-6" :class="{ 'live-sequence-border': isLive }">
        <v-card-title class="d-flex justify-space-between align-center">
          <div class="d-flex align-center">
            <v-icon 
              :icon="isLive ? 'mdi-broadcast' : 'mdi-folder-multiple'"
              :color="isLive ? 'primary' : 'default'"
              size="large"
              class="me-3"
            />
            <div>
              <h1 class="text-h4 font-weight-bold">{{ sequence.sequenceId }}</h1>
              <p v-if="sequence.folderPath" class="text-subtitle-1 text-medium-emphasis ma-0">
                {{ sequence.folderPath }}
              </p>
            </div>
          </div>
          
          <div class="d-flex align-center gap-2">
            <StatusBadge :phase="sequence.phase" size="large" />
            
            <v-btn
              v-if="isLive"
              to="/live"
              variant="flat"
              color="primary"
              size="small"
            >
              <v-icon icon="mdi-broadcast" size="small" class="me-1" />
              Live Activity
            </v-btn>
          </div>
        </v-card-title>
        
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-format-list-numbered" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Total Tasks</div>
                  <v-chip size="small" variant="outlined">{{ taskCount }}</v-chip>
                </div>
              </div>
            </v-col>
            
            <v-col v-if="sequence.currentTaskPath" cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-play-circle" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Current Task</div>
                  <v-chip size="small" variant="tonal" color="primary">{{ sequence.currentTaskPath }}</v-chip>
                </div>
              </div>
            </v-col>
            
            <v-col cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-clock-outline" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Total Duration</div>
                  <DurationDisplay :duration="sequence.stats?.totalDuration" />
                </div>
              </div>
            </v-col>
            
            <v-col cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-update" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Last Updated</div>
                  <span class="text-caption">{{ formatDate(sequence.lastUpdate) }}</span>
                </div>
              </div>
            </v-col>
          </v-row>
          
          <!-- Progress Summary -->
          <div v-if="taskStats.total > 0" class="mt-4">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-subtitle-2">Progress Summary</span>
              <span class="text-caption">{{ taskStats.completed }}/{{ taskStats.total }} completed</span>
            </div>
            
            <v-progress-linear
              :model-value="progressPercentage"
              height="12"
              rounded
              :color="getProgressColor()"
              class="mb-3"
            />
            
            <div class="d-flex flex-wrap gap-2">
              <v-chip
                v-if="taskStats.running > 0"
                size="small"
                variant="flat"
                color="primary"
              >
                <v-icon icon="mdi-loading" size="x-small" class="me-1" />
                {{ taskStats.running }} running
              </v-chip>
              
              <v-chip
                v-if="taskStats.completed > 0"
                size="small"
                variant="flat"
                color="success"
              >
                <v-icon icon="mdi-check-circle" size="x-small" class="me-1" />
                {{ taskStats.completed }} completed
              </v-chip>
              
              <v-chip
                v-if="taskStats.failed > 0"
                size="small"
                variant="flat"
                color="error"
              >
                <v-icon icon="mdi-alert-circle" size="x-small" class="me-1" />
                {{ taskStats.failed }} failed
              </v-chip>
              
              <v-chip
                v-if="taskStats.pending > 0"
                size="small"
                variant="outlined"
              >
                <v-icon icon="mdi-circle-outline" size="x-small" class="me-1" />
                {{ taskStats.pending }} pending
              </v-chip>
            </div>
          </div>
        </v-card-text>
      </v-card>
      
      <!-- Tasks in Sequence -->
      <v-card v-if="sequence.tasks && sequence.tasks.length > 0" class="mb-6">
        <v-card-title>
          <v-icon icon="mdi-format-list-bulleted" class="me-2" />
          Tasks in this Sequence
        </v-card-title>
        
        <v-card-text>
          <div class="tasks-list">
            <TaskCard
              v-for="task in sequence.tasks"
              :key="task.taskId"
              :task="task as any"
              :is-live="isLiveTask(task.taskId)"
            />
          </div>
        </v-card-text>
      </v-card>
      
      <!-- Token Usage -->
      <TokenUsageCard 
        v-if="sequence.stats?.totalTokenUsage && Object.keys(sequence.stats.totalTokenUsage).length > 0"
        :token-usage="sequence.stats.totalTokenUsage"
        class="mb-6"
      />
      
      <!-- Timing Statistics -->
      <v-card v-if="sequence.stats" class="mb-6">
        <v-card-title>
          <v-icon icon="mdi-chart-timeline-variant" class="me-2" />
          Timing Statistics
        </v-card-title>
        
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="4">
              <v-card variant="outlined" class="text-center pa-4">
                <v-icon icon="mdi-clock-outline" size="large" color="primary" class="mb-2" />
                <div class="text-h6">
                  <DurationDisplay :duration="sequence.stats.totalDuration" />
                </div>
                <div class="text-caption text-medium-emphasis">Total Duration</div>
              </v-card>
            </v-col>
            
            <v-col cols="12" sm="4">
              <v-card variant="outlined" class="text-center pa-4">
                <v-icon icon="mdi-play" size="large" color="success" class="mb-2" />
                <div class="text-h6">
                  <DurationDisplay :duration="sequence.stats.totalDurationExcludingPauses" />
                </div>
                <div class="text-caption text-medium-emphasis">Active Time</div>
              </v-card>
            </v-col>
            
            <v-col cols="12" sm="4">
              <v-card variant="outlined" class="text-center pa-4">
                <v-icon icon="mdi-pause" size="large" color="warning" class="mb-2" />
                <div class="text-h6">
                  <DurationDisplay :duration="sequence.stats.totalPauseTime" />
                </div>
                <div class="text-caption text-medium-emphasis">Pause Time</div>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
      
      <!-- Debug Information -->
      <v-card v-if="showDebugInfo">
        <v-card-title>
          <v-icon icon="mdi-bug" class="me-2" />
          Debug Information
          <v-chip size="small" variant="outlined" class="ml-2">Raw Sequence State</v-chip>
        </v-card-title>
        
        <v-card-text>
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>View Raw JSON Data</v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre class="debug-json">{{ JSON.stringify(sequence, null, 2) }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTaskStore } from '@/stores/taskStore';
import type { SequenceDetails } from '@/stores/types';
import StatusBadge from '@/components/StatusBadge.vue';
import DurationDisplay from '@/components/DurationDisplay.vue';
import TaskCard from '@/components/TaskCard.vue';
import TokenUsageCard from '@/components/TokenUsageCard.vue';
import BreadcrumbNav from '@/components/BreadcrumbNav.vue';

const route = useRoute();
// const router = useRouter();
const taskStore = useTaskStore();

const sequenceId = computed(() => route.params.id as string);
const sequence = ref<SequenceDetails | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showDebugInfo = ref(import.meta.env.DEV);

// Check if this sequence is currently live
const isLive = computed(() => {
  return taskStore.liveSequence?.sequenceId === sequenceId.value;
});

// Check if a specific task is live
const isLiveTask = (taskId: string) => {
  return taskStore.liveTask?.taskId === taskId;
};

// Computed properties for task statistics
const taskCount = computed(() => {
  if (!sequence.value?.tasks || !Array.isArray(sequence.value.tasks)) {
    return 0;
  }
  return sequence.value.tasks.length;
});

const taskStats = computed(() => {
  if (!sequence.value?.tasks || !Array.isArray(sequence.value.tasks)) {
    return { total: 0, completed: 0, running: 0, failed: 0, pending: 0 };
  }
  
  const stats = {
    total: sequence.value.tasks.length,
    completed: 0,
    running: 0,
    failed: 0,
    pending: 0
  };
  
  sequence.value.tasks.forEach(task => {
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

// Load sequence details from API
const loadSequenceDetails = async () => {
  if (!sequenceId.value) return;
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`/api/sequence/${sequenceId.value}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch sequence details: ${response.status} ${response.statusText}`);
    }
    
    sequence.value = await response.json();
  } catch (err) {
    console.error('Error loading sequence details:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load sequence details';
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

// Watch for route changes to reload sequence details
watch(() => route.params.id, () => {
  if (route.params.id) {
    loadSequenceDetails();
  }
}, { immediate: true });

// Load data on mount
onMounted(() => {
  loadSequenceDetails();
});

// Listen for real-time updates
watch(() => taskStore.liveSequence, (newLiveSequence) => {
  // Update sequence details if this is the live sequence
  if (newLiveSequence && newLiveSequence.sequenceId === sequenceId.value) {
    sequence.value = newLiveSequence;
  }
});
</script>

<style scoped>
.sequence-detail-view {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  text-align: center;
}

.live-sequence-border {
  border: 2px solid rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.1);
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

.tasks-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
}

@media (max-width: 768px) {
  .tasks-list {
    grid-template-columns: 1fr;
  }
}

.debug-json {
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  background: rgb(var(--v-theme-surface-variant));
  padding: 16px;
  border-radius: 4px;
  overflow: auto;
  max-height: 400px;
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .sequence-detail-view {
    padding: 16px;
  }
}

@media (max-width: 600px) {
  .d-flex.justify-space-between.align-center {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  
  .d-flex.align-center.gap-2 {
    align-self: flex-end;
  }
}
</style>