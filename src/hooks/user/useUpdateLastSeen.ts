'use client';

import { useMutation } from '@tanstack/react-query';
import { userApi } from '@/services';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';

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
      handleError(
        new NetworkError(
          'Помилка оновлення статусу присутності',
          'updateLastSeen',
          'UPDATE_LAST_SEEN_ERROR',
          500,
        ),
        'UpdateLastSeen',
      );
    },
  });
}
