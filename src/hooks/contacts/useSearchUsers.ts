'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { contactsApi } from '@/api';
import type { User } from '@/types';

/**
 * Хук для пошуку користувачів (контактів).
 */
export function useSearchUsers(queryText: string) {
  const { user: currentUser } = useSupabaseAuth();

  return useQuery({
    queryKey: ['contacts', queryText, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      return await contactsApi.searchUsers(currentUser.id, queryText);
    },
    enabled: !!currentUser?.id && (queryText.trim().length === 0 || queryText.trim().length > 1),
  });
}
