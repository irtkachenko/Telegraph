'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { realtimeApi, type RealtimeMessagePayload } from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { FullChat, Message } from '@/types';
import { updateChatMessageIfMatches, upsertChatLastMessage } from './chats-cache';

interface MessagePayload {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  updated_at?: string | null;
  attachments?: Message['attachments'];
  [key: string]: unknown;
}

interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  errors?: string[];
}

function validatePayload<T>(
  payload: RealtimePayload<T>,
  requiredFields: (keyof T)[],
): payload is RealtimePayload<T> {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.errors && payload.errors.length > 0) return false;
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    if (!payload.new || typeof payload.new !== 'object') return false;
    for (const field of requiredFields) {
      if (!(field in payload.new)) return false;
    }
  }
  return true;
}

export function useChatsRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    if (channelRef.current) {
      realtimeApi.unsubscribe(channelRef.current);
      channelRef.current = null;
    }

    const channel = realtimeApi.createMessagesChannel();

    const handleInsert = (payload: RealtimeMessagePayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;
      
      const newMessage = payload.new as Message;

      // 1. Update chat list (last message preview)
      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        upsertChatLastMessage(old, newMessage.chat_id, newMessage),
      );

      // 2. Update specific chat messages cache
      queryClient.setQueryData(['messages', newMessage.chat_id], (old: any) => {
        if (!old) return old;

        // Check for duplicates (if we sent the message ourselves and already have an optimistic or real entry)
        const exists = old.pages.some((page: Message[]) =>
          page.some((m) => m.id === newMessage.id),
        );
        if (exists) return old;

        const newPages = [...old.pages];
        const lastPageIdx = newPages.length - 1;
        newPages[lastPageIdx] = [...newPages[lastPageIdx], newMessage];

        return { ...old, pages: newPages };
      });
    };

    const handleUpdate = (payload: RealtimeMessagePayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;
      
      const updatedMessage = payload.new as Message;
      if (!updatedMessage?.id || !updatedMessage?.chat_id) return;

      const normalizedMessage = {
        ...(updatedMessage as Message),
        attachments: (updatedMessage.attachments as Message['attachments']) || [],
      } as Message;

      // 1. Update chat list
      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        updateChatMessageIfMatches(
          old,
          updatedMessage.chat_id,
          (last) => last?.id === updatedMessage.id,
          (chat) => ({ ...chat, messages: [normalizedMessage] }),
        ),
      );

      // 2. Update specific message in chat messages cache
      queryClient.setQueryData(['messages', updatedMessage.chat_id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Message[]) =>
            page.map((m) => (m.id === normalizedMessage.id ? normalizedMessage : m)),
          ),
        };
      });
    };

    const handleDelete = (payload: RealtimeMessagePayload) => {
      if (!payload.old || typeof payload.old !== 'object' || !('id' in payload.old)) return;
      
      const deletedId = payload.old.id as string;
      const deletedChatId = payload.old.chat_id as string;
      if (!deletedId || !deletedChatId) return;

      // 1. Update chat list
      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        updateChatMessageIfMatches(
          old,
          deletedChatId,
          (last) => last?.id === deletedId,
          (chat) => ({
            ...chat,
            messages: chat.messages?.filter((m) => m.id !== deletedId) || [],
          }),
        ),
      );

      // 2. Remove from messages cache
      queryClient.setQueryData(['messages', deletedChatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Message[]) => page.filter((m) => m.id !== deletedId)),
        };
      });
    };

    realtimeApi.subscribeToAllMessages(channel, (payload: RealtimeMessagePayload) => {
      try {
        switch (payload.eventType) {
          case 'INSERT':
            handleInsert(payload);
            break;
          case 'UPDATE':
            handleUpdate(payload);
            break;
          case 'DELETE':
            handleDelete(payload);
            break;
        }
      } catch (error) {
        handleError(
          new NetworkError(
            'Failed to process realtime message',
            'realtime',
            'REALTIME_MESSAGE_ERROR',
            500,
          ),
          'useChatsRealtime',
        );
      }
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        handleError(
          new NetworkError('Realtime channel error', 'realtime', 'REALTIME_CHANNEL_ERROR', 500),
          'ChatsRealtime',
          { enableToast: false },
        );
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        realtimeApi.unsubscribe(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, queryClient]);
}
