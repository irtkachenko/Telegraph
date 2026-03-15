'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { messagesApi } from '@/services';
import type { Message } from '@/types';
import { useMarkAsRead } from './useMarkAsRead';
import { useViewportDetection } from '@/hooks/ui/useViewportDetection';
import { useMessageViewTimer } from '@/hooks/ui/useMessageViewTimer';
import { useChatState } from '@/hooks/ui/useChatState';

/**
 * Hook for fetching and managing chat messages with infinite scroll and auto-read logic.
 */
export function useMessages(chatId: string, isAtBottom: boolean) {
  const { user } = useSupabaseAuth();
  const { mutate: markAsRead } = useMarkAsRead();
  const readTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastMarkedRef = useRef<string | null>(null);

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

      return await messagesApi.getMessages(chatId, pageParam);
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

  // Initialize new read detection hooks
  const { isMessageVisible } = useViewportDetection();
  const { startViewing, stopViewing, isViewedLongEnough } = useMessageViewTimer();
  const { isChatOpen, isWindowFocused, isDocumentVisible } = useChatState();

  // Advanced auto-read logic with full criteria checking
  useEffect(() => {
    if (validMessages.length === 0 || !user?.id) return;

    // If the chat isn't in an active reading state, clear pending timers
    const chatIsActive = isChatOpen && isWindowFocused && isDocumentVisible && isAtBottom;
    if (!chatIsActive) {
      readTimersRef.current.forEach((timer, messageId) => {
        clearTimeout(timer);
        stopViewing(messageId);
      });
      readTimersRef.current.clear();
      return;
    }

    // Find visible incoming messages (only those from other users)
    const visibleIncoming = validMessages.filter(
      (m) => m.sender_id !== user.id && isMessageVisible(m.id),
    );

    if (visibleIncoming.length === 0) return;

    // Target the newest visible incoming message
    const targetMessage = visibleIncoming[visibleIncoming.length - 1];

    if (!targetMessage || lastMarkedRef.current === targetMessage.id) return;

    // Cleanup timers for messages that are no longer visible or not the current target
    const visibleIds = new Set(visibleIncoming.map((m) => m.id));
    readTimersRef.current.forEach((timer, messageId) => {
      if (!visibleIds.has(messageId) || messageId !== targetMessage.id) {
        clearTimeout(timer);
        readTimersRef.current.delete(messageId);
        stopViewing(messageId);
      }
    });

    // Start viewing + schedule read only once
    if (!readTimersRef.current.has(targetMessage.id)) {
      startViewing(targetMessage.id);

      const timer = setTimeout(() => {
        const stillEligible =
          isMessageVisible(targetMessage.id) &&
          isAtBottom &&
          isChatOpen &&
          isWindowFocused &&
          isDocumentVisible;

        if (stillEligible && isViewedLongEnough(targetMessage.id, 500)) {
          markAsRead({ chatId, messageId: targetMessage.id });
          lastMarkedRef.current = targetMessage.id;
        }

        stopViewing(targetMessage.id);
        readTimersRef.current.delete(targetMessage.id);
      }, 500);

      readTimersRef.current.set(targetMessage.id, timer);
    }

  }, [
    validMessages,
    user?.id,
    chatId,
    markAsRead,
    isAtBottom,
    isWindowFocused,
    isDocumentVisible,
    isMessageVisible,
    isViewedLongEnough,
    startViewing,
    stopViewing,
    isChatOpen,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      readTimersRef.current.forEach((timer, messageId) => {
        clearTimeout(timer);
        stopViewing(messageId);
      });
      readTimersRef.current.clear();
    };
  }, [stopViewing]);

  return { ...query, messages: validMessages };
}
