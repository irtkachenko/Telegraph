'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, NetworkError } from '@/shared/lib/errors';
import type { FullChat } from '@/types';
import { mapChatsInfinite } from './chats-cache';

// Validation schema
const markAsReadSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID'),
  messageId: z.string().uuid('Invalid message ID'),
});

export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;

/**
 * Хук для відмітки повідомлень як прочитаних з rate limiting.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ chatId, messageId }: MarkAsReadInput) => {
      if (!user?.id) throw new AuthError('User not authenticated', 'MARK_READ_AUTH_REQUIRED', 401);

      // Validate input
      const validated = markAsReadSchema.parse({ chatId, messageId });

      // Use Supabase client directly instead of server action
      const { supabase } = await import('@/lib/supabase/client');

      const { error: updateError } = await supabase.rpc('rpc_mark_chat_as_read', {
        p_chat_id: validated.chatId,
        p_message_id: validated.messageId,
      });

      if (updateError) {
        throw new NetworkError(
          updateError.message || 'Failed to mark as read',
          'markAsRead',
          'MARK_READ_ERROR',
          500,
        );
      }

      return { success: true, chatId: validated.chatId, messageId: validated.messageId };
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

    onError: (error, _variables, context) => {
      handleError(error, 'useMarkAsRead', { enableToast: true });

      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
  });
}
