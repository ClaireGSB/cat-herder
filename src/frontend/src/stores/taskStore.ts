import { defineStore } from 'pinia';
import type {
  TaskStatus,
  TaskDetails,
  SequenceStatus,
  SequenceDetails,
  LiveActivity,
  HistoryResponse,
  LiveResponse
} from './types';

interface TaskStoreState {
  // Task and sequence data
  tasks: TaskStatus[];
  sequences: SequenceStatus[];
  
  // Live activity state
  liveTask: TaskDetails | null;
  liveSequence: SequenceDetails | null;
  isLive: boolean;
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // WebSocket connection state
  isConnected: boolean;
}

export const useTaskStore = defineStore('tasks', {
  state: (): TaskStoreState => ({
    tasks: [],
    sequences: [],
    liveTask: null,
    liveSequence: null,
    isLive: false,
    isLoading: false,
    error: null,
    isConnected: false,
  }),

  getters: {
    // Get tasks filtered by phase
    runningTasks: (state) => state.tasks.filter(task => task.phase === 'running'),
    completedTasks: (state) => state.tasks.filter(task => task.phase === 'done'),
    failedTasks: (state) => state.tasks.filter(task => task.phase === 'failed'),
    
    // Get sequences filtered by phase
    runningSequences: (state) => state.sequences.filter(seq => seq.phase === 'running'),
    completedSequences: (state) => state.sequences.filter(seq => seq.phase === 'done'),
    failedSequences: (state) => state.sequences.filter(seq => seq.phase === 'failed'),
    
    // Get standalone tasks (not part of sequences)
    standaloneTasks: (state) => state.tasks.filter(task => !task.parentSequenceId),
    
    // Get tasks for a specific sequence
    getTasksForSequence: (state) => (sequenceId: string) =>
      state.tasks.filter(task => task.parentSequenceId === sequenceId),
    
    // Get task by ID
    getTaskById: (state) => (taskId: string) =>
      state.tasks.find(task => task.taskId === taskId),
    
    // Get sequence by ID
    getSequenceById: (state) => (sequenceId: string) =>
      state.sequences.find(sequence => sequence.sequenceId === sequenceId),
    
    // Check if there's any live activity
    hasLiveActivity: (state) => state.isLive && (!!state.liveTask || !!state.liveSequence),
    
    // Get current live activity info
    currentLiveActivity: (state) => {
      if (!state.isLive) return null;
      if (state.liveTask) {
        return {
          type: 'task' as const,
          id: state.liveTask.taskId,
          phase: state.liveTask.phase,
          currentStep: state.liveTask.currentStep,
        };
      }
      if (state.liveSequence) {
        return {
          type: 'sequence' as const,
          id: state.liveSequence.sequenceId,
          phase: state.liveSequence.phase,
          currentTaskPath: state.liveSequence.currentTaskPath,
        };
      }
      return null;
    },
  },

  actions: {
    // Update from initial history data (HTTP API call)
    updateFromHistory(historyData: HistoryResponse) {
      this.tasks = historyData.tasks;
      this.sequences = historyData.sequences;
      this.error = null;
    },

    // Update from live data (HTTP API call)
    updateFromLive(liveData: LiveResponse) {
      this.isLive = liveData.isLive;
      this.liveTask = liveData.liveTask || null;
      this.liveSequence = liveData.liveSequence || null;
      this.error = null;
    },

    // Handle task updates from WebSocket
    handleTaskUpdate(taskData: TaskDetails) {
      // Update or add the task in the tasks array
      const existingIndex = this.tasks.findIndex(task => task.taskId === taskData.taskId);
      if (existingIndex >= 0) {
        this.tasks[existingIndex] = taskData;
      } else {
        this.tasks.unshift(taskData); // Add to beginning (most recent first)
      }

      // Update live task if this is the currently live task
      if (this.isLive && this.liveTask && this.liveTask.taskId === taskData.taskId) {
        this.liveTask = taskData;
      }

      // Set as live task if it's running
      if (taskData.phase === 'running') {
        this.liveTask = taskData;
        this.isLive = true;
      }

      // Clear live task if it's no longer running
      if (this.liveTask && this.liveTask.taskId === taskData.taskId && taskData.phase !== 'running') {
        this.liveTask = null;
        this.isLive = false;
      }
    },

    // Handle sequence updates from WebSocket
    handleSequenceUpdate(sequenceData: SequenceDetails) {
      // Update or add the sequence in the sequences array
      const existingIndex = this.sequences.findIndex(seq => seq.sequenceId === sequenceData.sequenceId);
      if (existingIndex >= 0) {
        this.sequences[existingIndex] = sequenceData;
      } else {
        this.sequences.unshift(sequenceData); // Add to beginning (most recent first)
      }

      // Update live sequence if this is the currently live sequence
      if (this.isLive && this.liveSequence && this.liveSequence.sequenceId === sequenceData.sequenceId) {
        this.liveSequence = sequenceData;
      }

      // Set as live sequence if it's running
      if (sequenceData.phase === 'running') {
        this.liveSequence = sequenceData;
        this.isLive = true;
      }

      // Clear live sequence if it's no longer running
      if (this.liveSequence && this.liveSequence.sequenceId === sequenceData.sequenceId && sequenceData.phase !== 'running') {
        this.liveSequence = null;
        this.isLive = false;
      }
    },

    // Handle live activity updates from WebSocket
    handleLiveActivity(activityData: LiveActivity) {
      if (activityData.type === 'task' && activityData.taskId) {
        // Update the current step and phase of the live task
        if (this.liveTask && this.liveTask.taskId === activityData.taskId) {
          this.liveTask.phase = activityData.phase;
          this.liveTask.currentStep = activityData.currentStep;
        }
      } else if (activityData.type === 'sequence' && activityData.sequenceId) {
        // Update the phase of the live sequence
        if (this.liveSequence && this.liveSequence.sequenceId === activityData.sequenceId) {
          this.liveSequence.phase = activityData.phase;
        }
      }
    },

    // Set WebSocket connection state
    setConnectionState(connected: boolean) {
      this.isConnected = connected;
    },

    // Set loading state
    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    // Set error state
    setError(error: string | null) {
      this.error = error;
    },

    // Clear all data (useful for reset/refresh)
    clearAll() {
      this.tasks = [];
      this.sequences = [];
      this.liveTask = null;
      this.liveSequence = null;
      this.isLive = false;
      this.error = null;
    },

    // Refresh data from API
    async refreshData() {
      this.setLoading(true);
      try {
        // This will be called by components that have access to the API
        // The actual HTTP calls will be made by the component and passed to updateFromHistory/updateFromLive
        this.setError(null);
      } catch (error) {
        this.setError(error instanceof Error ? error.message : 'Failed to refresh data');
      } finally {
        this.setLoading(false);
      }
    },
  },
});