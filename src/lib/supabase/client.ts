'use client';

import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Повертаємо існуючий клієнт, якщо він уже створений у браузері
  if (typeof window !== 'undefined' && client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing');
  }

  const newClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options) => {
        // Перевіряємо, чи ми хочемо вимкнути тост для цього конкретного запиту
        const skipToast = options?.headers && (options.headers as Record<string, string>)['x-skip-toast'] === 'true';

        const response = await fetch(url, options);

        if (!response.ok && !skipToast) {
          if (response.status === 401) return response;

          try {
            const errorData = await response.clone().json();
            const message =
              errorData?.message || errorData?.error_description || response.statusText;

            toast.error(response.status >= 500 ? 'Помилка сервера' : 'Помилка запиту', {
              description: message,
            });
          } catch {
            toast.error(`Помилка ${response.status}`, { description: response.statusText });
          }
        }

        return response;
      },
    },
  });

  if (typeof window !== 'undefined') client = newClient;
  return newClient;
}

export const supabase = createClient();
