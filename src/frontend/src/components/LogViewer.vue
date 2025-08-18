<template>
  <v-card class="log-viewer">
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon icon="mdi-console" class="me-2" />
        Log Viewer
      </div>
      
      <v-progress-circular 
        v-if="loading"
        indeterminate
        size="20" 
        width="2"
        color="primary"
      />
    </v-card-title>
    
    <v-card-text class="pa-0">
      <v-tabs
        v-if="availableLogs.length > 0"
        v-model="selectedLogType"
        bg-color="transparent"
        density="compact"
      >
        <v-tab
          v-for="logType in availableLogs"
          :key="logType.type"
          :value="logType.type"
        >
          <v-icon :icon="logType.icon" size="small" class="me-2" />
          {{ logType.label }}
        </v-tab>
      </v-tabs>
      
      <div class="log-content">
        <div v-if="!selectedLogPath" class="empty-state">
          <v-icon icon="mdi-file-document-outline" size="64" class="mb-4 text-disabled" />
          <p class="text-medium-emphasis">Select a log type above to view its content</p>
        </div>
        
        <div v-else-if="loading" class="loading-state">
          <v-progress-circular indeterminate size="32" class="mb-4" />
          <p class="text-medium-emphasis">Loading log content...</p>
        </div>
        
        <div v-else-if="error" class="error-state">
          <v-icon icon="mdi-alert-circle" size="48" color="error" class="mb-2" />
          <p class="text-error mb-2">{{ error }}</p>
          <v-btn @click="loadLog" variant="outlined" size="small">
            <v-icon icon="mdi-refresh" class="me-1" />
            Retry
          </v-btn>
        </div>
        
        <div v-else-if="logContent" class="log-text-container">
          <pre class="log-text">{{ logContent }}</pre>
        </div>
        
        <div v-else class="empty-state">
          <v-icon icon="mdi-file-outline" size="48" class="mb-2 text-disabled" />
          <p class="text-medium-emphasis">No log content available</p>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

export interface LogFiles {
  log?: string;
  reasoning?: string;
  raw?: string;
}

export interface LogViewerProps {
  taskId: string;
  logs?: Record<string, LogFiles> | null;
  stepName?: string;
}

const props = defineProps<LogViewerProps>();

const selectedLogType = ref<string>('');
const logContent = ref<string>('');
const loading = ref(false);
const error = ref<string | null>(null);

// Define log types with metadata
const logTypes = [
  {
    type: 'log',
    label: 'Main Log',
    icon: 'mdi-file-document',
    description: 'Clean output from the AI tool'
  },
  {
    type: 'reasoning',
    label: 'Reasoning',
    icon: 'mdi-lightbulb',
    description: 'AI reasoning and decision process'
  },
  {
    type: 'raw',
    label: 'Raw JSON',
    icon: 'mdi-code-json',
    description: 'Raw line-by-line JSON from LLM'
  }
];

// Get available logs for the selected step
const availableLogs = computed(() => {
  if (!props.logs || !props.stepName || !props.logs[props.stepName]) {
    return [];
  }
  
  const stepLogs = props.logs[props.stepName];
  return logTypes.filter(logType => stepLogs[logType.type as keyof LogFiles]);
});

// Get the path for the currently selected log
const selectedLogPath = computed(() => {
  if (!props.logs || !props.stepName || !selectedLogType.value) {
    return null;
  }
  
  const stepLogs = props.logs[props.stepName];
  if (!stepLogs) return null;
  
  return stepLogs[selectedLogType.value as keyof LogFiles] || null;
});

// Load log content from API
const loadLog = async () => {
  if (!selectedLogPath.value) {
    logContent.value = '';
    return;
  }
  
  loading.value = true;
  error.value = null;
  
  try {
    const response = await fetch(`/api/log/${props.taskId}/${selectedLogPath.value}`);
    if (!response.ok) {
      throw new Error(`Failed to load log: ${response.status} ${response.statusText}`);
    }
    
    logContent.value = await response.text();
  } catch (err) {
    console.error('Error loading log:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load log content';
    logContent.value = '';
  } finally {
    loading.value = false;
  }
};

// Auto-select first available log when logs change
watch(availableLogs, (newLogs) => {
  if (newLogs.length > 0 && !selectedLogType.value) {
    selectedLogType.value = newLogs[0].type;
  }
}, { immediate: true });

// Load log content when selection changes
watch(selectedLogType, () => {
  if (selectedLogType.value) {
    loadLog();
  } else {
    logContent.value = '';
    error.value = null;
  }
});

// Expose method to select a specific log type
const selectLogType = (logType: string) => {
  selectedLogType.value = logType;
};

defineExpose({
  selectLogType
});
</script>

<style scoped>
.log-viewer {
  height: 500px;
  display: flex;
  flex-direction: column;
}

.log-content {
  flex: 1;
  min-height: 0;
  position: relative;
}

.empty-state,
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  text-align: center;
}

.log-text-container {
  height: 100%;
  overflow: auto;
  background: rgb(var(--v-theme-surface-variant));
  border-radius: 0 0 4px 4px;
}

.log-text {
  margin: 0;
  padding: 16px;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.4;
  color: rgb(var(--v-theme-on-surface));
  background: transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Custom scrollbar for webkit browsers */
.log-text-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.log-text-container::-webkit-scrollbar-track {
  background: rgb(var(--v-theme-surface));
}

.log-text-container::-webkit-scrollbar-thumb {
  background: rgb(var(--v-theme-outline));
  border-radius: 4px;
}

.log-text-container::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--v-theme-on-surface-variant));
}
</style>