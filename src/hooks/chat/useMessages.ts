'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { messagesApi } from '@/services';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import type { Message } from '@/types';
import { useMarkAsRead } from './useMarkAsRead';

/**
 * Хук для отримання повідомлень чату з підтримкою нескінченної пагінації.
 */
export function useMessages(chatId: string) {
  const { user } = useSupabaseAuth();
  const markAsReadMutation = useMarkAsRead();
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

  // Автоматичне прочитування нових повідомлень
  useEffect(() => {
    const allMessages = query.data?.pages.flat() || [];
    if (allMessages.length === 0 || !user?.id) return;

    const latestMessage = allMessages.reduce((prev, current) => {
      return new Date(current.created_at) > new Date(prev.created_at) ? current : prev;
    });

    const msgId = latestMessage.id;
    const msgSenderId = latestMessage.sender_id;

    if (msgId && msgSenderId !== user.id && lastProcessedId.current !== msgId) {
      lastProcessedId.current = msgId;
      markAsReadMutation.mutate({ chatId, messageId: msgId });
    }
  }, [query.data?.pages, user?.id, chatId, markAsReadMutation]);

  return query;
}
