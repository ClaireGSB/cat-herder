<template>
  <div class="pipeline-steps">
    <h6 v-if="title" class="mb-3">{{ title }}</h6>
    
    <div class="steps-container">
      <div
        v-for="(step, index) in stepsList"
        :key="step.name"
        class="pipeline-step"
        :class="{
          'step-completed': step.status === 'done',
          'step-running': step.status === 'running',
          'step-failed': step.status === 'failed',
          'step-pending': !step.status || step.status === 'pending'
        }"
      >
        <!-- Step Number and Connector -->
        <div class="step-indicator">
          <div class="step-number">
            <v-icon
              v-if="step.status === 'done'"
              icon="mdi-check"
              size="small"
              color="success"
            />
            <v-progress-circular
              v-else-if="step.status === 'running'"
              indeterminate
              size="16"
              width="2"
              color="primary"
            />
            <v-icon
              v-else-if="step.status === 'failed'"
              icon="mdi-close"
              size="small"
              color="error"
            />
            <span v-else class="step-index">{{ index + 1 }}</span>
          </div>
          
          <!-- Connector line to next step -->
          <div
            v-if="index < stepsList.length - 1"
            class="step-connector"
            :class="{
              'connector-active': step.status === 'done'
            }"
          />
        </div>
        
        <!-- Step Content -->
        <div class="step-content">
          <div class="step-header">
            <h6 class="step-name">{{ step.name }}</h6>
            
            <div v-if="step.logs && showLogButtons" class="step-actions">
              <v-btn-group size="x-small" variant="outlined" density="compact">
                <v-btn
                  v-if="step.logs.log"
                  @click="$emit('loadLog', step.name, 'log')"
                  :variant="selectedLog?.step === step.name && selectedLog?.type === 'log' ? 'flat' : 'outlined'"
                >
                  <v-icon icon="mdi-file-document" size="x-small" />
                  Log
                </v-btn>
                
                <v-btn
                  v-if="step.logs.reasoning"
                  @click="$emit('loadLog', step.name, 'reasoning')"
                  :variant="selectedLog?.step === step.name && selectedLog?.type === 'reasoning' ? 'flat' : 'outlined'"
                >
                  <v-icon icon="mdi-lightbulb" size="x-small" />
                  Reasoning
                </v-btn>
                
                <v-btn
                  v-if="step.logs.raw"
                  @click="$emit('loadLog', step.name, 'raw')"
                  :variant="selectedLog?.step === step.name && selectedLog?.type === 'raw' ? 'flat' : 'outlined'"
                >
                  <v-icon icon="mdi-code-json" size="x-small" />
                  Raw
                </v-btn>
              </v-btn-group>
            </div>
            
            <v-btn
              v-if="step.status === 'running' && showLiveButton"
              size="x-small"
              variant="flat"
              color="primary"
              @click="$emit('goToLive')"
            >
              <v-icon icon="mdi-broadcast" size="x-small" class="me-1" />
              Live
            </v-btn>
          </div>
          
          <div v-if="(step as any).duration" class="step-duration">
            <v-icon icon="mdi-clock-outline" size="x-small" class="me-1" />
            <DurationDisplay :duration="(step as any).duration" />
          </div>
          
          <div v-if="(step as any).description" class="step-description text-caption text-medium-emphasis">
            {{ (step as any).description }}
          </div>
          
          <!-- Error message for failed steps -->
          <v-alert
            v-if="step.status === 'failed' && (step as any).error"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-2"
          >
            {{ (step as any).error }}
          </v-alert>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DurationDisplay from './DurationDisplay.vue';

export interface PipelineStep {
  name: string;
  status?: 'pending' | 'running' | 'done' | 'failed';
  duration?: number;
  description?: string;
  error?: string;
  logs?: {
    log?: string;
    reasoning?: string;
    raw?: string;
  };
}

export interface SelectedLog {
  step: string;
  type: 'log' | 'reasoning' | 'raw';
}

export interface PipelineStepsProps {
  steps: Record<string, string> | PipelineStep[];
  logs?: Record<string, any>;
  title?: string;
  showLogButtons?: boolean;
  showLiveButton?: boolean;
  selectedLog?: SelectedLog | null;
}

const props = withDefaults(defineProps<PipelineStepsProps>(), {
  showLogButtons: false,
  showLiveButton: false,
  selectedLog: null
});

defineEmits<{
  loadLog: [stepName: string, logType: string];
  goToLive: [];
}>();

// Convert steps to a consistent format
const stepsList = computed(() => {
  if (Array.isArray(props.steps)) {
    return props.steps;
  }
  
  // Convert from Record<string, string> format (from EJS templates)
  return Object.entries(props.steps).map(([name, status]) => ({
    name,
    status: status as 'pending' | 'running' | 'done' | 'failed',
    logs: props.logs?.[name] || undefined
  }));
});
</script>

<style scoped>
.pipeline-steps {
  width: 100%;
}

.steps-container {
  position: relative;
}

.pipeline-step {
  display: flex;
  align-items: flex-start;
  margin-bottom: 16px;
  position: relative;
}

.pipeline-step:last-child {
  margin-bottom: 0;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 16px;
  position: relative;
  flex-shrink: 0;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  border: 2px solid rgb(var(--v-border-color));
  background: rgb(var(--v-theme-surface));
  transition: all 0.2s ease;
  position: relative;
  z-index: 2;
}

.step-pending .step-number {
  color: rgb(var(--v-theme-on-surface-variant));
  background: rgb(var(--v-theme-surface-variant));
}

.step-running .step-number {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary-container));
  color: rgb(var(--v-theme-on-primary-container));
}

.step-completed .step-number {
  border-color: rgb(var(--v-theme-success));
  background: rgb(var(--v-theme-success));
  color: rgb(var(--v-theme-on-success));
}

.step-failed .step-number {
  border-color: rgb(var(--v-theme-error));
  background: rgb(var(--v-theme-error));
  color: rgb(var(--v-theme-on-error));
}

.step-connector {
  width: 2px;
  height: 24px;
  background: rgb(var(--v-border-color));
  margin-top: 4px;
  transition: all 0.2s ease;
}

.connector-active {
  background: rgb(var(--v-theme-success));
}

.step-content {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  gap: 12px;
}

.step-name {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
  margin: 0;
}

.step-running .step-name {
  color: rgb(var(--v-theme-primary));
}

.step-failed .step-name {
  color: rgb(var(--v-theme-error));
}

.step-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.step-duration {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface-variant));
  margin-bottom: 4px;
}

.step-description {
  font-style: italic;
}

.step-index {
  font-size: 0.75rem;
}
</style>