'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { chatsApi } from '@/api';
import type { FullChat } from '@/types';

/**
 * Хук для отримання списку чатів поточного користувача.
 * Реалізовано як сінглтон через React Query кеш.
 */
export function useChats() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      if (!user) return [];

      return await chatsApi.getChats(user.id);
    },
    enabled: !!user,
  });
}
