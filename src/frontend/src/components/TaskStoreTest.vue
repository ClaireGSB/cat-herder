<template>
  <div class="task-store-test">
    <h3>Task Store Test</h3>
    
    <div class="store-state">
      <h4>Store State:</h4>
      <p>Tasks count: {{ taskStore.tasks.length }}</p>
      <p>Sequences count: {{ taskStore.sequences.length }}</p>
      <p>Is Live: {{ taskStore.isLive }}</p>
      <p>Is Connected: {{ taskStore.isConnected }}</p>
      <p>Error: {{ taskStore.error || 'None' }}</p>
    </div>

    <div class="actions">
      <h4>Test Actions:</h4>
      <v-btn @click="testHistoryUpdate" color="primary" class="ma-1">
        Update from History
      </v-btn>
      <v-btn @click="testTaskUpdate" color="secondary" class="ma-1">
        Add Test Task
      </v-btn>
      <v-btn @click="testSequenceUpdate" color="success" class="ma-1">
        Add Test Sequence
      </v-btn>
      <v-btn @click="testClear" color="error" class="ma-1">
        Clear All
      </v-btn>
    </div>

    <div class="getters-test">
      <h4>Getters Test:</h4>
      <p>Running tasks: {{ taskStore.runningTasks.length }}</p>
      <p>Completed tasks: {{ taskStore.completedTasks.length }}</p>
      <p>Standalone tasks: {{ taskStore.standaloneTasks.length }}</p>
      <p>Has live activity: {{ taskStore.hasLiveActivity }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTaskStore } from '@/stores/taskStore';
import type { TaskDetails, SequenceDetails } from '@/stores/types';

const taskStore = useTaskStore();

function testHistoryUpdate() {
  taskStore.updateFromHistory({
    tasks: [
      {
        taskId: 'test-task-1',
        taskPath: 'test/task-1.md',
        phase: 'done',
        lastUpdate: new Date().toISOString(),
        pipeline: 'default'
      },
      {
        taskId: 'test-task-2',
        taskPath: 'test/task-2.md',
        phase: 'running',
        lastUpdate: new Date().toISOString(),
        currentStep: 'implement',
        pipeline: 'default'
      }
    ],
    sequences: [
      {
        sequenceId: 'sequence-test-1',
        phase: 'running',
        lastUpdate: new Date().toISOString(),
        folderPath: 'test-sequence'
      }
    ]
  });
}

function testTaskUpdate() {
  const testTask: TaskDetails = {
    taskId: `test-task-${Date.now()}`,
    taskPath: 'test/new-task.md',
    phase: 'running',
    lastUpdate: new Date().toISOString(),
    currentStep: 'plan',
    pipeline: 'default'
  };
  taskStore.handleTaskUpdate(testTask);
}

function testSequenceUpdate() {
  const testSequence: SequenceDetails = {
    sequenceId: `sequence-test-${Date.now()}`,
    phase: 'running',
    lastUpdate: new Date().toISOString(),
    folderPath: 'test-sequence',
    tasks: []
  };
  taskStore.handleSequenceUpdate(testSequence);
}

function testClear() {
  taskStore.clearAll();
}
</script>

<style scoped>
.task-store-test {
  padding: 20px;
}

.store-state, .actions, .getters-test {
  margin-bottom: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

h3, h4 {
  margin-bottom: 10px;
}

p {
  margin: 5px 0;
}
</style>