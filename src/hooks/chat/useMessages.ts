'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
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

  // Отримуємо всі повідомлення в мемоїзованому вигляді
  const allMessages = useMemo(() => query.data?.pages.flat() || [], [query.data?.pages]);

  // Автоматичне прочитування нових повідомлень
  useEffect(() => {
    if (allMessages.length === 0 || !user?.id) return;

    // Шукаємо останнє повідомлення НЕ від поточного користувача
    const latestIncomingMessage = [...allMessages]
      .reverse()
      .find((m) => m.sender_id !== user.id);

    if (
      latestIncomingMessage &&
      lastProcessedId.current !== latestIncomingMessage.id
    ) {
      lastProcessedId.current = latestIncomingMessage.id;
      markAsReadMutation.mutate({ chatId, messageId: latestIncomingMessage.id });
    }
  }, [allMessages, user?.id, chatId, markAsReadMutation]);

  return { ...query, messages: allMessages };
}
