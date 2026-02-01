'use client';

import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Only create singleton on client-side to prevent SSR security risks
  if (typeof window !== 'undefined' && client) {
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const newClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options) => {
        const response = await fetch(url, options);

        // Only handle errors, let successful responses pass through naturally
        if (!response.ok) {
          // Silent handling for 401 Unauthorized (Auth listener handles redirects)
          if (response.status === 401) {
            return response;
          }

          // Robust error parsing
          let errorMessage = response.statusText;
          try {
            const text = await response.clone().text();
            if (text) {
              const errorBody = JSON.parse(text);
              errorMessage =
                errorBody?.message ||
                errorBody?.error_description ||
                errorBody?.msg ||
                errorMessage;
            }
          } catch {
            // If body parsing fails, stick to statusText or default
          }

          // Trigger Toast for non-401 errors
          if (response.status >= 500) {
            toast.error(`Server Error (${response.status})`, {
              description: 'Something went wrong on our end. Please try again later.',
            });
          } else if (response.status >= 400) {
            toast.error('Request Failed', {
              description: errorMessage || 'Unable to complete this action.',
            });
          }
        }

        // Return response as-is for both success and error cases
        return response;
      },
    },
  });

  // Only cache client on client-side
  if (typeof window !== 'undefined') {
    client = newClient;
  }

  return newClient;
}

// Export the client directly for compatibility, but ensure it's SSR-safe
export const supabase = createClient();
