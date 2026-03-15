'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase/client';
import { AuthError, NetworkError } from '@/shared/lib/errors';
import type { FullChat, User } from '@/types';

/**
 * Hook for fetching detailed information about a specific chat.
 */
export function useChatDetails(chatId: string) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      if (!user) throw new AuthError('Unauthorized', 'CHAT_AUTH_REQUIRED', 401);

      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          user:user_id(*),
          recipient:recipient_id(*)
        `)
        .eq('id', chatId)
        .single();

      if (error)
        throw new NetworkError(error.message, 'chats', 'CHAT_FETCH_ERROR', error.status || 500);

      const normalizedData = data as FullChat;

      // Нормалізуємо учасників для зручності UI
      const participants = [normalizedData.user, normalizedData.recipient].filter(
        Boolean,
      ) as User[];

      return { ...normalizedData, participants } as FullChat;
    },
    enabled: !!chatId && !!user,
  });
}
