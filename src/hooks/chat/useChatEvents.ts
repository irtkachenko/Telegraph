'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { realtimeApi } from '@/services/realtime/realtime.service';

interface PresenceState {
  [key: string]: {
    user_id: string;
    isTyping: boolean;
    online_at: string;
  }[];
}

/**
 * Хук для подій чату (typing indicator) через Presence.
 * Підписка на повідомлення тепер відбувається глобально в useChatsRealtime.
 */
export function useChatEvents(chatId: string, user: User | null) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);

  const handlePresenceSync = useCallback(() => {
    if (!channelRef.current) return;
    const state = channelRef.current.presenceState();
    const typing = new Set<string>();

    Object.values(state as unknown as PresenceState).forEach((presences) => {
      presences.forEach((p) => {
        if (p.isTyping && p.user_id !== user?.id) {
          typing.add(p.user_id);
        }
      });
    });

    setTypingUsers((prev) => {
      if (prev.size !== typing.size) return typing;
      for (const id of typing) {
        if (!prev.has(id)) return typing;
      }
      return prev;
    });
  }, [user?.id]);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    // Створюємо канал для присутності в конкретному чаті
    const channel = realtimeApi.createChatChannel(chatId);
    channelRef.current = channel;

    // Listen for typing (presence)
    channel.on('presence', { event: 'sync' }, handlePresenceSync);

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ user_id: user.id, isTyping: false });
      }
    });

    return () => {
      if (channel) {
        realtimeApi.unsubscribe(channel);
      }
      channelRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [chatId, user?.id, handlePresenceSync]);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!channelRef.current) return;

      const now = Date.now();
      // Throttle: відправляємо статус кожні 2.5 секунди
      if (typing && now - lastSentRef.current < 2500) return;

      channelRef.current.track({ user_id: user?.id, isTyping: typing });
      if (typing) lastSentRef.current = now;

      // Автоматичне вимкнення статусу через 3 секунди бездіяльності
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typing) {
        timeoutRef.current = setTimeout(() => {
          channelRef.current?.track({ user_id: user?.id, isTyping: false });
        }, 3000);
      }
    },
    [user?.id],
  );

  return { typingUsers, setTyping };
}
