'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message } from '@/types';
import type { User } from '@supabase/supabase-js';

interface RealtimePayload<T = Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: Partial<T>;
  errors?: string[];
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

interface MessagePayload {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  [key: string]: unknown;
}

export function useGlobalRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const setOnlineUsers = usePresenceStore((state) => state.setOnlineUsers);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    
    const userId = user.id;

    const channel = supabase.channel('db-global-updates', {
      config: { presence: { key: userId } },
    });

    const updateLastSeen = async () => {
      await supabase.rpc('update_last_seen');
    };

    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateLastSeen();
      }
    }, 1000 * 60 * 5);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updateLastSeen();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', updateLastSeen);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set<string>();
        for (const key of Object.keys(state)) {
          onlineIds.add(key);
        }
        setOnlineUsers(onlineIds);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['contacts'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        (payload: RealtimePayload<ChatPayload>) => {
          const newPayload = payload.new;
          const oldPayload = payload.old;

          if (payload.eventType === 'DELETE') {
            const deletedId = oldPayload?.id;
            queryClient.removeQueries({ queryKey: ['chat', deletedId] });
            queryClient.setQueryData(['chats'], (old: FullChat[] | undefined) => 
              old ? old.filter(c => c.id !== deletedId) : []
            );
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const updatedChat = newPayload;
            if (!updatedChat) return;

            const messagesCache = queryClient.getQueryData<InfiniteData<Message[]>>(['messages', updatedChat.id]);
            const allMessages = messagesCache?.pages.flat() || [];
            let shouldInvalidate = false;

            const resolveReadStatus = (newReadId: string | undefined | null, oldReadId: string | undefined | null) => {
              if (!newReadId || newReadId === oldReadId) return oldReadId;

              const message = allMessages.find((m) => m.id === newReadId) as Message | undefined;
              
              if (message) {
                const timestamp = message.created_at;
                if (timestamp) {
                  return newReadId;
                }
              }

              shouldInvalidate = true; 
              return oldReadId; 
            };

            const currentChatData = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
            const currentChat = currentChatData?.find(c => c.id === updatedChat.id);
            
            const userLastReadId = resolveReadStatus(updatedChat.user_last_read_id, currentChat?.user_last_read_id);
            const recipientLastReadId = resolveReadStatus(updatedChat.recipient_last_read_id, currentChat?.recipient_last_read_id);

            queryClient.setQueryData(['chat', updatedChat.id], (oldData: FullChat | undefined) => {
              if (!oldData) return oldData;
              return {
                ...oldData,
                user_last_read_id: userLastReadId,
                recipient_last_read_id: recipientLastReadId,
              } as FullChat;
            });

            queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
              if (!oldChats) return oldChats;
              return oldChats.map((c) => {
                if (c.id !== updatedChat.id) return c;
                return {
                  ...c,
                  user_last_read_id: userLastReadId,
                  recipient_last_read_id: recipientLastReadId,
                };
              });
            });

            if (shouldInvalidate) {
              queryClient.invalidateQueries({ queryKey: ['chat', updatedChat.id] });
              queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
            return;
          }

          if (payload.eventType === 'INSERT') {
            const newChat = newPayload;
            if (!newChat) return;
            const isParticipant = !newChat.user_id || newChat.user_id === userId || newChat.recipient_id === userId;
            if (isParticipant) {
              // Invalidate chats query to fetch fresh data with relationships
              // This ensures user images and other relationship data are loaded
              queryClient.invalidateQueries({ queryKey: ['chats'] });
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const deletedId = payload.old?.id;
          let chatId = payload.old?.chat_id;
          
          // If chatId is missing, try to get it from the current cache
          if (!chatId && deletedId) {
            // Search through all message caches to find which chat this message belongs to
            const allChats = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
            if (allChats) {
              for (const chat of allChats) {
                const messagesCache = queryClient.getQueryData(['messages', chat.id]) as InfiniteData<Message[]> | undefined;
                const allMessages = messagesCache?.pages.flat() || [];
                if (allMessages.some(m => m.id === deletedId)) {
                  chatId = chat.id;
                  break;
                }
              }
            }
          }
          
          if (!deletedId || !chatId) {
            return;
          }
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
            if (!oldData) {
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
          });
          
          // Also update the chats cache to reflect the latest message change
          queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
            if (!oldChats) return oldChats;
            
            return oldChats.map((chat) => {
              if (chat.id !== chatId) return chat;
              
              const updatedMessages = chat.messages?.filter((m: Message) => m.id !== deletedId) || [];
              
              return {
                ...chat,
                messages: updatedMessages,
              };
            });
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const chatId = payload.new?.chat_id;
          if (!chatId) return;

          const newMessage = payload.new;
          if (!newMessage) return;
          
          // Check if message already exists in cache (prevent duplicates)
          const currentCache = queryClient.getQueryData(['messages', chatId]) as InfiniteData<Message[]> | undefined;
          const allMessages = currentCache?.pages.flat() || [];
          const messageExists = allMessages.some(m => 
            m.id === newMessage.id || 
            (m.content === newMessage.content && 
             m.sender_id === newMessage.sender_id &&
             Math.abs(new Date(m.created_at).getTime() - new Date(newMessage.created_at).getTime()) < 2000)
          );
          
          if (messageExists) {
            return;
          }
          
          // Look up quoted message if this is a reply
          let quotedMessage = null;
          if (newMessage.reply_to_id) {
            quotedMessage = allMessages.find(m => m.id === newMessage.reply_to_id);
            if (!quotedMessage) {
              // Search in other chat caches if not found in current chat
              const allChats = queryClient.getQueryData(['chats']) as FullChat[] | undefined;
              if (allChats) {
                for (const chat of allChats) {
                  const chatCache = queryClient.getQueryData(['messages', chat.id]) as InfiniteData<Message[]> | undefined;
                  const chatMessages = chatCache?.pages.flat() || [];
                  const found = chatMessages.find(m => m.id === newMessage.reply_to_id);
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
            reply_to: quotedMessage
          };
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
             if (!oldData) return oldData;
             const newPages = [...oldData.pages];
             const lastPageIdx = newPages.length - 1;
             const exists = newPages.some(page => page.some((m: Message) => m.id === enhancedMessage.id));
             if (exists) return oldData;
             
             // Ensure the last page exists before appending
             if (lastPageIdx >= 0) {
               newPages[lastPageIdx] = [...newPages[lastPageIdx], enhancedMessage as unknown as Message];
             } else {
               newPages[0] = [enhancedMessage as unknown as Message];
             }
             
             return { ...oldData, pages: newPages };
          });
          
          // Update chats cache manually instead of invalidating
          queryClient.setQueryData(['chats'], (oldChats: FullChat[] | undefined) => {
            if (!oldChats) return oldChats;
            
            return oldChats.map((chat) => {
              if (chat.id !== chatId) return chat;
              
              // Update the chat's latest message preview
              return {
                ...chat,
                messages: [enhancedMessage as unknown as Message],
              };
            });
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload: RealtimePayload<MessagePayload>) => {
          const chatId = payload.new?.chat_id || payload.old?.chat_id;
          if (!chatId) return;

          const updatedMessage = payload.new;
          if (!updatedMessage) return;
          
          queryClient.setQueryData(['messages', chatId], (oldData: InfiniteData<Message[]> | undefined) => {
             if (!oldData) return oldData;
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
                       reply_to_id: updatedMessage.reply_to_id || msg.reply_to_id
                     } as unknown as Message;
                   }
                   return msg;
                 })
               )
             };
          });
        }
      )
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
        
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          updateLastSeen();
        }
      });

    return () => {
      clearInterval(heartbeatInterval);
      updateLastSeen();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', updateLastSeen);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, setOnlineUsers]);
}
