'use client';

import { useMutation } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { userApi } from '@/api';

/**
 * Хук для оновлення статусу "востаннє в мережі".
 */
export function useUpdateLastSeen() {
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      return await userApi.updateLastSeen();
    },
    onError: (error) => {
      console.error('Помилка оновлення статусу присутності:', error);
    },
  });
}
