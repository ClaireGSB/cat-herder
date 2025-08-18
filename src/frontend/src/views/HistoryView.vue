<template>
  <div class="history-view">
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
        <h2 class="text-h5">Recent Sequences</h2>
        <v-chip 
          v-if="taskStore.sequences.length > 0" 
          size="small" 
          variant="outlined" 
          class="ml-2"
        >
          {{ taskStore.sequences.length }}
        </v-chip>
      </div>
      
      <div v-if="taskStore.sequences.length > 0" class="sequences-grid">
        <SequenceCard
          v-for="sequence in taskStore.sequences"
          :key="sequence.sequenceId"
          :sequence="sequence"
          :is-live="isLiveSequence(sequence.sequenceId)"
        />
      </div>
      
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
        <h2 class="text-h5">Recent Standalone Tasks</h2>
        <v-chip 
          v-if="taskStore.standaloneTasks.length > 0" 
          size="small" 
          variant="outlined" 
          class="ml-2"
        >
          {{ taskStore.standaloneTasks.length }}
        </v-chip>
      </div>
      
      <div v-if="taskStore.standaloneTasks.length > 0" class="tasks-grid">
        <TaskCard
          v-for="task in taskStore.standaloneTasks"
          :key="task.taskId"
          :task="task"
          :is-live="isLiveTask(task.taskId)"
        />
      </div>
      
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
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '@/stores/taskStore';
import TaskCard from '@/components/TaskCard.vue';
import SequenceCard from '@/components/SequenceCard.vue';

const taskStore = useTaskStore();

// Get live activity info
const liveActivity = computed(() => taskStore.currentLiveActivity);

// Check if a specific task/sequence is live
const isLiveTask = (taskId: string) => {
  return taskStore.liveTask?.taskId === taskId;
};

const isLiveSequence = (sequenceId: string) => {
  return taskStore.liveSequence?.sequenceId === sequenceId;
};

// Refresh data from API
const refreshData = async () => {
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
  }
};

// Auto-refresh data on mount
onMounted(() => {
  refreshData();
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

.sequences-grid,
.tasks-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
}

@media (max-width: 768px) {
  .sequences-grid,
  .tasks-grid {
    grid-template-columns: 1fr;
  }
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