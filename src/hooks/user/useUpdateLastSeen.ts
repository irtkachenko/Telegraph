'use client';

import { useMutation } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { userApi } from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';

/**
 * Hook for updating "last seen" status.
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
          'Presence status update error',
          'updateLastSeen',
          'UPDATE_LAST_SEEN_ERROR',
          500,
        ),
        'UpdateLastSeen',
      );
    },
  });
}
