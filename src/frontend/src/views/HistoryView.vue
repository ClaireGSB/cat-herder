<template>
  <div class="history-view">
    <!-- Loading State for Initial Data -->
    <div v-if="initialLoading" class="loading-container">
      <v-progress-circular indeterminate size="64" class="mb-4" />
      <p class="text-h6">Loading dashboard...</p>
    </div>
    
    <!-- Main Content -->
    <div v-else>
      <!-- Header -->
      <div class="d-flex justify-space-between align-center mb-6">
      <div class="d-flex align-center">
        <v-icon icon="mdi-history" size="large" color="primary" class="me-3" />
        <div>
          <h1 class="text-h4 font-weight-bold">Run History</h1>
          <p class="text-subtitle-1 text-medium-emphasis ma-0">
            Real-time status updates from your automated workflows
          </p>
        </div>
      </div>
      
      <div class="d-flex align-center">
        <v-icon 
          :icon="taskStore.isConnected ? 'mdi-wifi' : 'mdi-wifi-off'" 
          :color="taskStore.isConnected ? 'success' : 'error'"
          size="small"
          class="me-2"
        />
        <span class="text-caption">
          {{ taskStore.isConnected ? 'Connected' : 'Disconnected' }}
        </span>
        
        <v-btn
          @click="refreshData"
          :loading="taskStore.isLoading"
          icon="mdi-refresh"
          variant="text"
          class="ml-2"
        />
      </div>
    </div>
    
    <!-- Error State -->
    <v-alert
      v-if="taskStore.error"
      type="error"
      variant="tonal"
      closable
      class="mb-4"
      @click:close="taskStore.setError(null)"
    >
      {{ taskStore.error }}
    </v-alert>
    
    <!-- Live Activity Banner -->
    <v-alert
      v-if="taskStore.hasLiveActivity"
      type="info"
      variant="elevated"
      class="mb-6"
      border="start"
      border-color="primary"
    >
      <template v-slot:prepend>
        <v-icon icon="mdi-broadcast" class="live-icon" />
      </template>
      
      <div class="d-flex justify-space-between align-center">
        <div>
          <div class="font-weight-medium">Live Activity Detected</div>
          <div v-if="liveActivity" class="text-caption mt-1">
            {{ liveActivity.type === 'task' ? 'Task' : 'Sequence' }} 
            <strong>{{ liveActivity.id }}</strong>
            <span v-if="liveActivity.currentStep"> - {{ liveActivity.currentStep }}</span>
            <span v-if="liveActivity.currentTaskPath"> - {{ liveActivity.currentTaskPath }}</span>
            is {{ liveActivity.phase }}
          </div>
        </div>
        
        <v-btn
          to="/live"
          variant="outlined"
          color="primary"
          size="small"
        >
          <v-icon icon="mdi-broadcast" size="small" class="me-1" />
          View Live Activity
        </v-btn>
      </div>
    </v-alert>
    
    <!-- Sequences Section -->
    <div class="mb-8">
      <div class="d-flex align-center mb-4">
        <v-icon icon="mdi-folder-multiple" class="me-2" />
        <h2 class="text-h6">Recent Sequences</h2>
        <v-chip 
          v-if="taskStore.sequences.length > 0" 
          size="small" 
          variant="outlined" 
          class="ml-2"
        >
          {{ taskStore.sequences.length }}
        </v-chip>
      </div>
      
      <v-data-table
        v-if="taskStore.sequences.length > 0"
        :headers="sequenceHeaders"
        :items="taskStore.sequences"
        density="compact"
        class="sequences-table"
        @click:row="onSequenceRowClick"
        hover
        :loading="taskStore.isLoading"
        item-value="sequenceId"
      >
        <template v-slot:item.phase="{ item }">
          <StatusBadge :phase="item.phase" />
        </template>
        
        <template v-slot:item.sequenceId="{ item }">
          <div class="d-flex align-center">
            <v-icon 
              :icon="isLiveSequence(item.sequenceId) ? 'mdi-broadcast' : 'mdi-folder-multiple'"
              :color="isLiveSequence(item.sequenceId) ? 'primary' : 'default'"
              size="small"
              class="me-2"
            />
            <div>
              <div class="font-weight-medium">{{ item.sequenceId }}</div>
              <div v-if="item.currentTaskPath" class="text-caption text-medium-emphasis">
                Current: {{ item.currentTaskPath }}
              </div>
            </div>
          </div>
        </template>
        
        <template v-slot:item.folderPath="{ item }">
          <div class="text-truncate" style="max-width: 200px;" :title="item.folderPath">
            {{ item.folderPath }}
          </div>
        </template>
        
        <template v-slot:item.duration="{ item }">
          <DurationDisplay :duration="item.stats?.totalDuration" />
        </template>
        
        <template v-slot:item.lastUpdate="{ item }">
          <span class="text-caption">{{ formatDate(item.lastUpdate) }}</span>
        </template>
      </v-data-table>
      
      <v-card v-else variant="outlined" class="empty-state">
        <v-card-text class="text-center py-8">
          <v-icon icon="mdi-folder-multiple-outline" size="64" class="mb-4 text-disabled" />
          <h3 class="text-h6 mb-2">No sequences have been run yet</h3>
          <p class="text-medium-emphasis">
            Sequences are collections of related tasks that run together in a workflow.
          </p>
        </v-card-text>
      </v-card>
    </div>
    
    <!-- Standalone Tasks Section -->
    <div>
      <div class="d-flex align-center mb-4">
        <v-icon icon="mdi-cog-outline" class="me-2" />
        <h2 class="text-h6">Recent Standalone Tasks</h2>
        <v-chip 
          v-if="taskStore.standaloneTasks.length > 0" 
          size="small" 
          variant="outlined" 
          class="ml-2"
        >
          {{ taskStore.standaloneTasks.length }}
        </v-chip>
      </div>
      
      <v-data-table
        v-if="taskStore.standaloneTasks.length > 0"
        :headers="taskHeaders"
        :items="taskStore.standaloneTasks"
        density="compact"
        class="tasks-table"
        @click:row="onTaskRowClick"
        hover
        :loading="taskStore.isLoading"
        item-value="taskId"
      >
        <template v-slot:item.phase="{ item }">
          <StatusBadge :phase="item.phase" />
        </template>
        
        <template v-slot:item.taskId="{ item }">
          <div class="d-flex align-center">
            <v-icon 
              :icon="isLiveTask(item.taskId) ? 'mdi-broadcast' : 'mdi-cog'"
              :color="isLiveTask(item.taskId) ? 'primary' : 'default'"
              size="small"
              class="me-2"
            />
            <div>
              <div class="font-weight-medium">{{ item.taskId }}</div>
              <div v-if="item.taskPath" class="text-caption text-medium-emphasis">
                {{ item.taskPath }}
              </div>
            </div>
          </div>
        </template>
        
        <template v-slot:item.pipeline="{ item }">
          <v-chip v-if="item.pipeline" size="small" variant="outlined">
            {{ item.pipeline }}
          </v-chip>
          <span v-else class="text-disabled">—</span>
        </template>
        
        <template v-slot:item.currentStep="{ item }">
          <v-chip v-if="item.currentStep" size="small" variant="tonal" color="primary">
            {{ item.currentStep }}
          </v-chip>
          <span v-else class="text-disabled">—</span>
        </template>
        
        <template v-slot:item.duration="{ item }">
          <DurationDisplay :duration="item.stats?.totalDuration" />
        </template>
        
        <template v-slot:item.lastUpdate="{ item }">
          <span class="text-caption">{{ formatDate(item.lastUpdate) }}</span>
        </template>
      </v-data-table>
      
      <v-card v-else variant="outlined" class="empty-state">
        <v-card-text class="text-center py-8">
          <v-icon icon="mdi-cog-outline" size="64" class="mb-4 text-disabled" />
          <h3 class="text-h6 mb-2">No standalone tasks have been run yet</h3>
          <p class="text-medium-emphasis">
            Standalone tasks are individual workflows that run independently.
          </p>
        </v-card-text>
      </v-card>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTaskStore } from '@/stores/taskStore';
import StatusBadge from '@/components/StatusBadge.vue';
import DurationDisplay from '@/components/DurationDisplay.vue';

const taskStore = useTaskStore();
const router = useRouter();
const initialLoading = ref(true);

// Table headers
const sequenceHeaders = [
  { title: 'Status', value: 'phase', width: '100px' },
  { title: 'Sequence ID', value: 'sequenceId', width: '250px' },
  { title: 'Folder Path', value: 'folderPath', width: '200px' },
  { title: 'Duration', value: 'duration', width: '120px' },
  { title: 'Last Update', value: 'lastUpdate', width: '150px' }
];

const taskHeaders = [
  { title: 'Status', value: 'phase', width: '100px' },
  { title: 'Task ID', value: 'taskId', width: '250px' },
  { title: 'Pipeline', value: 'pipeline', width: '120px' },
  { title: 'Current Step', value: 'currentStep', width: '150px' },
  { title: 'Duration', value: 'duration', width: '120px' },
  { title: 'Last Update', value: 'lastUpdate', width: '150px' }
];

// Get live activity info
const liveActivity = computed(() => taskStore.currentLiveActivity);

// Check if a specific task/sequence is live
const isLiveTask = (taskId: string) => {
  return taskStore.liveTask?.taskId === taskId;
};

const isLiveSequence = (sequenceId: string) => {
  return taskStore.liveSequence?.sequenceId === sequenceId;
};

// Row click handlers for tables
const onTaskRowClick = (_event: any, { item }: { item: any }) => {
  router.push(`/task/${item.taskId}`);
};

const onSequenceRowClick = (_event: any, { item }: { item: any }) => {
  router.push(`/sequence/${item.sequenceId}`);
};

// Format date helper
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString();
};

// Refresh data from API
const refreshData = async (isInitial = false) => {
  try {
    taskStore.setLoading(true);
    
    // Fetch history data
    const historyResponse = await fetch('/api/history');
    if (!historyResponse.ok) {
      throw new Error(`Failed to fetch history: ${historyResponse.status}`);
    }
    const historyData = await historyResponse.json();
    taskStore.updateFromHistory(historyData);
    
    // Fetch live data
    const liveResponse = await fetch('/api/live');
    if (!liveResponse.ok) {
      throw new Error(`Failed to fetch live data: ${liveResponse.status}`);
    }
    const liveData = await liveResponse.json();
    taskStore.updateFromLive(liveData);
    
  } catch (error) {
    console.error('Error refreshing data:', error);
    taskStore.setError(error instanceof Error ? error.message : 'Failed to refresh data');
  } finally {
    taskStore.setLoading(false);
    if (isInitial) {
      initialLoading.value = false;
    }
  }
};

// Auto-refresh data on mount
onMounted(() => {
  refreshData(true);
});

// Clean up on unmount
onUnmounted(() => {
  taskStore.setError(null);
});
</script>

<style scoped>
.history-view {
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

.sequences-table,
.tasks-table {
  background: rgb(var(--v-theme-surface));
  border-radius: 8px;
}

.sequences-table :deep(.v-data-table__tr--clickable:hover),
.tasks-table :deep(.v-data-table__tr--clickable:hover) {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  cursor: pointer;
}

.empty-state {
  margin-bottom: 16px;
}

.live-icon {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Responsive adjustments */
@media (max-width: 960px) {
  .history-view {
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