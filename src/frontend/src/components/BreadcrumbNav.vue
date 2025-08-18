<template>
  <v-breadcrumbs class="breadcrumb-nav pa-0" :items="breadcrumbItems" density="compact">
    <template v-slot:prepend>
      <v-icon icon="mdi-home" size="small" />
    </template>
    
    <template v-slot:item="{ item }">
      <v-breadcrumbs-item 
        :disabled="item.disabled"
        :to="item.to"
        class="breadcrumb-item"
      >
        <v-icon 
          v-if="(item as any).icon" 
          :icon="(item as any).icon" 
          size="small" 
          class="me-1" 
        />
        {{ item.title }}
      </v-breadcrumbs-item>
    </template>
    
    <template v-slot:divider>
      <v-icon icon="mdi-chevron-right" size="small" class="mx-1" />
    </template>
  </v-breadcrumbs>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface BreadcrumbItem {
  title: string;
  to?: string;
  icon?: string;
  disabled?: boolean;
}

export interface BreadcrumbNavProps {
  items?: BreadcrumbItem[];
  taskId?: string;
  sequenceId?: string;
  currentPage?: 'history' | 'task' | 'sequence' | 'live';
}

const props = defineProps<BreadcrumbNavProps>();

const breadcrumbItems = computed(() => {
  const items: BreadcrumbItem[] = [];
  
  // Always start with History
  items.push({
    title: 'History',
    to: '/history',
    icon: 'mdi-history',
    disabled: props.currentPage === 'history'
  });
  
  // If we're in a sequence context, add sequence breadcrumb
  if (props.sequenceId) {
    items.push({
      title: props.sequenceId,
      to: `/sequence/${props.sequenceId}`,
      icon: 'mdi-folder-multiple',
      disabled: props.currentPage === 'sequence'
    });
  }
  
  // If we're viewing a specific task, add task breadcrumb
  if (props.taskId) {
    items.push({
      title: props.taskId,
      to: `/task/${props.taskId}`,
      icon: 'mdi-cog',
      disabled: props.currentPage === 'task'
    });
  }
  
  // Add any custom items passed in
  if (props.items) {
    items.push(...props.items);
  }
  
  return items;
});
</script>

<style scoped>
.breadcrumb-nav {
  margin-bottom: 16px;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
}

:deep(.v-breadcrumbs-item--disabled) {
  opacity: 1;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-weight: 500;
}

:deep(.v-breadcrumbs-item:not(.v-breadcrumbs-item--disabled)) {
  color: rgb(var(--v-theme-primary));
}

:deep(.v-breadcrumbs-item:not(.v-breadcrumbs-item--disabled):hover) {
  text-decoration: underline;
}
</style>