'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { messagesApi } from '@/services';
import type { Message } from '@/types';
import { useMarkAsRead } from './useMarkAsRead';
import { monitorAPICall } from '@/lib/performance';

/**
 * Hook for fetching and managing chat messages with infinite scroll and auto-read logic.
 */
export function useMessages(chatId: string) {
  const { user } = useSupabaseAuth();
  const { mutate: markAsRead } = useMarkAsRead();
  const lastProcessedId = useRef<string | null>(null);

  const query = useInfiniteQuery<
    Message[],
    Error,
    InfiniteData<Message[]>,
    string[],
    string | undefined
  >({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!chatId) return [];

      return await monitorAPICall('getMessages')(() => 
        messagesApi.getMessages(chatId, pageParam)
      );
    },
    initialPageParam: undefined,
    getPreviousPageParam: (firstPage): string | undefined => {
      if (!firstPage || firstPage.length < 50) return undefined;
      return firstPage[0].created_at;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  // Get all messages in a flattened memoized format
  const allMessages = useMemo(() => query.data?.pages.flat() || [], [query.data?.pages]);

  // Filter and deduplicate messages
  const validMessages = useMemo(() => {
    const filtered = allMessages.filter((msg) => {
      if (!msg?.id) return false;

      // Validate optimistic message integrity
      if (msg.is_optimistic) {
        const hasValidContent = msg.content && msg.content.trim().length > 0;
        const hasValidAttachments = msg.attachments && msg.attachments.length > 0;
        if (!hasValidContent && !hasValidAttachments) return false;
      }

      return true;
    });

    // Deduplication by id (keep the latest entry)
    const seen = new Map<string, Message>();
    for (const msg of filtered) {
      seen.set(msg.id, msg);
    }

    return Array.from(seen.values());
  }, [allMessages]);

  // Auto-mark incoming messages as read
  useEffect(() => {
    if (allMessages.length === 0 || !user?.id) return;

    // Find the latest message NOT sent by current user
    const latestIncomingMessage = allMessages.findLast((m) => m.sender_id !== user.id);

    if (latestIncomingMessage && lastProcessedId.current !== latestIncomingMessage.id) {
      lastProcessedId.current = latestIncomingMessage.id;
      markAsRead({ chatId, messageId: latestIncomingMessage.id });
    }
  }, [allMessages, user?.id, chatId, markAsRead]);

  return { ...query, messages: validMessages };
}
