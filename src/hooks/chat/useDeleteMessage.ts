'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import type { Message } from '@/types';

/**
 * Хук для видалення повідомлення.
 */
export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('chat_id', chatId)
        .select();

      if (error) throw error;
      return data;
    },
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((msg) => msg.id !== messageId)),
        };
      });

      return { previousData };
    },
    onError: (error: Error, _messageId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error('Помилка видалення', { description: error.message });
    },
    onSuccess: () => {
      toast.success('Повідомлення видалено');
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });
}
