import { useTaskStore } from '@/stores/taskStore';
import type { TaskDetails, SequenceDetails, LiveActivity } from '@/stores/types';

interface WebSocketMessage {
  type: 'task_update' | 'sequence_update' | 'live_activity';
  data: TaskDetails | SequenceDetails | LiveActivity;
}

export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private taskStore: ReturnType<typeof useTaskStore> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private reconnectTimeout: number | null = null;
  private url: string;

  constructor() {
    // Use the current host but switch to WebSocket protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws`;
  }

  public initialize() {
    // Get the task store instance
    this.taskStore = useTaskStore();
    this.connect();
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connecting or connected
    }

    this.taskStore?.setConnectionState(false);
    this.updateConnectionState(ConnectionState.CONNECTING);

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventListeners();
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.updateConnectionState(ConnectionState.ERROR);
      this.scheduleReconnect();
    }
  }

  private setupEventListeners() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket connected successfully');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000; // Reset delay
      this.taskStore?.setConnectionState(true);
      this.updateConnectionState(ConnectionState.CONNECTED);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error, event.data);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      this.taskStore?.setConnectionState(false);
      
      if (event.wasClean) {
        this.updateConnectionState(ConnectionState.DISCONNECTED);
      } else {
        this.updateConnectionState(ConnectionState.ERROR);
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionState(ConnectionState.ERROR);
    };
  }

  private handleMessage(message: WebSocketMessage) {
    if (!this.taskStore) {
      console.warn('Task store not available, ignoring WebSocket message');
      return;
    }

    switch (message.type) {
      case 'task_update':
        this.taskStore.handleTaskUpdate(message.data as TaskDetails);
        break;
        
      case 'sequence_update':
        this.taskStore.handleSequenceUpdate(message.data as SequenceDetails);
        break;
        
      case 'live_activity':
        this.taskStore.handleLiveActivity(message.data as LiveActivity);
        break;
        
      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Giving up.');
      this.updateConnectionState(ConnectionState.ERROR);
      return;
    }

    this.reconnectAttempts++;
    this.updateConnectionState(ConnectionState.RECONNECTING);

    // Clear any existing timeout
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
    }

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${this.reconnectDelay}ms`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
      // Exponential backoff with jitter
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2 + Math.random() * 1000,
        this.maxReconnectDelay
      );
    }, this.reconnectDelay);
  }

  private updateConnectionState(state: ConnectionState) {
    // This could be used to update a global connection state if needed
    // For now, we just log it
    console.log('WebSocket connection state:', state);
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.taskStore?.setConnectionState(false);
    this.updateConnectionState(ConnectionState.DISCONNECTED);
  }

  public getConnectionState(): ConnectionState {
    if (!this.ws) return ConnectionState.DISCONNECTED;
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return ConnectionState.CONNECTING;
      case WebSocket.OPEN:
        return ConnectionState.CONNECTED;
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return this.reconnectTimeout ? ConnectionState.RECONNECTING : ConnectionState.DISCONNECTED;
      default:
        return ConnectionState.ERROR;
    }
  }

  public forceReconnect() {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.connect();
  }
}

// Export a singleton instance
export const webSocketService = new WebSocketService();

// Export the service class for testing
export { WebSocketService };