<template>
  <v-card v-if="tokenUsage && Object.keys(tokenUsage).length > 0" class="token-usage-card">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-chart-line" class="me-2" />
      Token Usage
    </v-card-title>
    
    <v-card-text>
      <v-row>
        <v-col 
          v-for="[model, usage] in Object.entries(tokenUsage)" 
          :key="model"
          cols="12"
          :md="Object.keys(tokenUsage).length === 1 ? 12 : 6"
        >
          <div class="model-usage">
            <h6 class="mb-3 d-flex align-center">
              <v-icon icon="mdi-cpu" size="small" class="me-2" />
              {{ formatModelName(model) }}
            </h6>
            
            <v-row class="text-center">
              <v-col cols="6" md="3">
                <div class="usage-stat">
                  <div class="stat-value text-primary">{{ formatTokenCount(usage.inputTokens) }}</div>
                  <div class="stat-label">Input</div>
                </div>
              </v-col>
              
              <v-col cols="6" md="3">
                <div class="usage-stat">
                  <div class="stat-value text-success">{{ formatTokenCount(usage.outputTokens) }}</div>
                  <div class="stat-label">Output</div>
                </div>
              </v-col>
              
              <v-col cols="6" md="3">
                <div class="usage-stat">
                  <div class="stat-value text-info">{{ formatTokenCount(usage.cacheCreationInputTokens) }}</div>
                  <div class="stat-label">Cache Write</div>
                </div>
              </v-col>
              
              <v-col cols="6" md="3">
                <div class="usage-stat">
                  <div class="stat-value text-warning">{{ formatTokenCount(usage.cacheReadInputTokens) }}</div>
                  <div class="stat-label">Cache Read</div>
                </div>
              </v-col>
            </v-row>
            
            <!-- Total for this model -->
            <v-divider class="my-3" />
            <div class="text-center">
              <div class="usage-stat">
                <div class="stat-value text-medium-emphasis">{{ formatTokenCount(getTotalTokens(usage)) }}</div>
                <div class="stat-label">Total</div>
              </div>
            </div>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface TokenUsageCardProps {
  tokenUsage?: Record<string, TokenUsage> | null;
}

const props = defineProps<TokenUsageCardProps>();

const formatTokenCount = (count?: number): string => {
  if (!count || count === 0) return '0';
  return count.toLocaleString();
};

const formatModelName = (model: string): string => {
  // Convert model names to more readable format
  return model
    .replace(/claude-3-5-sonnet-\d+/, 'Claude 3.5 Sonnet')
    .replace(/claude-3-5-haiku-\d+/, 'Claude 3.5 Haiku')
    .replace(/claude-3-opus-\d+/, 'Claude 3 Opus')
    .replace(/claude-opus-4-1-\d+/, 'Claude Opus 4.1')
    .replace(/claude-sonnet-4-\d+/, 'Claude Sonnet 4')
    // Fallback: capitalize and remove hyphens/numbers at the end
    .replace(/-\d{8}$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getTotalTokens = (usage: TokenUsage): number => {
  return (usage.inputTokens || 0) + 
         (usage.outputTokens || 0) + 
         (usage.cacheCreationInputTokens || 0) + 
         (usage.cacheReadInputTokens || 0);
};
</script>

<style scoped>
.token-usage-card {
  margin-bottom: 16px;
}

.model-usage {
  padding: 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.usage-stat {
  padding: 8px 0;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 0.875rem;
  color: rgb(var(--v-theme-on-surface-variant));
  margin-top: 4px;
}

h6 {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}
</style>