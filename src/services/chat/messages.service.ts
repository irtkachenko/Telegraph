import { RATE_LIMITS, withRateLimitFn } from '@/lib/rate-limit-decorator';
import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

export const messagesApi = {
  /**
   * Fetch chat messages with pagination support
   */
  getMessages: withRateLimitFn(
    async (chatId: string, cursor?: string) => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, reply_to:reply_to_id(*), "users":sender_id(id, name, image), updated_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)
        .lt('created_at', cursor || '9999-12-31');

      if (error) {
        const networkError = new NetworkError(
          error.message,
          'messages',
          'MESSAGES_LOAD_ERROR',
          error.status || 500,
        );
        handleError(networkError, 'MessagesApi.getMessages');
        throw networkError;
      }

      const normalizedData = (data as unknown as Message[]).map((msg) => ({
        ...msg,
        attachments: msg.attachments || [],
      }));

      // Return in reverse order for Virtuoso list
      return normalizedData.reverse();
    },
    { ...RATE_LIMITS.MESSAGE_READ, name: 'getMessages' },
  ),

  /**
   * Send a new message
   */
  sendMessage: withRateLimitFn(
    async (
      chatId: string,
      payload: {
        sender_id: string;
        content: string;
        reply_to_id?: string;
        attachments?: Attachment[];
      },
    ) => {
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
        const networkError = new NetworkError(
          error.message,
          'messages',
          'MESSAGE_SEND_ERROR',
          error.status || 500,
        );
        handleError(networkError, 'MessagesApi.sendMessage');
        throw networkError;
      }

      // Best-effort: bump chat updated_at for stable server-side ordering
      try {
        const { error: chatUpdateError } = await supabase
          .from('chats')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', chatId);
        if (chatUpdateError) {
          handleError(
            new NetworkError(
              chatUpdateError.message,
              'chats',
              'CHAT_UPDATE_ERROR',
              chatUpdateError.status || 500,
            ),
            'MessagesApi.sendMessage',
            { enableToast: false },
          );
        }
      } catch {
        // Ignore chat update errors; do not block sending.
      }

      return data as Message;
    },
    { ...RATE_LIMITS.MESSAGE_SEND, name: 'sendMessage' },
  ),

  /**
   * Delete a message
   */
  deleteMessage: withRateLimitFn(
    async (messageId: string, chatId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('chat_id', chatId)
        .select();

      if (error) throw error;
      return data;
    },
    { ...RATE_LIMITS.MESSAGE_READ, name: 'deleteMessage' },
  ),

  /**
   * Edit an existing message
   */
  editMessage: withRateLimitFn(
    async (messageId: string, content: string) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    { ...RATE_LIMITS.MESSAGE_SEND, name: 'editMessage' },
  ),

};
