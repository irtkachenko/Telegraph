import { supabase } from '@/lib/supabase/client';
import type { Message, Attachment } from '@/types';

export const messagesApi = {
  /**
   * Отримання повідомлень чату з підтримкою пагінації
   */
  getMessages: async (chatId: string, cursor?: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, reply_to:reply_to_id(*), "users":sender_id(id, name, image), updated_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(50)
      .lt('created_at', cursor || '9999-12-31');

    if (error) {
      console.error('Помилка завантаження повідомлень:', error.message);
      throw error;
    }

    const normalizedData = (data as unknown as Message[]).map((msg) => ({
      ...msg,
      attachments: msg.attachments || [],
    }));

    // Повертаємо в правильному порядку для Virtuoso
    return normalizedData.reverse();
  },

  /**
   * Відправка повідомлення
   */
  sendMessage: async (chatId: string, payload: {
    sender_id: string;
    content: string;
    reply_to_id?: string;
    attachments?: Attachment[];
  }) => {
    const { error, data } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: payload.sender_id,
        content: payload.content,
        reply_to_id: payload.reply_to_id || null,
        attachments: payload.attachments || [],
      })
      .select('*, reply_to:reply_to_id(*)')
      .single();

    if (error) {
      console.error('Помилка відправки:', error.message);
      throw error;
    }
    return data as Message;
  },

  /**
   * Видалення повідомлення
   */
  deleteMessage: async (messageId: string, chatId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('chat_id', chatId)
      .select();

    if (error) throw error;
    return data;
  },

  /**
   * Редагування повідомлення
   */
  editMessage: async (messageId: string, content: string) => {
    const { data, error } = await supabase
      .from('messages')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data as Message;
  },

  /**
   * Позначення повідомлення як прочитаного
   */
  markAsRead: async (chatId: string, messageId: string, userId: string) => {
    const { error } = await supabase
      .from('message_reads')
      .insert({
        chat_id: chatId,
        message_id: messageId,
        user_id: userId,
      });

    if (error) throw error;
  },
};
