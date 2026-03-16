'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import ChatInput from '@/components/chat/ChatInput';
import MessageBubble from '@/components/chat/MessageBubble';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  useChatDetails,
  useChatEvents,
  useDeleteMessage,
  useMessages,
  useScrollToMessage,
} from '@/hooks/chat';
import { usePresence } from '@/hooks/user';
import { formatRelativeTime } from '@/lib/date-utils';
import type { Message, User } from '@/types';

export default function ChatPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  // Handle both Promise and object formats for Next.js compatibility
  const resolvedParams = 'then' in params ? use(params) : params;
  const { id } = resolvedParams;
  const router = useRouter();
  const { user, supabaseUser, loading: isAuthLoading } = useSupabaseAuth();
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const { data: chat, isLoading: isChatLoading, isError } = useChatDetails(id);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const {
    messages,
    isLoading: isMessagesLoading,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useMessages(id, isAtBottom);

  const { typingUsers, setTyping } = useChatEvents(id, supabaseUser);
  const { onlineUsers } = usePresence();
  const deleteMessage = useDeleteMessage(id);

  const { scrollToMessage, highlightedId } = useScrollToMessage(
    virtuosoRef,
    messages,
    fetchPreviousPage,
    hasPreviousPage,
    id,
  );

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [postScrollDelayDone, setPostScrollDelayDone] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const domMessagesReadyRef = useRef(false);
  const loaderShownAtRef = useRef<number | null>(null);

  // Редірект при помилці
  useEffect(() => {
    if (!isAuthLoading && !isChatLoading && (isError || (!chat && !isMessagesLoading))) {
      router.replace('/');
    }
  }, [isAuthLoading, isChatLoading, chat, isError, router, isMessagesLoading]);

  // Loader handling with real DOM readiness detection
  useEffect(() => {
    domMessagesReadyRef.current = false;
    setShowLoader(true);
    loaderShownAtRef.current = performance.now();
    setInitialScrollDone(false);
    setPostScrollDelayDone(false);
  }, [id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const checkDomMessages = () => {
      const hasMessagesInDom =
        !!container.querySelector('[id^="message-"]') ||
        !!container.querySelector('[data-message-row]');
      const isEmptyChatLoaded = !isMessagesLoading && messages.length === 0;

      if (hasMessagesInDom || isEmptyChatLoaded) {
        domMessagesReadyRef.current = true;
        setShowLoader(false);
      }
    };

    // Initial check
    checkDomMessages();

    const observer = new MutationObserver(() => {
      checkDomMessages();
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [messages.length, isMessagesLoading]);

  useEffect(() => {
    const chatReady = !!chat && !isChatLoading && !isAuthLoading;
    const messagesReady = !isMessagesLoading && (messages.length === 0 || initialScrollDone);
    const readyToHide =
      chatReady && messagesReady && domMessagesReadyRef.current && postScrollDelayDone;

    if ((isAuthLoading || isChatLoading || isMessagesLoading) && !domMessagesReadyRef.current) {
      setShowLoader(true);
      loaderShownAtRef.current = performance.now();
    } else if (readyToHide) {
      const elapsed = loaderShownAtRef.current ? performance.now() - loaderShownAtRef.current : 0;
      const remaining = Math.max(300 - elapsed, 0);
      const timer = setTimeout(() => setShowLoader(false), remaining);
      return () => clearTimeout(timer);
    }
  }, [
    isAuthLoading,
    isChatLoading,
    isMessagesLoading,
    messages.length,
    initialScrollDone,
    postScrollDelayDone,
    chat,
  ]);

  // Auto-scroll to bottom when messages are loaded (hide under loader first render)
  useEffect(() => {
    if (!isMessagesLoading && messages.length > 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          behavior: 'auto',
          align: 'end',
        });
        if (!initialScrollDone) {
          setInitialScrollDone(true);
          setTimeout(() => setPostScrollDelayDone(true), 120);
        }
      });
    } else if (!isMessagesLoading && messages.length === 0) {
      setInitialScrollDone(true);
      setPostScrollDelayDone(true);
    }
  }, [isMessagesLoading, messages.length, initialScrollDone]);


  // Interaction Handlers
  const handleReply = (message: Message) => {
    setEditingMessage(null);
    setReplyingTo(message);
  };

  const handleEdit = (message: Message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  };

  const handleScrollToMessage = (messageId: string) => {
    scrollToMessage(messageId, { align: 'center' });
  };

  // --- ОПТИМІЗАЦІЯ: Створюємо Map індексів повідомлень для O(1) пошуку ---
  const messageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < messages.length; i++) {
      map.set(messages[i].id, i);
    }
    return map;
  }, [messages]);

  const otherParticipant = chat?.participants?.find((p: User) => p.id !== user?.id);
  const isOnline = otherParticipant && onlineUsers.has(otherParticipant.id);
  const isTypingNow = otherParticipant && typingUsers.has(otherParticipant.id);

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] w-full bg-background relative overflow-hidden">
      {showLoader && (
        <div className="absolute inset-0 z-30 flex items-center justify-center text-gray-400 bg-background backdrop-blur-md">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium animate-pulse">Завантаження чату...</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div
        className="px-3 sm:px-6 py-3 sm:py-4 border-b border-white/5 flex items-center justify-between backdrop-blur-xl bg-black/40 sticky top-0 z-20 transition-opacity duration-150"
        style={{ opacity: showLoader ? 0 : 1 }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden border border-white/10 shadow-lg">
            <Image
              src={otherParticipant?.image || '/default-avatar.png'}
              alt={otherParticipant?.name || 'User'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 40px, 44px"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate leading-tight">
              {otherParticipant?.name || 'Невідомий користувач'}
            </h2>
            <div className="text-[10px] sm:text-[11px] font-medium transition-colors">
              {isTypingNow ? (
                <span className="text-blue-400 animate-pulse">друкує...</span>
              ) : isOnline ? (
                <span className="text-green-400">в мережі</span>
              ) : (
                <span className="text-gray-500">
                  {otherParticipant?.last_seen
                    ? `був(ла) ${formatRelativeTime(otherParticipant.last_seen)}`
                    : 'не в мережі'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 relative min-h-0 transition-opacity duration-150"
        style={{ opacity: showLoader ? 0 : 1 }}
        ref={messagesContainerRef}
      >
        {messages.length === 0 && !isMessagesLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4 border border-white/10 shadow-2xl">
              <span className="text-3xl">💬</span>
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">Поки що порожньо</h3>
            <p className="text-gray-500 text-sm max-w-[280px]">
              Напишіть щось, щоб розпочати бесіду!
            </p>
          </div>
        ) : messages.length > 0 ? (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            followOutput="smooth"
            className="no-scrollbar"
            atBottomStateChange={(atBottom) => {
              setShowScrollButton(!atBottom);
              setIsAtBottom(atBottom);
            }}
            startReached={() => {
              if (hasPreviousPage && !isFetchingPreviousPage) {
                fetchPreviousPage();
              }
            }}
            itemContent={(_index, message) => {
              // O(1) пошук індексу повідомлення
              const currentMessageIndex = messageIndexMap.get(message.id);
              const recipientLastReadId = chat?.recipient_last_read_id;
              const recipientLastReadIndex = recipientLastReadId
                ? messageIndexMap.get(recipientLastReadId)
                : undefined;
              const isRead =
                currentMessageIndex !== undefined &&
                recipientLastReadIndex !== undefined &&
                currentMessageIndex <= recipientLastReadIndex;

              return (
                <div className="px-2 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full py-0.5">
                  <MessageBubble
                    key={message.id}
                    message={message}
                    currentUserId={user?.id}
                    isRead={
                      // 1. Повідомлення відправив Я
                      message.sender_id === user?.id &&
                      // 2. У нас є ID прочитаного повідомлення від іншого користувача
                      !!chat?.recipient_last_read_id &&
                      // 3. O(1) порівняння індексів замість O(n) пошуку
                      isRead
                    }
                    isEditing={editingMessage?.id === message.id}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onDelete={setMessageToDelete}
                    onScrollToMessage={handleScrollToMessage}
                    isHighlighed={highlightedId === message.id}
                    otherParticipantName={otherParticipant?.name || undefined}
                  />
                </div>
              );
            }}
            components={{
              Header: () => (
                <div className="py-10 text-center">
                  {isFetchingPreviousPage ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest animate-pulse">
                      Завантаження...
                    </span>
                  ) : !hasPreviousPage && messages.length > 0 ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest opacity-50 italic">
                      Початок історії
                    </span>
                  ) : null}
                </div>
              ),
              Footer: () => <div className="h-6 w-full" />,
            }}
          />
        ) : null}

        <AnimatePresence>
          {showScrollButton && messages.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => {
                try {
                  if (messages.length > 0) {
                    const lastIndex = Math.max(0, messages.length - 1);
                    console.log('📍 Scrolling to index:', lastIndex, 'of', messages.length);

                    virtuosoRef.current?.scrollToIndex({
                      index: lastIndex,
                      behavior: 'smooth',
                      align: 'end',
                    });
                  }
                } catch (error) {
                  console.error('❌ Virtuoso scroll error:', error);
                  // Fallback: простий scroll до кінця через DOM query
                  const container = document.querySelector('.no-scrollbar');
                  if (container) {
                    container.scrollTop = container.scrollHeight;
                  }
                }
              }}
              className="absolute bottom-6 right-6 p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-2xl text-white shadow-2xl z-10"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Section */}
      <div className="w-full border-t border-white/5 bg-black/40 backdrop-blur-2xl z-20">
        <div className="max-w-5xl mx-auto px-1.5 sm:px-4 py-2 sm:py-4">
          <ChatInput
            chatId={id}
            setTyping={setTyping}
            replyToId={replyingTo?.id}
            onReplyCancel={() => setReplyingTo(null)}
            editingMessage={editingMessage}
            onEditCancel={() => setEditingMessage(null)}
            onMessageSent={() => {
              const wasEditing = !!editingMessage;
              setReplyingTo(null);
              setEditingMessage(null);

              if (!wasEditing) {
                requestAnimationFrame(() => {
                  virtuosoRef.current?.scrollToIndex({
                    index: messages.length,
                    behavior: 'smooth',
                    align: 'end',
                  });
                });
              }
            }}
          />
        </div>
        <div className="h-[env(safe-area-inset-bottom,16px)]" />
      </div>

      <ConfirmationDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Видалити повідомлення?"
        description="Ця дія незворотна. Повідомлення зникне для обох учасників."
        onConfirm={() => {
          if (messageToDelete) {
            deleteMessage.mutate(messageToDelete);
            setMessageToDelete(null);
          }
        }}
        isLoading={deleteMessage.isPending}
      />
    </div>
  );
}
