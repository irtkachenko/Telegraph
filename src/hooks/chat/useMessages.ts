'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { messagesApi } from '@/services';
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

  // Debug для пагінації повідомлень
  console.log('📄 Message pagination:', {
    pagesCount: query.data?.pages.length || 0,
    pagesLengths: query.data?.pages.map((p) => p.length) || [],
    totalAfterFlat: allMessages.length,
  });

  // Debug лог для Virtuoso
  const validMessages = useMemo(() => {
    // Фільтруємо некоректні optimistic messages
    const filtered = allMessages.filter((msg) => {
      if (!msg?.id) return false;

      // Якщо це optimistic message, перевіряємо цілісність
      if (msg.is_optimistic) {
        const hasValidContent = msg.content && msg.content.trim().length > 0;
        const hasValidAttachments = msg.attachments && msg.attachments.length > 0;

        // Повідомлення з картинками повинні мати або контент, або коректні attachments
        if (!hasValidContent && !hasValidAttachments) {
          console.warn('🚫 Filtering invalid optimistic message:', msg);
          return false;
        }
      }

      return true;
    });

    const duplicateCheck = new Set(filtered.map((m) => m.id)).size !== filtered.length;

    console.log('🔍 Messages for Virtuoso:', {
      total: allMessages.length,
      valid: filtered.length,
      ids: filtered.slice(0, 5).map((m) => m.id), // Перші 5 ID для економії місця
      hasDuplicates: duplicateCheck,
      firstMessage: filtered[0],
      lastMessage: filtered[filtered.length - 1],
    });

    if (duplicateCheck) {
      console.error('❌ DUPLICATE MESSAGE IDS DETECTED!');
    }

    // Захист від порожніх даних
    if (filtered.length === 0) {
      console.log('📭 No messages to render, returning empty array');
      return [];
    }

    return filtered;
  }, [allMessages]);

  // Автоматичне прочитування нових повідомлень
  useEffect(() => {
    if (allMessages.length === 0 || !user?.id) return;

    // Шукаємо останнє повідомлення НЕ від поточного користувача
    const latestIncomingMessage = [...allMessages].reverse().find((m) => m.sender_id !== user.id);

    if (latestIncomingMessage && lastProcessedId.current !== latestIncomingMessage.id) {
      lastProcessedId.current = latestIncomingMessage.id;
      markAsReadMutation.mutate({ chatId, messageId: latestIncomingMessage.id });
    }
  }, [allMessages, user?.id, chatId, markAsReadMutation]);

  return { ...query, messages: validMessages };
}
