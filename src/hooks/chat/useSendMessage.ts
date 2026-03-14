'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { messagesApi } from '@/services';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

/**
 * Хук для відправки повідомлень з оптимістичним оновленням.
 */
export function useSendMessage(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      content,
      reply_to_id,
      attachments,
    }: {
      content: string;
      reply_to_id?: string;
      attachments?: Attachment[];
    }) => {
      if (!user) throw new AuthError('Ви не авторизовані', 'SEND_MESSAGE_AUTH_REQUIRED', 401);

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

      // Знаходимо батьківське повідомлення для реплаю
      const allMessages = (previousData as InfiniteData<Message[]>)?.pages?.flat() || [];
      const parentMessage = newMessage.reply_to_id
        ? allMessages.find((m) => m.id === newMessage.reply_to_id)
        : null;

      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        content: newMessage.content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(),
        updated_at: null,
        reply_to_id: newMessage.reply_to_id || null,
        reply_to: parentMessage,
        attachments: (newMessage.attachments || []).map((att) => ({ ...att, uploading: true })),
        is_optimistic: true,
      } as Message;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        const newPages = [...old.pages];
        newPages[newPages.length - 1] = [...newPages[newPages.length - 1], optimisticMessage];
        return { ...old, pages: newPages };
      });

      return { previousData };
    },

    onError: (error: Error & { status?: number }) => {
      handleError(
        new AuthError(error.message, 'SEND_MESSAGE_ERROR', error.status || 500),
        'SendMessage',
      );
    },

    onSuccess: (savedMessage) => {
      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((msg) =>
              msg.id.toString().startsWith('temp-') && msg.content === savedMessage.content
                ? savedMessage
                : msg,
            ),
          ),
        };
      });
    },
  });
}
