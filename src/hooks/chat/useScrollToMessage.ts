'use client';

import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import { toast } from 'sonner';
import type { Message } from '@/types';

/**
 * Хук для прокрутки до конкретного повідомлення в Virtuoso списку.
 */
export function useScrollToMessage(
  virtuosoRef: React.RefObject<VirtuosoHandle | null>,
  messages: Message[],
  fetchPreviousPage: () => void,
  hasPreviousPage: boolean,
  chatId: string,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pendingScrollTarget && !isFetchingHistory) {
      const index = messages.findIndex((m) => m.id === pendingScrollTarget);

      if (index !== -1) {
        const timeout = setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index,
            behavior: 'smooth',
            align: 'center',
          });
          setHighlightedId(pendingScrollTarget);
          setTimeout(() => setHighlightedId(null), 3000);
          setPendingScrollTarget(null);
        }, 100);
        return () => clearTimeout(timeout);
      }
    }
  }, [messages, pendingScrollTarget, isFetchingHistory, virtuosoRef]);

  const cancelPendingScroll = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPendingScrollTarget(null);
    setIsFetchingHistory(false);
  };

  const scrollToMessage = async (
    messageId: string,
    options?: { align?: 'start' | 'center' | 'end'; behavior?: 'smooth' | 'auto' },
  ) => {
    cancelPendingScroll();

    const tryScroll = (currentMessages: Message[]): boolean => {
      const index = currentMessages.findIndex((m) => m.id === messageId);
      if (index !== -1) {
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index,
            behavior: options?.behavior || 'smooth',
            align: options?.align || 'center',
          });
          setHighlightedId(messageId);
          setTimeout(() => setHighlightedId(null), 3000);
        }, 100);
        return true;
      }
      return false;
    };

    if (tryScroll(messages)) return;

    if (!hasPreviousPage) {
      toast.error('Повідомлення не знайдено в історії');
      return;
    }

    abortControllerRef.current = new AbortController();
    toast.info('Завантаження історії...');
    setPendingScrollTarget(messageId);
    setIsFetchingHistory(true);

    const fetchNext = async (depth = 0) => {
      if (depth > 8 || abortControllerRef.current?.signal.aborted) {
        if (!abortControllerRef.current?.signal.aborted) {
          toast.error('Повідомлення не знайдено');
          setPendingScrollTarget(null);
        }
        setIsFetchingHistory(false);
        return;
      }

      await fetchPreviousPage();
      await new Promise((r) => setTimeout(r, 200));

      const freshData = queryClient.getQueryData(['messages', chatId]) as InfiniteData<Message> | undefined;
      const freshMessages = freshData?.pages?.flat() || [];

      if (tryScroll(freshMessages)) {
        setPendingScrollTarget(null);
        setIsFetchingHistory(false);
        return;
      }

      await fetchNext(depth + 1);
    };

    fetchNext().catch(() => setIsFetchingHistory(false));
  };

  return { scrollToMessage, highlightedId, cancelPendingScroll };
}
