<template>
  <v-card class="log-viewer">
    <v-card-title class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon icon="mdi-console" class="me-2" />
        Log Viewer
        <v-chip 
          v-if="props.isLiveMode"
          color="primary" 
          variant="flat" 
          size="small" 
          class="ml-2 live-pulse"
        >
          LIVE
        </v-chip>
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
        v-if="!props.isLiveMode && availableLogs.length > 0"
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
        <!-- Live Mode Display -->
        <div v-if="props.isLiveMode" class="log-text-container" ref="logContainer">
          <div v-if="!effectiveLogContent" class="empty-state">
            <v-icon icon="mdi-broadcast" size="48" class="mb-2 text-disabled" />
            <p class="text-medium-emphasis">Waiting for live log content...</p>
          </div>
          <pre v-else class="log-text" v-html="colorizeLogContent(effectiveLogContent)"></pre>
        </div>
        
        <!-- Static Mode Display -->
        <div v-else>
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
          
          <div v-else-if="effectiveLogContent" class="log-text-container">
            <pre class="log-text" v-html="colorizeLogContent(effectiveLogContent)"></pre>
          </div>
          
          <div v-else class="empty-state">
            <v-icon icon="mdi-file-outline" size="48" class="mb-2 text-disabled" />
            <p class="text-medium-emphasis">No log content available</p>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useTaskStore } from '@/stores/taskStore';

export interface LogFiles {
  log?: string;
  reasoning?: string;
  raw?: string;
}

export interface LogViewerProps {
  taskId: string;
  logs?: Record<string, LogFiles> | null;
  stepName?: string;
  isLiveMode?: boolean;
}

const props = defineProps<LogViewerProps>();
const taskStore = useTaskStore();

const selectedLogType = ref<string>('');
const logContent = ref<string>('');
const loading = ref(false);
const error = ref<string | null>(null);
const logContainer = ref<HTMLElement | null>(null);

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

// Get the effective log content (live or static)
const effectiveLogContent = computed(() => {
  if (props.isLiveMode && taskStore.liveLogContent) {
    return taskStore.liveLogContent;
  }
  return logContent.value;
});

// Auto-scroll function for live content
const scrollToBottom = async () => {
  if (logContainer.value) {
    await nextTick();
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
};

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

// Colorize log content function
const colorizeLogContent = (content: string): string => {
  if (!content) return '';
  
  // Escape HTML to prevent XSS attacks
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  
  // Apply colorization
  return escaped
    // [ASSISTANT] - Blue
    .replace(/(\[ASSISTANT\])/g, '<span class="log-assistant">$1</span>')
    // [TOOL_USE] - Yellow
    .replace(/(\[TOOL_USE\])/g, '<span class="log-tool">$1</span>')
    // [ERROR] - Red
    .replace(/(\[ERROR\])/g, '<span class="log-error">$1</span>')
    // [WARNING] - Orange
    .replace(/(\[WARNING\])/g, '<span class="log-warning">$1</span>')
    // [INFO] - Green
    .replace(/(\[INFO\])/g, '<span class="log-info">$1</span>')
    // [DEBUG] - Gray
    .replace(/(\[DEBUG\])/g, '<span class="log-debug">$1</span>')
    // [SUCCESS] - Green bright
    .replace(/(\[SUCCESS\])/g, '<span class="log-success">$1</span>')
    // Generic [WORD] patterns - Cyan
    .replace(/(\[[A-Z_]+\])/g, '<span class="log-generic">$1</span>');
};

// Auto-select first available log when logs change
watch(availableLogs, (newLogs) => {
  if (newLogs.length > 0 && !selectedLogType.value) {
    selectedLogType.value = newLogs[0].type;
  }
}, { immediate: true });

// Load log content when selection changes
watch(selectedLogType, () => {
  if (selectedLogType.value && !props.isLiveMode) {
    loadLog();
  } else {
    logContent.value = '';
    error.value = null;
  }
});

// Watch live log content for auto-scroll
watch(() => taskStore.liveLogContent, () => {
  if (props.isLiveMode) {
    scrollToBottom();
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
  background: #1e1e1e;
  border-radius: 0 0 4px 4px;
  border: 1px solid #333;
}

.log-text {
  margin: 0;
  padding: 16px;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #e0e0e0;
  background: transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Log colorization classes */
.log-text :deep(.log-assistant) {
  color: #66b3ff;
  font-weight: 600;
}

.log-text :deep(.log-tool) {
  color: #ffcc66;
  font-weight: 600;
}

.log-text :deep(.log-error) {
  color: #ff6666;
  font-weight: 600;
}

.log-text :deep(.log-warning) {
  color: #ff9966;
  font-weight: 600;
}

.log-text :deep(.log-info) {
  color: #66ff99;
  font-weight: 600;
}

.log-text :deep(.log-debug) {
  color: #999999;
  font-weight: 500;
}

.log-text :deep(.log-success) {
  color: #66ff66;
  font-weight: 600;
}

.log-text :deep(.log-generic) {
  color: #66ffff;
  font-weight: 500;
}

/* Custom scrollbar for webkit browsers - Terminal theme */
.log-text-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.log-text-container::-webkit-scrollbar-track {
  background: #2a2a2a;
}

.log-text-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-text-container::-webkit-scrollbar-thumb:hover {
  background: #777;
}

/* Live mode animation */
.live-pulse {
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
</style>