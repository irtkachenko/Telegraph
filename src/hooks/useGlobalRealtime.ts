'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { usePresenceSubscription } from '@/store/usePresenceStore';

/**
 * Хук для глобального реалтайму (presence, сповіщення).
 * Має бути викликаний на верхньому рівні (AuthProvider).
 */
export function useGlobalRealtime(user: User | null) {
  const { subscribe, unsubscribe } = usePresenceSubscription();

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Subscribe to presence using singleton manager
    subscribe(user);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [user?.id, subscribe, unsubscribe]);
}
