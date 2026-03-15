'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { messagesApi } from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

/**
 * Hook for sending messages with optimistic updates.
 */
export function useSendMessage(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      reply_to_id,
      attachments,
      _tempId,
    }: {
      content: string;
      reply_to_id?: string;
      attachments?: Attachment[];
      _tempId?: string;
    }) => {
      if (!user)
        throw new AuthError('You are not authenticated', 'SEND_MESSAGE_AUTH_REQUIRED', 401);

      return await messagesApi.sendMessage(chatId, {
        sender_id: user.id,
        content,
        reply_to_id,
        attachments,
      });
    },

    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Generate a unique tempId for matching later
      const tempId =
        newMessage._tempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Find parent message for reply context
      const allMessages = (previousData as InfiniteData<Message[]>)?.pages?.flat() || [];
      const parentMessage = newMessage.reply_to_id
        ? allMessages.find((m) => m.id === newMessage.reply_to_id)
        : null;

      const optimisticMessage: Message = {
        id: tempId,
        content: newMessage.content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(),
        updated_at: null,
        reply_to_id: newMessage.reply_to_id || null,
        reply_to: parentMessage,
        attachments: newMessage.attachments || [],
        is_optimistic: true,
      } as Message;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        const newPages = [...old.pages];
        newPages[newPages.length - 1] = [...newPages[newPages.length - 1], optimisticMessage];
        return { ...old, pages: newPages };
      });

      return { previousData, tempId };
    },

    onError: (error: Error & { status?: number }, _variables, context) => {
      // Restore previous cache state on error
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }

      handleError(
        new AuthError(error.message, 'SEND_MESSAGE_ERROR', error.status || 500),
        'SendMessage',
      );
    },

    onSuccess: (savedMessage, _variables, context) => {
      const tempId = context?.tempId;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((msg) => (msg.id === tempId ? savedMessage : msg)),
          ),
        };
      });
    },
  });
}
