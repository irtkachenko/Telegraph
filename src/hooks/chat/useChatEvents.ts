'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { realtimeApi } from '@/services/realtime/realtime.service';
import type { Message, RealtimePayload } from '@/types';
import type { User } from '@supabase/supabase-js';

export function useChatEvents(chatId: string, user: User | null) {
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);

  const handleMessage = useCallback((payload: RealtimePayload<Message>) => {
    if (payload.eventType !== 'INSERT') return;
    
    const newMessage = payload.new;
    if (!newMessage || newMessage.chat_id !== chatId) return;

    queryClient.setQueryData(['messages', chatId], (old: any) => {
      if (!old) return old;
      
      const newPages = [...old.pages];
      const lastPageIdx = newPages.length - 1;
      
      // Duplication check
      const exists = newPages.some(page => page.some((m: Message) => m.id === newMessage.id));
      if (exists) return old;

      newPages[lastPageIdx] = [...newPages[lastPageIdx], newMessage];
      return { ...old, pages: newPages };
    });
  }, [chatId, queryClient]);

  const handlePresenceSync = useCallback(() => {
    if (!channelRef.current) return;
    const state = channelRef.current.presenceState();
    const typing = new Set<string>();
    
    Object.values(state).forEach((presences: any) => {
      presences.forEach((p: any) => {
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

    // Clean up previous channel if any
    if (channelRef.current) {
      realtimeApi.unsubscribe(channelRef.current);
    }

    const channel = realtimeApi.createChatChannel(chatId);
    channelRef.current = channel;

    // Listen for messages
    realtimeApi.subscribeToMessages(channel, handleMessage);

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
    };
  }, [chatId, user?.id, handleMessage, handlePresenceSync]);

  const setTyping = useCallback((typing: boolean) => {
    if (!channelRef.current) return;

    const now = Date.now();
    // Throttle: only send 'typing: true' every 2.5 seconds
    if (typing && now - lastSentRef.current < 2500) return;

    channelRef.current.track({ user_id: user?.id, isTyping: typing });
    if (typing) lastSentRef.current = now;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (typing) {
      timeoutRef.current = setTimeout(() => {
        channelRef.current?.track({ user_id: user?.id, isTyping: false });
      }, 3000);
    }
  }, [user?.id]);

  return { typingUsers, setTyping };
}
