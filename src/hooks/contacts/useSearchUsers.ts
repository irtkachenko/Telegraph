'use client';

import { useQuery } from '@tanstack/react-query';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { supabase } from '@/lib/supabase/client';
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

      let query = supabase
        .from('user')
        .select('id, name, email, image, last_seen')
        .neq('id', currentUser.id);

      if (queryText.trim().length > 1) {
        const sanitized = sanitizeSearchQuery(queryText);
        query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`).limit(10);
      } else if (!queryText.trim()) {
        query = query.order('last_seen', { ascending: false, nullsFirst: false }).limit(20);
      } else {
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error('Помилка useSearchUsers:', error.message);
        throw error;
      }

      return data as User[];
    },
    enabled: !!currentUser?.id && (queryText.trim().length === 0 || queryText.trim().length > 1),
  });
}
