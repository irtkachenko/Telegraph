import type {
  RealtimeChannel,
  RealtimeChannelSendResponse,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Chat, Message, User } from '@/types';

export type RealtimeChatPayload = RealtimePostgresChangesPayload<Chat>;
export type RealtimeMessagePayload = RealtimePostgresChangesPayload<Message>;
export type RealtimeUserPayload = RealtimePostgresChangesPayload<User>;

export const realtimeApi = {
  /**
   * Create a global channel for message updates
   */
  createMessagesChannel: (): RealtimeChannel => {
    return supabase.channel('messages:global');
  },

  /**
   * Create a specific chat channel
   */
  createChatChannel: (chatId: string): RealtimeChannel => {
    return supabase.channel(`chat:${chatId}`);
  },

  /**
   * Subscribe to messages in a specific channel
   */
  subscribeToMessages: (
    channel: RealtimeChannel,
    callback: (payload: RealtimeMessagePayload) => void,
  ) => {
    return channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${channel.topic?.split(':')[1]}`,
      },
      callback,
    );
  },

  /**
   * Global subscription to all messages (RLS filters rows automatically)
   */
  subscribeToAllMessages: (
    channel: RealtimeChannel,
    callback: (payload: RealtimeMessagePayload) => void,
  ) => {
    return channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
      },
      callback,
    );
  },

  /**
   * Subscribe to typing indicators via broadcast
   */
  subscribeToTyping: (channel: RealtimeChannel, callback: (payload: { payload: any }) => void) => {
    return channel.on('broadcast', { event: 'typing' }, callback);
  },

  /**
   * Subscribe to chat list updates
   */
  subscribeToChats: (
    channel: RealtimeChannel,
    callback: (payload: RealtimeChatPayload) => void,
  ) => {
    return channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chats',
      },
      callback,
    );
  },

  /**
   * Subscribe to profile updates for a specific user
   */
  subscribeToUsers: (
    channel: RealtimeChannel,
    userId: string,
    callback: (payload: RealtimeUserPayload) => void,
  ) => {
    return channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      },
      callback,
    );
  },

  /**
   * Broadcast a custom event to a channel
   */
  broadcast: async (
    channel: RealtimeChannel,
    event: string,
    payload: Record<string, any>,
  ): Promise<RealtimeChannelSendResponse> => {
    return channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  },

  /**
   * Track user presence state
   */
  trackPresence: (channel: RealtimeChannel, state: Record<string, any>) => {
    return channel.track(state);
  },

  /**
   * Activate channel subscription
   */
  subscribe: (channel: RealtimeChannel) => {
    return channel.subscribe();
  },

  /**
   * Remove and unsubscribe from a channel
   */
  unsubscribe: (channel: RealtimeChannel) => {
    return supabase.removeChannel(channel);
  },

  /**
   * Create a dedicated presence channel
   */
  createPresenceChannel: (): RealtimeChannel => {
    return supabase.channel('presence');
  },

  /**
   * Create a dedicated users channel
   */
  createUsersChannel: (): RealtimeChannel => {
    return supabase.channel('users');
  },
};
