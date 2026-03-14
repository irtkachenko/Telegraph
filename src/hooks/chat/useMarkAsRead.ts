'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { AuthError, NetworkError } from '@/shared/lib/errors';
import type { FullChat } from '@/types';
import { mapChatsInfinite } from './chats-cache';

/**
 * Хук для відмітки повідомлень як прочитаних.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: string; messageId: string }) => {
      if (!user?.id) throw new AuthError('User not authenticated', 'MARK_READ_AUTH_REQUIRED', 401);

      const { markAsReadAction } = await import('@/actions/chat-actions');
      const result = await markAsReadAction(chatId, messageId);

      if (!result.success) {
        throw new NetworkError(
          result.error || 'Failed to mark as read',
          'markAsRead',
          'MARK_READ_ERROR',
          500,
        );
      }

      return result;
    },
    onMutate: async ({ chatId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      const previousChats = queryClient.getQueryData(['chats']);

      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        mapChatsInfinite(old, (chat) => {
          if (chat.id !== chatId) return chat;
          const isCurrentUser = chat.user_id === user?.id;
          const readField = isCurrentUser ? 'user_last_read' : 'recipient_last_read';

          return {
            ...chat,
            [readField]: {
              id: messageId,
              created_at: new Date().toISOString(),
            },
          };
        }),
      );

      return { previousChats };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
  });
}
