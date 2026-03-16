'use client';
/* eslint-disable react-compiler/react-compiler */

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  getHeartbeatInterval,
  getInactivityTimeout,
  getMaxReconnectAttempts,
  getPresenceDebounceDelay,
  getReconnectDelay,
} from '@/config/presence.config';
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
  lastActivity: number;
  cleanupTimeout: NodeJS.Timeout | null;
}

const MAX_RECONNECT_ATTEMPTS = getMaxReconnectAttempts();
const RECONNECT_DELAY = getReconnectDelay();
const HEARTBEAT_INTERVAL = getHeartbeatInterval();
const PRESENCE_DEBOUNCE_DELAY = getPresenceDebounceDelay();
const INACTIVITY_TIMEOUT = getInactivityTimeout();

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
    lastActivity: Date.now(),
    cleanupTimeout: null,
  };
}

async function updateLastSeen(): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_last_seen');
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to update last seen:', error.message);
      }
    }
  } catch {
    // Silently fail — this is best-effort
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    void updateLastSeen();
  }
}

function handleBeforeUnload(): void {
  void updateLastSeen();
}

function updateActivity(manager: PresenceManager): void {
  manager.lastActivity = Date.now();

  // Clear existing cleanup timeout
  if (manager.cleanupTimeout) {
    clearTimeout(manager.cleanupTimeout);
  }

  // Set new cleanup timeout
  manager.cleanupTimeout = setTimeout(() => {
    // Check if manager is still inactive and has no subscribers
    if (
      globalManager &&
      globalManager.userId === manager.userId &&
      globalManager.subscribers <= 0 &&
      Date.now() - globalManager.lastActivity >= INACTIVITY_TIMEOUT
    ) {
      cleanupPresence();
    }
  }, INACTIVITY_TIMEOUT);
}

function startHeartbeat(manager: PresenceManager): void {
  if (manager.heartbeatInterval) {
    clearInterval(manager.heartbeatInterval);
  }
  manager.heartbeatInterval = setInterval(() => {
    if (manager.channel) {
      updateActivity(manager);
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
  // Update activity when setting up channel
  updateActivity(manager);

  // Remove existing channel before creating new one to prevent memory leaks
  if (manager.channel) {
    supabase.removeChannel(manager.channel);
  }

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

// Global manager instance to ensure only one connection exists
let globalManager: PresenceManager | null = null;

function getOrCreateManager(
  userId: string,
  setOnlineUsers: (users: Set<string>) => void,
  setConnectionState: (state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING') => void,
): PresenceManager {
  if (globalManager && globalManager.userId === userId) {
    updateActivity(globalManager);
    return globalManager;
  }

  // If user changed, cleanup old manager
  if (globalManager) {
    cleanupPresence();
  }

  globalManager = createPresenceManager();
  globalManager.userId = userId;
  setupChannel(globalManager, userId, setOnlineUsers, setConnectionState);

  // Add global event listeners
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  return globalManager;
}

export function usePresenceSubscription() {
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);
  const setConnectionState = usePresenceStore((state) => state.setConnectionState);

  const subscribe = useCallback(
    (user: User | null) => {
      if (!user?.id) return;

      const manager = getOrCreateManager(user.id, setOnlineUsers, setConnectionState);
      manager.subscribers++;
      updateActivity(manager);
    },
    [setOnlineUsers, setConnectionState],
  );

  const unsubscribe = useCallback(() => {
    if (!globalManager) return;

    globalManager.subscribers--;

    // Cleanup when no more subscribers
    if (globalManager.subscribers <= 0) {
      cleanupPresence();
    }
  }, []);

  const getConnectionState = useCallback(() => {
    return usePresenceStore.getState().connectionState;
  }, []);

  return {
    subscribe,
    unsubscribe,
    getConnectionState,
  };
}

function cleanupPresence(): void {
  const manager = globalManager;
  if (!manager) return;

  // Clear debounce timer
  if (manager.debounceTimer) {
    clearTimeout(manager.debounceTimer);
    manager.debounceTimer = null;
  }

  // Clear cleanup timeout
  if (manager.cleanupTimeout) {
    clearTimeout(manager.cleanupTimeout);
    manager.cleanupTimeout = null;
  }

  // Update last seen before disconnecting
  void updateLastSeen();

  // Stop heartbeat
  stopHeartbeat(manager);

  // Remove channel
  if (manager.channel) {
    supabase.removeChannel(manager.channel);
    manager.channel = null;
  }

  // Remove global event listeners
  window.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);

  // Reset global state
  globalManager = null;

  // Update store state
  usePresenceStore.getState().setConnectionState('DISCONNECTED');
}

// Export cleanup function for manual cleanup if needed
export { cleanupPresence };
