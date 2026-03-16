import { MutationCache, QueryClient } from '@tanstack/react-query';
import { createQueryErrorHandler, getRetryDelay, shouldRetry } from '@/shared/lib/error-handler';

// Create a single, shared QueryClient instance for the entire application
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error: Error & { status?: number }) => {
      // If the error has a 'status' property, it was likely handled by the Supabase fetch interceptor
      // We only want to toast for client-side errors or unexpected issues here.
      if (!error?.status) {
        createQueryErrorHandler('QueryClient')(error);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // Protection against extra requests on authorization error
      retry: (failureCount, error: Error & { status?: number }) => {
        if (error?.status === 401) return false;
        return shouldRetry(error) && failureCount < 3;
      },
      retryDelay: (attemptIndex, error: Error & { status?: number }) => {
        return getRetryDelay(attemptIndex + 1, error);
      },
    },
  },
});
