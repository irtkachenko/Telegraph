'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isRateLimitError, RATE_LIMITS, withRateLimitFn } from '@/lib/rate-limit-decorator';
import { chatsApi } from '@/services/chat/chats.service';
import { handleError } from '@/shared/lib/error-handler';

// Validation schema
const createChatSchema = z.object({
  recipient_id: z.string().uuid('Invalid recipient ID'),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;

/**
 * Hook for creating or getting existing chat with rate limiting
 */
export function useGetOrCreateChat() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: withRateLimitFn(
      async (recipientId: string) => {
        if (!user?.id) {
          throw new Error('Unauthorized: User not authenticated');
        }

        // Validate input
        const validated = createChatSchema.parse({ recipient_id: recipientId });

        // Prevent self-chat
        if (user.id === validated.recipient_id) {
          throw new Error('Cannot create chat with yourself');
        }

        // Try to find existing chat first
        const existingChats = await chatsApi.getChats(user.id, 1, 50);
        const existingChat = existingChats.find(
          (chat) =>
            (chat.user_id === user.id && chat.recipient_id === validated.recipient_id) ||
            (chat.user_id === validated.recipient_id && chat.recipient_id === user.id),
        );

        if (existingChat) {
          return existingChat;
        }

        // Create new chat
        return await chatsApi.createChat({
          user_id: user.id,
          recipient_id: validated.recipient_id,
        });
      },
      { ...RATE_LIMITS.CHAT_CREATE, name: 'getOrCreateChat' },
    ),

    onSuccess: (chat) => {
      // Invalidate and refetch chats list
      queryClient.invalidateQueries({ queryKey: ['chats'] });

      // Navigate to the chat
      router.push(`/chat/${chat.id}`);
    },

    onError: (error) => {
      if (isRateLimitError(error)) {
        // Handle rate limit error specifically
        handleError(
          new Error(
            `Rate limit exceeded. Please wait ${error.retryAfter} seconds before trying again.`,
          ),
          'useGetOrCreateChat',
          { enableToast: true },
        );
      } else {
        // Handle other errors
        handleError(error, 'useGetOrCreateChat', { enableToast: true });
      }
    },
  });
}
