'use client';

import { usePresenceStore } from '@/store/usePresenceStore';

/**
 * Hook for getting online users list.
 */
export function usePresence() {
  const onlineUsers = usePresenceStore((state) => state.onlineUsers);
  return { onlineUsers };
}
