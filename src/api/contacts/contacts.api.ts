import { supabase } from '@/lib/supabase/client';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import type { User } from '@/types';

export const contactsApi = {
  /**
   * Пошук користувачів (контактів)
   */
  searchUsers: async (currentUserId: string, queryText: string) => {
    let query = supabase
      .from('users')
      .select('id, name, email, image, last_seen')
      .neq('id', currentUserId);

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
      console.error('Помилка пошуку користувачів:', error.message);
      throw error;
    }

    return data as User[];
  },
};
