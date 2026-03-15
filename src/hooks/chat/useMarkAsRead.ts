'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isRateLimitError, RATE_LIMITS, withRateLimitFn } from '@/lib/rate-limit-decorator';
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
    mutationFn: withRateLimitFn(
      async ({ chatId, messageId }: MarkAsReadInput) => {
        if (!user?.id)
          throw new AuthError('User not authenticated', 'MARK_READ_AUTH_REQUIRED', 401);

        // Validate input
        const validated = markAsReadSchema.parse({ chatId, messageId });

        // Use Supabase client directly instead of server action
        const { supabase } = await import('@/lib/supabase/client');

        // First, get the chat to determine which field to update
        const { data: chat, error: chatError } = await supabase
          .from('chats')
          .select('user_id, recipient_id')
          .eq('id', validated.chatId)
          .single();

        if (chatError || !chat) {
          throw new NetworkError('Chat not found', 'markAsRead', 'CHAT_NOT_FOUND', 404);
        }

        // Determine which read field to update based on who the user is
        const updateData: { user_last_read_id?: string; recipient_last_read_id?: string } = {};

        if (chat.user_id === user.id) {
          updateData.user_last_read_id = validated.messageId;
        } else if (chat.recipient_id === user.id) {
          updateData.recipient_last_read_id = validated.messageId;
        } else {
          throw new AuthError('Not a participant in this chat', 'NOT_PARTICIPANT');
        }

        // Update the chat with the new read status
        const { error: updateError } = await supabase
          .from('chats')
          .update(updateData)
          .eq('id', validated.chatId);

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
      { ...RATE_LIMITS.MESSAGE_READ, name: 'markAsRead' },
    ),

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
      if (isRateLimitError(error)) {
        handleError(
          new Error(
            `Rate limit exceeded. Please wait ${error.retryAfter} seconds before trying again.`,
          ),
          'useMarkAsRead',
          { enableToast: true },
        );
      } else {
        handleError(error, 'useMarkAsRead', { enableToast: true });
      }

      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
  });
}
