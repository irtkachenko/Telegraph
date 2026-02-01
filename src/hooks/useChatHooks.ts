'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  useInfiniteQuery, 
  useMutation, 
  useQuery, 
  useQueryClient,
  type InfiniteData
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Залишаємо тільки ОДИН варіант авторизації та клієнта
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { supabase } from '@/lib/supabase/client';
import { usePresenceStore } from '@/store/usePresenceStore';
import type { FullChat, Message, User, Attachment } from '@/types';

// 1. Отримання чатів
export function useChats() {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      if (!user) return [];

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
        .or(`user_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' });

      if (error) {
        console.error('Помилка запиту чатів:', error.message);
        throw error;
      }

      // Use data directly since it's already in snake_case format
      const normalizedChats = data as FullChat[];
      
      // Сортуємо за датою останнього повідомлення (Bubble to top)
      return normalizedChats.sort((a: FullChat, b: FullChat) => {
        const dateA = a.messages?.[0]?.created_at || a.created_at;
        const dateB = b.messages?.[0]?.created_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    },
    enabled: !!user,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: string; messageId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { markAsReadAction } = await import('@/actions/chat-actions');
      const result = await markAsReadAction(chatId, messageId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to mark as read');
      }
      
      return result;
    },
    onMutate: async ({ chatId, messageId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      
      // Snapshot the previous value
      const previousChats = queryClient.getQueryData(['chats']);

      // Optimistically update the chats cache
      queryClient.setQueryData(['chats'], (old: any) => {
        if (!old) return old;
        
        return old.map((chat: any) => {
          if (chat.id === chatId) {
            const isCurrentUser = chat.user_id === user?.id;
            const readField = isCurrentUser ? 'user_last_read' : 'recipient_last_read';
            
            return {
              ...chat,
              [readField]: {
                id: messageId,
                created_at: new Date().toISOString()
              }
            };
          }
          return chat;
        });
      });

      return { previousChats };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
    },
    onSuccess: (_, { chatId }) => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
  });
}

export function useChatDetails(chatId: string) {
  const { user } = useSupabaseAuth();

  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: async () => {
      if (!user) throw new Error('Unauthorized');

      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          user:user_id(*),
          recipient:recipient_id(*)
        `)
        .eq('id', chatId)
        .single();

      if (error) throw error;

      // Use data directly since it's already in snake_case format
      const normalizedData = data as FullChat;
      
      // Normalize participants for the UI
      const participants = [normalizedData.user, normalizedData.recipient].filter(Boolean) as User[];

      return { ...normalizedData, participants } as FullChat;
    },
    enabled: !!chatId && !!user,
  });
}

export function useMessages(chatId: string) {
  const { user } = useSupabaseAuth();
  const markAsReadMutation = useMarkAsRead();
  const lastProcessedId = useRef<string | null>(null);

  const query = useInfiniteQuery<Message[], Error, InfiniteData<Message[]>, string[], string | undefined>({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!chatId) return [];

      const { data, error } = await supabase
        .from('messages')
        /**
         * ВИПРАВЛЕННЯ PGRST200:
         * Використовуємо 'replyTo:reply_to_id(*)' замість імені ключа fkey.
         * Додаємо joined user data для оптимізації (використовуємо подвійні лапки оскільки 'user' - зарезервоване слово)
         */
        .select('*, reply_to:reply_to_id(*), "user":sender_id(id, name, image)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(50)
        .lt('created_at', pageParam || '9999-12-31');

      if (error) {
        console.error("Помилка завантаження повідомлень:", error.message);
        throw error;
      }
      // Cast response data with proper typing for attachments
      const normalizedData = (data as unknown as Message[]).map((msg) => ({
        ...msg,
        attachments: msg.attachments || []
      }));
      
      // Повертаємо масив (нові повідомлення будуть в кінці масиву сторінки)
      return normalizedData.reverse();
    },
    initialPageParam: undefined as string | undefined,
    getPreviousPageParam: (firstPage): string | undefined => {
      if (!firstPage || firstPage.length < 50) return undefined;
      const createdAt = (firstPage[0] as Message).created_at;
      return createdAt as string;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  // --- АВТОМАТИЧНЕ ПРОЧИТАННЯ (ОНОВЛЕНО) ---
  useEffect(() => {
    const allMessages = query.data?.pages.flat() || [];
    if (allMessages.length === 0 || !user?.id) return;

    const latestMessage = allMessages.reduce((prev: Message, current: Message) => {
      return (new Date(current.created_at) > new Date(prev.created_at)) ? current : prev;
    });
    
    const msgId = latestMessage.id;
    const msgSenderId = latestMessage.sender_id;

    if (msgId && msgSenderId !== user.id && lastProcessedId.current !== msgId) {
      lastProcessedId.current = msgId;
      markAsReadMutation.mutate({ chatId, messageId: msgId });
    }
  }, [query.data?.pages, user?.id, chatId, markAsReadMutation.mutate]);

  return query;
}

// 3. Пошук (для ContactsList)
export function useSearchUsers(queryText: string) {
  const { user: currentUser } = useSupabaseAuth();

  return useQuery({
    queryKey: ['contacts', queryText, currentUser?.id],
    queryFn: async () => {
      // 1. Захист від undefined UUID
      if (!currentUser?.id) return [];

      let query = supabase
        .from('user')
        .select('id, name, email, image, last_seen') // Вибираємо тільки ті поля, що існують
        .neq('id', currentUser.id);

      if (queryText.trim().length > 1) {
        // Пошук за ім'ям або поштою
        query = query.or(`name.ilike.%${queryText}%,email.ilike.%${queryText}%`).limit(10);
      } else if (!queryText.trim()) {
        // Task 2: 20 юзерів, які заходили нещодавно (сортуємо за last_seen)
        // Якщо в базі поле зветься last_seen — використовуємо його
        query = query.order('last_seen', { ascending: false, nullsFirst: false }).limit(20);
      } else {
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error('Помилка useSearchUsers:', error.message);
        throw error;
      }

      return data as User[];
    },
    // Запит спрацює тільки коли є юзер і або порожній рядок, або > 1 символа
    enabled: !!currentUser?.id && (queryText.trim().length === 0 || queryText.trim().length > 1),
  });
}

// 4. Присутність (для ContactsList)
export function usePresence() {
  const onlineUsers = usePresenceStore((state) => state.onlineUsers);
  return { onlineUsers };
}

export function useChatTyping(chatId: string) {
  const { user } = useSupabaseAuth();
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  const channelRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chatId || !user?.id) return;

    const channel = supabase.channel(`typing:${chatId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingMap: Record<string, boolean> = {};
        
        for (const id in state) {
          typingMap[id] = (state[id] as any[]).some((p) => p.isTyping);
        }
        setIsTyping(typingMap);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ isTyping: false });
        }
      });

    channelRef.current = channel;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [chatId, user]);

  const setTyping = useCallback((typing: boolean) => {
    if (channelRef.current) {
      channelRef.current.track({ isTyping: typing });

      // Auto-cleanup timer: 3 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      if (typing) {
        timeoutRef.current = setTimeout(() => {
          channelRef.current?.track({ isTyping: false });
        }, 3000);
      }
    }
  }, []);

  return { isTyping, setTyping };
}

export function useEditMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', messageId)
        .select('*, reply_to:reply_to_id(*)')
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (newEdit) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) =>
            page.map((msg: any) =>
              msg.id === newEdit.messageId ? { ...msg, content: newEdit.content, updated_at: new Date().toISOString() } : msg
            )
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, _, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error(`Помилка редагування: ${error.message}`);
    },
    onSuccess: () => {
      toast.success('Повідомлення відредаговано');
    },
  });
}

// 5. Відправка повідомлення
export function useSendMessage(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      content, 
      reply_to_id,
      attachments 
    }: { 
      content: string; 
      reply_to_id?: string;
      attachments?: Attachment[];
    }) => {
      if (!user) throw new Error('Ви не авторизовані');

      // 1. Вставляємо дані. 
      // Використовуємо .select() з явним вказанням зв'язку, щоб уникнути дублів ключів
      const { error, data } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content,
          reply_to_id: reply_to_id || null,
          attachments: attachments || [],
        })
        .select('*, reply_to:reply_to_id(*)')
        .single();

      if (error) {
        console.error("Помилка відправки:", error.message);
        throw error;
      }
      return data;
    },

    onMutate: async (newMessage) => {
      // Скасовуємо активні запити, щоб вони не перезаписали наш оптимістичний стейт
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });

      // Зберігаємо попередні дані для відкату у разі помилки
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Знаходимо повідомлення, на яке відповідаємо (для UI)
      const allMessages = (previousData as any)?.pages?.flat() || [];
      const parentMessage = newMessage.reply_to_id 
        ? allMessages.find((m: any) => m.id === newMessage.reply_to_id)
        : null;

      // Створюємо "фейкове" повідомлення для миттєвого відображення
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        content: newMessage.content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(),
        reply_to_id: newMessage.reply_to_id || null,
        reply_to: parentMessage,
        attachments: newMessage.attachments || [],
        is_optimistic: true 
      };

      // Оновлюємо кеш React Query
      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        
        const newPages = [...old.pages];
        const lastPageIdx = newPages.length - 1;
        
        // Додаємо в кінець останньої сторінки
        newPages[lastPageIdx] = [...newPages[lastPageIdx], optimisticMessage];
  
        return { ...old, pages: newPages };
      });

      // --- ОПТИМІСТИЧНЕ ОНОВЛЕННЯ СПИСКУ ЧАТІВ (Bubble to top) ---
      queryClient.setQueryData(['chats'], (old: any) => {
        if (!old) return old;
        const chatIndex = old.findIndex((c: any) => c.id === chatId);
        if (chatIndex === -1) return old;

        const updatedChat = {
          ...old[chatIndex],
          messages: [optimisticMessage], // Оновлюємо прев'ю
        };

        const otherChats = old.filter((c: any) => c.id !== chatId);
        return [updatedChat, ...otherChats]; // Ставимо на початок
      });

      return { previousData };
    },

    onError: (error: Error, _, context) => {
      // Якщо помилка — повертаємо старі дані
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error(`Не вдалося відправити: ${error.message}`);
    },

    onSuccess: (savedMessage) => {
      // Replace temp message with real message, but be more careful about duplicates
      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        
        // Check if the real message already exists (might have been added by real-time)
        const alreadyExists = old.pages.some((page: any[]) =>
          page.some((msg: any) => msg.id === savedMessage.id)
        );
        
        if (alreadyExists) {
          // If it already exists, just remove any temp messages with same content
          return {
            ...old,
            pages: old.pages.map((page: any[]) =>
              page.filter((msg: any) => 
                !(msg.id.toString().startsWith('temp-') && msg.content === savedMessage.content)
              )
            ),
          };
        }
        
        // Otherwise, replace temp message with real message
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((msg) => 
              msg.id.toString().startsWith('temp-') && msg.content === savedMessage.content 
                ? savedMessage 
                : msg
            )
          ),
        };
      });
    },

    onSettled: () => {
      // Фінальна синхронізація (опціонально)
      // queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    }
  });
}

export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('chat_id', chatId);

      if (error) {
        throw error;
      }
      
      if (!data || data.length === 0) {
        throw new Error('Немає прав на видалення або повідомлення вже видалено');
      }

      return data;
    },
    // Чітко вказуємо, що чекаємо string
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) =>
            // Використовуємо messageId з аргументів мутації
            page.filter((msg: any) => msg.id !== messageId)
          ),
        };
      });

      return { previousData };
    },
    onError: (error: any, messageId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['messages', chatId], context.previousData);
      }
      toast.error('Помилка видалення', {
        description: error.message,
      });
    },
    onSuccess: () => {
      toast.success('Повідомлення видалено');
    },
  });
}

export function useDeleteChat() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;
      return chatId;
    },
    onSuccess: (chatId) => {
      // 1. ПРЕВЕНТИВНО видаляємо всі запити, пов'язані з цим чатом
      // Це зупинить будь-які спроби React Query рефетчити дані, поки ми переходимо на іншу сторінку
      queryClient.removeQueries({ queryKey: ['chat', chatId] });
      queryClient.removeQueries({ queryKey: ['messages', chatId] });

      // 2. Оновлюємо список чатів локально (оптимістично)
      queryClient.setQueryData(['chats'], (old: any) => {
        if (!old) return old;
        return old.filter((chat: any) => chat.id !== chatId);
      });

      // 3. Виводимо сповіщення
      toast.success('Чат видалено');

      // 4. Редірект на головну сторінку месенджера
      router.push('/chat'); 
    },
    onError: (error: Error) => {
      toast.error(`Не вдалося видалити чат: ${error.message}`);
    }
  });
}


export function useUpdateLastSeen() {
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;

      const { error } = await supabase.rpc('update_last_seen');

      if (error) throw error;
    },
    onError: (error: Error) => {
      console.error('Помилка оновлення статусу присутності:', error);
    },
  });
}

export function useScrollToMessage(
  virtuosoRef: React.RefObject<any>,
  messages: Message[],
  fetchPreviousPage: () => void,
  hasPreviousPage: boolean,
) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  // Monitor messages array changes and retry scrolling if we have a pending target
  useEffect(() => {
    if (pendingScrollTarget && !isFetchingHistory) {
      const index = messages.findIndex((m: Message) => m.id === pendingScrollTarget);
      
      if (index !== -1) {
        // Message found, scroll to it
        setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index,
            behavior: 'smooth',
            align: 'center',
          });
          setHighlightedId(pendingScrollTarget);
          setTimeout(() => setHighlightedId(null), 3000);
          setPendingScrollTarget(null); // Clear pending target
        }, 100);
      }
    }
  }, [messages, pendingScrollTarget, isFetchingHistory, virtuosoRef]);

  const scrollToMessage = useCallback(
    async (messageId: string, options?: { align?: 'start' | 'center' | 'end'; behavior?: 'smooth' | 'auto' }) => {
      const maxPagesToFetch = 10;
      let pagesFetched = 0;
      
      const tryScroll = (currentMessages: Message[]) => {
        const index = currentMessages.findIndex((m: Message) => m.id === messageId);
        
        if (index !== -1) {
          // Message found, scroll to it with proper timing
          setTimeout(() => {
            virtuosoRef.current?.scrollToIndex({
              index,
              behavior: options?.behavior || 'smooth',
              align: options?.align || 'center',
            });
            setHighlightedId(messageId);
            setTimeout(() => setHighlightedId(null), 3000);
          }, 100);
          
          return true;
        }
        return false;
      };

      // First attempt with current messages
      if (tryScroll(messages)) {
        return;
      }

      // Message not found, try to fetch previous pages
      if (!hasPreviousPage) {
        toast.error('Message not found in chat history');
        return;
      }

      toast.info('Loading chat history...');
      setPendingScrollTarget(messageId);
      setIsFetchingHistory(true);
      
      // Fetch loop with limit to prevent infinite loops
      const fetchLoop = async () => {
        while (pagesFetched < maxPagesToFetch && hasPreviousPage) {
          pagesFetched++;
          
          // Wait for the fetch to complete and state to update
          await new Promise<void>((resolve) => {
            fetchPreviousPage();
            
            // Wait a bit for React Query to update the state
            setTimeout(() => {
              resolve();
            }, 300);
          });
        }
        
        setIsFetchingHistory(false);
        
        if (pagesFetched >= maxPagesToFetch) {
          toast.error('Message not found after loading history');
          setPendingScrollTarget(null);
        } else if (!hasPreviousPage) {
          toast.error('Message not found in available history');
          setPendingScrollTarget(null);
        }
      };

      fetchLoop();
    },
    [messages, hasPreviousPage, fetchPreviousPage, virtuosoRef, isFetchingHistory],
  );

  return { scrollToMessage, highlightedId };
}

