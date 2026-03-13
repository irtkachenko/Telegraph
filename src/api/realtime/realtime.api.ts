import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js';

export const realtimeApi = {
  /**
   * Створення каналу для чату
   */
  createChatChannel: (chatId: string): RealtimeChannel => {
    return supabase.channel(`chat:${chatId}`);
  },

  /**
   * Підписка на повідомлення чату
   */
  subscribeToMessages: (channel: RealtimeChannel, callback: (payload: any) => void) => {
    return channel.on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'messages', 
        filter: `chat_id=eq.${channel.topic?.split(':')[1]}`
      }, 
      callback
    );
  },

  /**
   * Підписка на статус набирання тексту
   */
  subscribeToTyping: (channel: RealtimeChannel, callback: (payload: any) => void) => {
    return channel.on('broadcast', { event: 'typing' }, callback);
  },

  /**
   * Підписка на статус присутності
   */
  subscribeToPresence: (channel: RealtimeChannel, callback: (payload: any) => void) => {
    return channel.on('presence', { event: 'sync' }, callback)
      .on('presence', { event: 'join' }, callback)
      .on('presence', { event: 'leave' }, callback);
  },

  /**
   * Підписка на зміни в чатах
   */
  subscribeToChats: (channel: RealtimeChannel, callback: (payload: any) => void) => {
    return channel.on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'chats' 
      }, 
      callback
    );
  },

  /**
   * Підписка на зміни в користувачах
   */
  subscribeToUsers: (channel: RealtimeChannel, callback: (payload: any) => void) => {
    return channel.on('postgres_changes', 
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'users',
        filter: 'id=eq.current_user' 
      }, 
      callback
    );
  },

  /**
   * Відправка broadcast повідомлення
   */
  broadcast: (channel: RealtimeChannel, event: string, payload: any): RealtimeChannelSendResponse => {
    return channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  },

  /**
   * Трекинг присутності користувача
   */
  trackPresence: (channel: RealtimeChannel, state: Record<string, any>) => {
    return channel.track(state);
  },

  /**
   * Підключення каналу
   */
  subscribe: (channel: RealtimeChannel) => {
    return channel.subscribe();
  },

  /**
   * Відключення каналу
   */
  unsubscribe: (channel: RealtimeChannel) => {
    return supabase.removeChannel(channel);
  },

  /**
   * Створення глобального каналу для присутності
   */
  createPresenceChannel: (): RealtimeChannel => {
    return supabase.channel('presence');
  },

  /**
   * Створення глобального каналу для користувачів
   */
  createUsersChannel: (): RealtimeChannel => {
    return supabase.channel('users');
  },
};
