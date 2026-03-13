'use client';

import type { User } from '@supabase/supabase-js';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePresenceStore, usePresenceSubscription } from '@/store/usePresenceStore';
import { useUIStore } from '@/store/useChatStore';
import type { FullChat, Message } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  errors?: string[];
}

// Helper function to validate payload structure
function validatePayload<T>(
  payload: RealtimePayload<T>,
  requiredFields: (keyof T)[],
): payload is RealtimePayload<T> {
  if (!payload || typeof payload !== 'object') {
    console.error('Invalid payload structure:', payload);
    return false;
  }

  if (payload.errors && payload.errors.length > 0) {
    console.error('Payload contains errors:', payload.errors);
    return false;
  }

  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    if (!payload.new || typeof payload.new !== 'object') {
      console.error('Invalid payload.new for event type:', payload.eventType);
      return false;
    }

    for (const field of requiredFields) {
      if (!(field in payload.new)) {
        console.error(`Missing required field '${String(field)}' in payload.new`);
        return false;
      }
    }
  }

  if (payload.eventType === 'DELETE') {
    if (!payload.old || typeof payload.old !== 'object') {
      console.error('Invalid payload.old for DELETE event');
      return false;
    }
  }

  return true;
}

// Helper function to check if message already exists in cache
function messageExistsInCache(
  messageId: string,
  content: string,
  senderId: string,
  createdAt: string,
  allMessages: Message[],
): boolean {
  // First check by ID (most reliable)
  const existingById = allMessages.find((m) => m.id === messageId);
  if (existingById) return true;

  // Fallback: check by content, sender, and timestamp (within 2 seconds)
  const existingByContent = allMessages.find(
    (m) =>
      m.content === content &&
      m.sender_id === senderId &&
      Math.abs(new Date(m.created_at).getTime() - new Date(createdAt).getTime()) < 2000,
  );

  return !!existingByContent;
}

// Helper function to get active chat ID from Zustand store
function getActiveChatId(queryClient: ReturnType<typeof useQueryClient>): string | null {
  // Get active chat from Zustand store
  const activeChatId = useUIStore.getState().activeChatId;
  if (activeChatId) {
    return activeChatId;
  }

  // Fallback: check if there's a recently accessed messages query
  const queryCache = queryClient.getQueryCache().getAll();
  const messagesQueries = queryCache.filter(
    (query) => query.queryKey[0] === 'messages' && query.state.status === 'success',
  );

  if (messagesQueries.length > 0) {
    // Return the most recently accessed messages query
    return messagesQueries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]
      .queryKey[1] as string;
  }

  return null;
}

interface MessagePayload {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  [key: string]: unknown;
}

interface ChatPayload {
  id: string;
  user_id: string;
  recipient_id: string;
  user_last_read_id?: string | null;
  recipient_last_read_id?: string | null;
  user_last_read_at?: string | null;
  recipient_last_read_at?: string | null;
  created_at: string;
  [key: string]: unknown;
}

// Throttle utility for typing events
function createThrottle(func: (isTyping: boolean) => void, delay: number): (isTyping: boolean) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastExecTime = 0;

  return (isTyping: boolean) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(isTyping);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(
        () => {
          func(isTyping);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime),
      );
    }
  };
}

// Global hook for user presence and chat list updates (no message subscriptions)
export function useGlobalRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe } = usePresenceSubscription();

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Subscribe to presence using singleton manager
    subscribe(user);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [user?.id, subscribe, unsubscribe, user]);
}

// Chat-specific hook for message subscriptions with proper scoping and filtering
export function useChatRealtime(chatId: string | null, user: User | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Cleanup function to ensure proper channel removal
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (error) {
        console.error('Error removing realtime channel:', error);
      } finally {
        channelRef.current = null;
      }
    }
  }, [chatId]);

  // Set mounted ref for cleanup tracking
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleMessageInsert = (payload: RealtimePayload<MessagePayload>) => {
    // Validate payload structure
    if (!validatePayload(payload, ['id', 'chat_id', 'sender_id', 'content', 'created_at'])) {
      console.error('Invalid message payload received:', payload);
      return;
    }

    const newMessage = payload.new;
    if (!newMessage || !chatId || !mountedRef.current) return;

    // Check if this message is for the current chat
    if (newMessage.chat_id !== chatId) {
      console.warn(
        `Received message for different chat: ${newMessage.chat_id} (current: ${chatId})`,
      );
      return;
    }

    // Get current cache and check for duplicates
    const currentCache = queryClient.getQueryData(['messages', chatId]) as
      | InfiniteData<Message[]>
      | undefined;
    const allMessages = currentCache?.pages.flat() || [];

    // Use the improved deduplication function
    if (
      messageExistsInCache(
        newMessage.id,
        newMessage.content,
        newMessage.sender_id,
        newMessage.created_at,
        allMessages,
      )
    ) {
      console.debug(`Message ${newMessage.id} already exists in cache, skipping`);
      return;
    }

    // Look up quoted message if this is a reply
    let quotedMessage = null;
    if (newMessage.reply_to_id) {
      quotedMessage = allMessages.find((m) => m.id === newMessage.reply_to_id);
      if (!quotedMessage) {
        // Search in other chat caches if not found in current chat
        const allChats = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
        if (allChats) {
          for (const chat of allChats) {
            const chatCache = queryClient.getQueryData(['messages', chat.id]) as
              | InfiniteData<Message[]>
              | undefined;
            const chatMessages = chatCache?.pages.flat() || [];
            const found = chatMessages.find((m) => m.id === newMessage.reply_to_id);
            if (found) {
              quotedMessage = found;
              break;
            }
          }
        }
      }
    }

    // Create enhanced message with quoted data
    const enhancedMessage = {
      ...newMessage,
      reply_to: quotedMessage,
    };

    // Check if this is the active chat to determine update strategy
    const activeChatId = getActiveChatId(queryClient);
    const isActiveChat = activeChatId === chatId;

    // Optimized cache update that respects pagination
    queryClient.setQueryData(
      ['messages', chatId],
      (oldData: InfiniteData<Message[]> | undefined) => {
        if (!oldData || !mountedRef.current) return oldData;

        const newPages = [...oldData.pages];
        const lastPageIdx = newPages.length - 1;

        // Double-check for duplicates in case of race condition
        const exists = newPages.some((page) =>
          page.some((m: Message) => m.id === enhancedMessage.id),
        );
        if (exists) return oldData;

        // Ensure the last page exists before appending
        if (lastPageIdx >= 0 && newPages[lastPageIdx]) {
          // Check if adding to last page would exceed reasonable limits
          if (newPages[lastPageIdx].length < 100) {
            // Prevent page bloat
            newPages[lastPageIdx] = [
              ...newPages[lastPageIdx],
              enhancedMessage as unknown as Message,
            ];
          } else {
            // Create a new page if the last one is too large
            newPages.push([enhancedMessage as unknown as Message]);
          }
        } else {
          newPages[0] = [enhancedMessage as unknown as Message];
        }

        return { ...oldData, pages: newPages };
      },
    );

    // Update chats cache manually instead of invalidating to prevent pagination conflicts
    queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
      if (!oldChats || !mountedRef.current) return oldChats;

      return oldChats.map((chat) => {
        if (chat.id !== chatId) return chat;

        // Update the chat's latest message preview
        return {
          ...chat,
          messages: [enhancedMessage as unknown as Message],
        };
      });
    });

    // If this is not the active chat, we might want to show a notification
    // This is where you could integrate with a notification system
    if (!isActiveChat) {
      console.debug(`Background message received for chat ${chatId}`);
      // You could trigger a notification here
    }
  };

  const handleMessageUpdate = (payload: RealtimePayload<MessagePayload>) => {
    // Validate payload structure
    if (!validatePayload(payload, ['id', 'chat_id', 'sender_id'])) {
      console.error('Invalid message update payload received:', payload);
      return;
    }

    const updatedMessage = payload.new;
    if (!updatedMessage || !chatId || !mountedRef.current) return;

    // Check if this message is for the current chat
    if (updatedMessage.chat_id !== chatId) {
      console.warn(
        `Received message update for different chat: ${updatedMessage.chat_id} (current: ${chatId})`,
      );
      return;
    }

    queryClient.setQueryData(
      ['messages', chatId],
      (oldData: InfiniteData<Message[]> | undefined) => {
        if (!oldData || !mountedRef.current) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) =>
            page.map((msg: Message) => {
              if (msg.id === updatedMessage.id) {
                // Merge new data with existing message to preserve reply_to data
                return {
                  ...msg,
                  ...updatedMessage,
                  // Preserve reply_to data from the existing message
                  reply_to: msg.reply_to,
                  reply_to_id: updatedMessage.reply_to_id || msg.reply_to_id,
                } as unknown as Message;
              }
              return msg;
            }),
          ),
        };
      },
    );
  };

  const handleMessageDelete = (payload: RealtimePayload<MessagePayload>) => {
    // Validate payload structure
    if (!validatePayload(payload, [])) {
      console.error('Invalid message delete payload received:', payload);
      return;
    }

    const deletedId = payload.old?.id;
    const deletedChatId = payload.old?.chat_id;

    if (!deletedId || !chatId || !mountedRef.current) return;

    // Check if this message is for the current chat
    if (deletedChatId && deletedChatId !== chatId) {
      console.warn(
        `Received message delete for different chat: ${deletedChatId} (current: ${chatId})`,
      );
      return;
    }

    queryClient.setQueryData(
      ['messages', chatId],
      (oldData: InfiniteData<Message[]> | undefined) => {
        if (!oldData || !mountedRef.current) {
          return oldData;
        }

        const newData = {
          ...oldData,
          pages: oldData.pages.map((page) => {
            const filteredPage = page.filter((m) => m.id !== deletedId);
            return filteredPage;
          }),
        };

        return newData;
      },
    );

    // Also update the chats cache to reflect the latest message change
    queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
      if (!oldChats || !mountedRef.current) return oldChats;

      return oldChats.map((chat) => {
        if (chat.id !== chatId) return chat;

        const updatedMessages = chat.messages?.filter((m: Message) => m.id !== deletedId) || [];

        return {
          ...chat,
          messages: updatedMessages,
        };
      });
    });
  };

  useEffect(() => {
    // Clean up existing channel if no chatId or user
    if (!chatId || !user?.id) {
      cleanupChannel();
      return;
    }

    // Clean up previous channel before creating new one
    cleanupChannel();

    // Create new channel with chat-specific filtering
    const channel = supabase.channel(`chat-${chatId}`, {
      config: {
        presence: {
          key: `${user.id}-${chatId}`,
        },
      },
    });

    // Subscribe to messages for this specific chat only
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`, // Server-side filtering - CRITICAL for security and performance
        },
        handleMessageInsert,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`, // Server-side filtering
        },
        handleMessageUpdate,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`, // Server-side filtering
        },
        handleMessageDelete,
      )
      .subscribe(async (status: string) => {
        if (!mountedRef.current) return;

        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Chat ${chatId} realtime subscription closed:`, status);
        }
      });

    channelRef.current = channel;

    // CRITICAL: Proper cleanup function
    return () => {
      cleanupChannel();
    };
  }, [chatId, user?.id, cleanupChannel]);

  // Throttled typing indicator function
  const sendTypingIndicator = createThrottle((isTyping: boolean) => {
    if (!chatId || !channelRef.current || !user?.id || !mountedRef.current) return;

    channelRef.current.track({
      user_id: user.id,
      chat_id: chatId,
      is_typing: isTyping,
      timestamp: new Date().toISOString(),
    });
  }, 2000); // 2 second minimum throttle

  return {
    sendTypingIndicator,
  };
}
