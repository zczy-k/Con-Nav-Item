import { ref, onMounted, onUnmounted } from 'vue';
import { getClientId } from '../api';

const sseConnection = ref(null);
const isConnected = ref(false);
const currentVersion = ref(0);
const listeners = new Map();

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

function connect() {
  if (sseConnection.value) {
    return;
  }

  const clientId = getClientId();
  const eventSource = new EventSource(`/api/sse/data-sync?clientId=${clientId}`);

  eventSource.onopen = () => {
    isConnected.value = true;
    reconnectAttempts = 0;
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        currentVersion.value = data.version;
        return;
      }

      if (data.type === 'version_change') {
        const isSelfChange = data.senderId === clientId;
        currentVersion.value = data.version;
        
        listeners.forEach((callback, key) => {
          try {
            callback({
              version: data.version,
              isSelfChange,
              payload: data
            });
          } catch (e) {
            console.error('SSE listener error:', key, e);
          }
        });
      }
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    isConnected.value = false;
    eventSource.close();
    sseConnection.value = null;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(connect, RECONNECT_DELAY * reconnectAttempts);
    }
  };

  sseConnection.value = eventSource;
}

function disconnect() {
  if (sseConnection.value) {
    sseConnection.value.close();
    sseConnection.value = null;
    isConnected.value = false;
  }
}

function subscribe(key, callback) {
  listeners.set(key, callback);
  
  if (!sseConnection.value) {
    connect();
  }
}

function unsubscribe(key) {
  listeners.delete(key);
  
  if (listeners.size === 0) {
    disconnect();
  }
}

export function useDataSync(componentKey, onDataChange) {
  onMounted(() => {
    if (onDataChange) {
      subscribe(componentKey, onDataChange);
    }
  });

  onUnmounted(() => {
    unsubscribe(componentKey);
  });

  return {
    isConnected,
    currentVersion,
    subscribe,
    unsubscribe
  };
}

export function useDataSyncManual() {
  return {
    isConnected,
    currentVersion,
    subscribe,
    unsubscribe,
    connect,
    disconnect
  };
}
