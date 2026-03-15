import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { FullChat } from '@/types';

export const chatsApi = {
  /**
   * РћС‚СЂРёРјР°РЅРЅСЏ СЃРїРёСЃРєСѓ С‡Р°С‚С–РІ РїРѕС‚РѕС‡РЅРѕРіРѕ РєРѕСЂРёСЃС‚СѓРІР°С‡Р° Р· РїР°РіС–РЅР°С†С–С”СЋ
   */
  getChats: async (userId: string, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('chats')
      .select(`
        *,
        user:user_id(*),      
        recipient:recipient_id(*),
        messages!messages_chat_id_chats_id_fk(
          id, 
          content, 
          created_at, 
          sender_id, 
          chat_id, 
          attachments
        )
      `)
      .or(`user_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { foreignTable: 'messages', ascending: false })
      .limit(1, { foreignTable: 'messages' })
      .range(offset, offset + limit - 1);

    if (error) {
      const networkError = new NetworkError(
        error.message,
        'chats',
        'CHATS_LOAD_ERROR',
        error.status || 500,
      );
      handleError(networkError, 'ChatsApi.getChats');
      throw networkError;
    }

    return data as FullChat[];
  },

  /**
   * РћС‚СЂРёРјР°РЅРЅСЏ С‡Р°С‚С–РІ РґР»СЏ infinite query
   */
  getChatsInfinite: async (userId: string, pageParam = 1, limit = 20) => {
    return chatsApi.getChats(userId, pageParam, limit);
  },

  /**
   * РЎС‚РІРѕСЂРµРЅРЅСЏ РЅРѕРІРѕРіРѕ С‡Р°С‚Сѓ
   */
  createChat: async (payload: { user_id: string; recipient_id: string }) => {
    const { data, error } = await supabase
      .from('chats')
      .insert(payload)
      .select(`
        *,
        user:user_id(*),      
        recipient:recipient_id(*)
      `)
      .single();

    if (error) throw error;
    return data as FullChat;
  },

  /**
   * Р’РёРґР°Р»РµРЅРЅСЏ С‡Р°С‚Сѓ
   */
  deleteChat: async (chatId: string) => {
    const { error } = await supabase.from('chats').delete().eq('id', chatId);
    if (error) throw error;
    return chatId;
  },

  /**
   * РћРЅРѕРІР»РµРЅРЅСЏ С‡Р°С‚Сѓ
   */
  updateChat: async (
    chatId: string,
    payload: Partial<{
      title: string;
      updated_at: string;
    }>,
  ) => {
    const { data, error } = await supabase
      .from('chats')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', chatId)
      .select()
      .single();

    if (error) throw error;
    return data as FullChat;
  },
};

