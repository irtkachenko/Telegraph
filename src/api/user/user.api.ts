import { supabase } from '@/lib/supabase/client';

export const userApi = {
  /**
   * Оновлення статусу "востаннє в мережі"
   */
  updateLastSeen: async () => {
    const { error } = await supabase.rpc('update_last_seen');
    if (error) throw error;
  },
};
