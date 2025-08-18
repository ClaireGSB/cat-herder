<template>
  <div class="task-detail-view">
    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <v-progress-circular indeterminate size="64" class="mb-4" />
      <p class="text-h6">Loading task details...</p>
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
          <div class="font-weight-medium mb-1">Failed to load task details</div>
          <div class="text-caption">{{ error }}</div>
        </div>
        <v-btn @click="loadTaskDetails" variant="outlined" size="small">
          <v-icon icon="mdi-refresh" class="me-1" />
          Retry
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Task Not Found -->
    <v-alert
      v-else-if="!task"
      type="warning"
      variant="elevated"
      class="mb-4"
    >
      <div class="text-center">
        <v-icon icon="mdi-alert-circle" size="48" class="mb-2" />
        <h3>Task not found</h3>
        <p class="mb-2">The requested task "{{ taskId }}" could not be found.</p>
        <v-btn to="/history" variant="outlined">
          <v-icon icon="mdi-arrow-left" class="me-1" />
          Back to History
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Task Details -->
    <div v-else>
      <!-- Breadcrumbs -->
      <BreadcrumbNav 
        :task-id="taskId"
        :sequence-id="task.parentSequenceId"
        current-page="task"
      />
      
      <!-- Task Overview -->
      <v-card class="mb-6" :class="{ 'live-task-border': isLive }">
        <v-card-title class="d-flex justify-space-between align-center">
          <div class="d-flex align-center">
            <v-icon 
              :icon="isLive ? 'mdi-broadcast' : 'mdi-cog'"
              :color="isLive ? 'primary' : 'default'"
              size="large"
              class="me-3"
            />
            <div>
              <h1 class="text-h4 font-weight-bold">{{ task.taskId }}</h1>
              <p v-if="task.taskPath" class="text-subtitle-1 text-medium-emphasis ma-0">
                {{ task.taskPath }}
              </p>
            </div>
          </div>
          
          <div class="d-flex align-center gap-2">
            <StatusBadge :phase="task.phase" size="large" />
            
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
            <v-col v-if="task.pipeline" cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-pipe" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Pipeline</div>
                  <v-chip size="small" variant="outlined">{{ task.pipeline }}</v-chip>
                </div>
              </div>
            </v-col>
            
            <v-col v-if="task.currentStep" cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-step-forward" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Current Step</div>
                  <v-chip size="small" variant="tonal" color="primary">{{ task.currentStep }}</v-chip>
                </div>
              </div>
            </v-col>
            
            <v-col cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-clock-outline" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Duration</div>
                  <DurationDisplay :duration="task.stats?.totalDuration" />
                </div>
              </div>
            </v-col>
            
            <v-col cols="12" sm="6" md="3">
              <div class="detail-item">
                <v-icon icon="mdi-update" size="small" class="me-2" />
                <div>
                  <div class="detail-label">Last Updated</div>
                  <span class="text-caption">{{ formatDate(task.lastUpdate) }}</span>
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
      
      <!-- Pipeline Steps -->
      <v-card v-if="task.steps && Object.keys(task.steps).length > 0" class="mb-6">
        <v-card-title>
          <v-icon icon="mdi-format-list-numbered" class="me-2" />
          Pipeline Progress
        </v-card-title>
        
        <v-card-text>
          <PipelineSteps
            :steps="task.steps"
            :logs="task.logs"
            :show-log-buttons="true"
            :show-live-button="isLive"
            :selected-log="selectedLog"
            @load-log="onLoadLog"
            @go-to-live="$router.push('/live')"
          />
        </v-card-text>
      </v-card>
      
      <!-- Log Viewer -->
      <LogViewer
        ref="logViewerRef"
        :task-id="taskId"
        :logs="task.logs"
        :step-name="selectedLog?.step"
        class="mb-6"
      />
      
      <!-- Token Usage -->
      <TokenUsageCard 
        v-if="task.tokenUsage && Object.keys(task.tokenUsage).length > 0"
        :token-usage="task.tokenUsage"
        class="mb-6"
      />
      
      <!-- Debug Information -->
      <v-card v-if="showDebugInfo">
        <v-card-title>
          <v-icon icon="mdi-bug" class="me-2" />
          Debug Information
          <v-chip size="small" variant="outlined" class="ml-2">Raw Task State</v-chip>
        </v-card-title>
        
        <v-card-text>
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>View Raw JSON Data</v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre class="debug-json">{{ JSON.stringify(task, null, 2) }}</pre>
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
import type { TaskDetails, SelectedLog } from '@/stores/types';
import StatusBadge from '@/components/StatusBadge.vue';
import DurationDisplay from '@/components/DurationDisplay.vue';
import PipelineSteps from '@/components/PipelineSteps.vue';
import LogViewer from '@/components/LogViewer.vue';
import TokenUsageCard from '@/components/TokenUsageCard.vue';
import BreadcrumbNav from '@/components/BreadcrumbNav.vue';

const route = useRoute();
// const router = useRouter();
const taskStore = useTaskStore();

const taskId = computed(() => route.params.id as string);
const task = ref<TaskDetails | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedLog = ref<SelectedLog | null>(null);
const logViewerRef = ref<InstanceType<typeof LogViewer> | null>(null);
const showDebugInfo = ref(import.meta.env.DEV);

// Check if this task is currently live
const isLive = computed(() => {
  return taskStore.liveTask?.taskId === taskId.value;
});

// Load task details from API
const loadTaskDetails = async () => {
  if (!taskId.value) return;
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`/api/task/${taskId.value}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch task details: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    task.value = data.task;
  } catch (err) {
    console.error('Error loading task details:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load task details';
  } finally {
    loading.value = false;
  }
};

// Handle log loading from pipeline steps
const onLoadLog = (stepName: string, logType: string) => {
  selectedLog.value = { step: stepName, type: logType as 'raw' | 'log' | 'reasoning' };
  
  // Tell the log viewer to select this log type
  if (logViewerRef.value) {
    logViewerRef.value.selectLogType(logType);
  }
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

// Watch for route changes to reload task details
watch(() => route.params.id, () => {
  if (route.params.id) {
    loadTaskDetails();
  }
}, { immediate: true });

// Load data on mount
onMounted(() => {
  loadTaskDetails();
});

// Listen for real-time updates
watch(() => taskStore.liveTask, (newLiveTask) => {
  // Update task details if this is the live task
  if (newLiveTask && newLiveTask.taskId === taskId.value) {
    task.value = newLiveTask;
  }
});
</script>

<style scoped>
.task-detail-view {
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

.live-task-border {
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
  .task-detail-view {
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