'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase/client';

interface PresenceState {
  onlineUsers: Set<string>;
  setOnlineUsers: (users: Set<string>) => void;
  connectionState: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void;
}

interface PresenceManager {
  channel: RealtimeChannel | null;
  userId: string | null;
  subscribers: number;
  heartbeatInterval: NodeJS.Timeout | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  debounceTimer: NodeJS.Timeout | null;
  pendingUsers: Set<string>;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000; // 2 seconds
const HEARTBEAT_INTERVAL = 1000 * 60 * 5; // 5 minutes
const PRESENCE_DEBOUNCE_DELAY = 500; // 500ms debounce for presence updates

function createPresenceManager(): PresenceManager {
  return {
    channel: null,
    userId: null,
    subscribers: 0,
    heartbeatInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    debounceTimer: null,
    pendingUsers: new Set(),
  };
}

function updateLastSeen(): Promise<void> {
  return supabase.rpc('update_last_seen');
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    updateLastSeen();
  }
}

function startHeartbeat(manager: PresenceManager): void {
  if (manager.heartbeatInterval) {
    clearInterval(manager.heartbeatInterval);
  }
  manager.heartbeatInterval = setInterval(() => {
    if (manager.channel) {
      manager.channel.track({
        user_id: manager.userId!,
        online_at: new Date().toISOString(),
      });
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat(manager: PresenceManager): void {
  if (manager.heartbeatInterval) {
    clearInterval(manager.heartbeatInterval);
    manager.heartbeatInterval = null;
  }
}

function debouncedPresenceUpdate(
  manager: PresenceManager,
  setOnlineUsers: (users: Set<string>) => void,
  onlineIds: Set<string>,
): void {
  if (manager.debounceTimer) {
    clearTimeout(manager.debounceTimer);
  }
  manager.debounceTimer = setTimeout(() => {
    setOnlineUsers(onlineIds);
    manager.debounceTimer = null;
  }, PRESENCE_DEBOUNCE_DELAY);
}

function setupChannel(
  manager: PresenceManager,
  userId: string,
  setOnlineUsers: (users: Set<string>) => void,
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void,
): void {
  manager.channel = supabase.channel('db-global-updates', {
    config: { presence: { key: userId } },
  });

  if (manager.channel) {
    manager.channel
      .on('presence', { event: 'sync' }, () => {
        const state = manager.channel!.presenceState();
        const onlineIds = new Set<string>();
        for (const key of Object.keys(state)) {
          onlineIds.add(key);
        }
        // Use debounced update to prevent render storms
        debouncedPresenceUpdate(manager, setOnlineUsers, onlineIds);
      })
      .subscribe(async (status: string) => {
        switch (status) {
          case 'SUBSCRIBED':
            setConnectionState('CONNECTED');
            manager.reconnectAttempts = 0;
            await manager.channel!.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
            startHeartbeat(manager);
            break;

          case 'CLOSED':
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            setConnectionState('DISCONNECTED');
            await updateLastSeen();
            stopHeartbeat(manager);

            // Attempt reconnection if we haven't exceeded max attempts
            if (
              manager.reconnectAttempts < manager.maxReconnectAttempts &&
              manager.subscribers > 0
            ) {
              manager.reconnectAttempts++;
              setConnectionState('RECONNECTING');

              // Exponential backoff: 2s, 4s, 8s, 16s, 32s...
              const delay = RECONNECT_DELAY * 2 ** (manager.reconnectAttempts - 1);

              setTimeout(() => {
                if (manager.channel && manager.subscribers > 0) {
                  setupChannel(manager, userId, setOnlineUsers, setConnectionState);
                }
              }, delay);
            }
            break;
        }
      });
  }
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set(),
  setOnlineUsers: (users) => set({ onlineUsers: users }),
  connectionState: 'DISCONNECTED',
  setConnectionState: (state) => set({ connectionState: state }),
}));

// Optimized selectors to prevent unnecessary re-renders
export const useOnlineUsers = () => usePresenceStore((state) => state.onlineUsers);
export const useConnectionState = () => usePresenceStore((state) => state.connectionState);
export const useIsUserOnline = (userId: string) =>
  usePresenceStore((state) => state.onlineUsers.has(userId));
export const useOnlineUserCount = () => usePresenceStore((state) => state.onlineUsers.size);

export function usePresence() {
  const onlineUsers = useOnlineUsers();
  return { onlineUsers };
}

export function usePresenceSubscription() {
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);
  const setConnectionState = usePresenceStore((state) => state.setConnectionState);
  const managerRef = useRef<PresenceManager | null>(null);

  // Store the ref globally for cleanup
  useEffect(() => {
    globalManagerRef.current = managerRef.current;
    return () => {
      globalManagerRef.current = null;
    };
  }, []);

  const subscribe = (user: User | null) => {
    if (!user?.id) {
      console.warn('Cannot subscribe to presence: no user ID');
      return;
    }

    // Initialize manager if it doesn't exist
    if (!managerRef.current) {
      managerRef.current = createPresenceManager();
    }

    // If this is a new user, clean up the old channel
    if (managerRef.current.userId && managerRef.current.userId !== user.id) {
      cleanupPresence();
      managerRef.current = createPresenceManager();
    }

    managerRef.current.userId = user.id;
    managerRef.current.subscribers++;

    // Setup channel if not already done
    if (!managerRef.current.channel && managerRef.current.subscribers === 1) {
      setupChannel(managerRef.current, user.id, setOnlineUsers, setConnectionState);

      // Add global event listeners
      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('beforeunload', updateLastSeen);
    }
  };

  const unsubscribe = () => {
    if (!managerRef.current) return;

    managerRef.current.subscribers--;

    // Cleanup when no more subscribers
    if (managerRef.current.subscribers <= 0) {
      cleanupPresence();
    }
  };

  const getConnectionState = () => {
    return usePresenceStore.getState().connectionState;
  };

  return {
    subscribe,
    unsubscribe,
    getConnectionState,
  };
}

// Global cleanup function
const globalManagerRef: { current: PresenceManager | null } = { current: null };

function cleanupPresence(): void {
  if (!globalManagerRef.current) return;

  // Clear debounce timer
  if (globalManagerRef.current.debounceTimer) {
    clearTimeout(globalManagerRef.current.debounceTimer);
    globalManagerRef.current.debounceTimer = null;
  }

  // Update last seen before disconnecting
  updateLastSeen();

  // Stop heartbeat
  stopHeartbeat(globalManagerRef.current);

  // Remove channel
  if (globalManagerRef.current.channel) {
    supabase.removeChannel(globalManagerRef.current.channel);
    globalManagerRef.current.channel = null;
  }

  // Remove global event listeners
  window.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', updateLastSeen);

  // Reset manager
  globalManagerRef.current = null;

  // Update store state
  usePresenceStore.getState().setConnectionState('DISCONNECTED');
}

// Export cleanup function for manual cleanup if needed
export { cleanupPresence };
