import { supabase } from '@/lib/supabase/client';

export const userApi = {
  /**
   * Update "last seen" status
   */
  updateLastSeen: async () => {
    const { error } = await supabase.rpc('update_last_seen');
    if (error) throw error;
  },
};
