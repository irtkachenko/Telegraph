'use client';

import { useEffect, useRef, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';

interface TypingPresence {
  isTyping: boolean;
}

/**
 * Хук для відстеження статусу "користувач пише" через Supabase Presence.
 */
export function useChatTyping(chatId: string) {
  const { user } = useSupabaseAuth();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel(`typing:${chatId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as RealtimePresenceState<TypingPresence>;
        const typingMap: Record<string, boolean> = {};

        for (const id in state) {
          typingMap[id] = state[id].some((p: TypingPresence) => p.isTyping);
        }
        setIsTyping(typingMap);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ isTyping: false });
        }
      });

    channelRef.current = channel;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [chatId, user?.id]);

  const setTyping = (typing: boolean) => {
    if (channelRef.current) {
      channelRef.current.track({ isTyping: typing });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (typing) {
        timeoutRef.current = setTimeout(() => {
          channelRef.current?.track({ isTyping: false });
        }, 3000);
      }
    }
  };

  return { isTyping, setTyping };
}
