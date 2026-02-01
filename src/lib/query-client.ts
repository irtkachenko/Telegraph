import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Create a single, shared QueryClient instance for the entire application
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error: Error & { status?: number }) => {
      // If the error has a 'status' property, it was likely handled by the Supabase fetch interceptor
      // We only want to toast for client-side errors or unexpected issues here.
      if (!error?.status) {
        toast.error('Error', {
          description: error.message || 'An unexpected error occurred.',
        });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      // Захист від зайвих запитів при помилці авторизації
      retry: (failureCount, error: Error & { status?: number }) => {
        if (error?.status === 401) return false;
        return failureCount < 3;
      },
    },
  },
});
