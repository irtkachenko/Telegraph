'use client';

import { MessageSquare, Trash2, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { memo, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useChats, useDeleteChat } from '@/hooks/chat';
import { formatRelativeTime } from '@/lib/date-utils';
import type { FullChat, Message } from '@/types';
import { PresenceIndicator } from './PresenceIndicator';

function ChatListBase() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useChats();
  const { user } = useSupabaseAuth();
  const deleteChat = useDeleteChat();
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  const currentUserId = user?.id;

  // Об'єднуємо всі сторінки в один масив
  const chats = data?.pages.flat() || [];

  // Debug для пагінації
  console.log('📄 Chat pagination:', {
    pagesCount: data?.pages.length || 0,
    pagesLengths: data?.pages.map((p) => p.length) || [],
    totalAfterFlat: chats.length,
  });

  // Debug лог для Virtuoso
  const validChats = useMemo(() => {
    const filtered = chats.filter((chat) => chat?.id);
    const duplicateCheck = new Set(filtered.map((c) => c.id)).size !== filtered.length;

    console.log('🔍 Chats for Virtuoso:', {
      total: chats.length,
      valid: filtered.length,
      ids: filtered.map((c) => c.id),
      hasDuplicates: duplicateCheck,
      firstItem: filtered[0],
      lastItem: filtered[filtered.length - 1],
    });

    if (duplicateCheck) {
      console.error('❌ DUPLICATE CHAT IDS DETECTED!');
    }

    // Захист від порожніх даних
    if (filtered.length === 0) {
      console.log('📭 No chats to render, returning empty array');
      return [];
    }

    return filtered;
  }, [chats]);

  const handleChatClick = () => {
    window.dispatchEvent(new CustomEvent('close-mobile-sidebar'));
  };

  const handleDeleteChat = (chatId: string) => {
    setChatToDelete(chatId);
  };

  const handleConfirmDelete = () => {
    if (chatToDelete) {
      deleteChat.mutate(chatToDelete);
      setChatToDelete(null);
    }
  };

  // Функція для рендерингу одного чату
  const renderChat = (_index: number, chat: FullChat) => {
    const partner = chat.user_id === currentUserId ? chat.recipient : chat.user;
    const chatDisplayTitle = partner?.name || chat.title || 'Користувач Trace';
    const partnerImage = partner?.image;

    // Debug logging to help identify missing partner data
    if (!partner) {
      console.warn('Chat missing partner data:', {
        chatId: chat.id,
        userId: chat.user_id,
        recipientId: chat.recipient_id,
        currentUserId,
      });
    }

    const lastMessage = chat.messages?.[0];

    // Determine which read field to check based on who the current user is
    const isCurrentUser = chat.user_id === currentUserId;
    const readMessageId = isCurrentUser ? chat.user_last_read_id : chat.recipient_last_read_id;

    // Find the read message in the messages array to get its created_at timestamp
    const readMessage = chat.messages?.find((m: Message) => m.id === readMessageId);
    const readAt = readMessage?.created_at;

    const isUnread =
      lastMessage &&
      lastMessage.sender_id !== currentUserId &&
      (!readAt || new Date(lastMessage.created_at) > new Date(readAt));

    return (
      <ContextMenu key={chat.id}>
        <ContextMenuTrigger>
          <Link
            href={`/chat/${chat.id}`}
            onClick={handleChatClick}
            className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group"
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 overflow-hidden">
                {partnerImage ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={partnerImage}
                      alt={chatDisplayTitle}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <User className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                )}
              </div>
              <PresenceIndicator
                userId={partner?.id || ''}
                className="absolute bottom-0 right-0 w-2.5 h-2.5"
                showOffline={false}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                  {chatDisplayTitle}
                </p>

                {lastMessage && (
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {formatRelativeTime(lastMessage.created_at)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[11px] text-gray-500 truncate flex-1">
                  {lastMessage?.sender_id === currentUserId && 'Ви: '}
                  {lastMessage?.content ||
                    (Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0
                      ? '📎 Медіа'
                      : 'Немає повідомлень')}
                </p>
                {isUnread && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" />
                )}
              </div>
            </div>
          </Link>
        </ContextMenuTrigger>

        <ContextMenuContent className="z-[110]">
          <ContextMenuItem onClick={handleChatClick} className="gap-2">
            <MessageSquare className="w-4 h-4" /> Open Chat
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => handleDeleteChat(chat.id)}
            className="text-red-400 focus:text-red-400 focus:bg-red-500/10 gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete Chat
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Функція для рендерингу футера (індикатор завантаження)
  const renderFooter = () => {
    if (!hasNextPage && chats.length > 0) {
      return (
        <div className="py-4 text-center">
          <div className="text-[10px] text-gray-600">Всі чати завантажено</div>
        </div>
      );
    }

    if (isFetchingNextPage) {
      return (
        <div className="py-4 text-center">
          <div className="text-sm text-gray-500">Завантаження...</div>
        </div>
      );
    }

    return null;
  };

  if (isLoading && chats.length === 0) {
    return (
      <>
        <div className="p-8 text-center text-sm text-gray-500 mt-10">Завантаження...</div>
        <ConfirmationDialog
          open={!!chatToDelete}
          onOpenChange={(open) => !open && setChatToDelete(null)}
          title="Delete Chat"
          description="Are you sure? This action cannot be undone."
          onConfirm={handleConfirmDelete}
          isLoading={deleteChat.isPending}
        />
      </>
    );
  }

  if (!chats.length && !isLoading) {
    return (
      <>
        <div className="p-8 text-center text-sm text-gray-500 mt-10">Немає діалогів</div>
        <ConfirmationDialog
          open={!!chatToDelete}
          onOpenChange={(open) => !open && setChatToDelete(null)}
          title="Delete Chat"
          description="Are you sure? This action cannot be undone."
          onConfirm={handleConfirmDelete}
          isLoading={deleteChat.isPending}
        />
      </>
    );
  }

  return (
    <>
      {validChats.length > 0 ? (
        <Virtuoso
          data={validChats}
          itemContent={renderChat}
          endReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          overscan={20}
          components={{
            Footer: renderFooter,
          }}
          className="flex-1 px-2"
          style={{ height: '100%' }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="p-8 text-sm text-gray-500 mt-10">
              {isLoading ? 'Завантаження...' : 'Немає діалогів'}
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
        title="Delete Chat"
        description="Are you sure? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        isLoading={deleteChat.isPending}
      />
    </>
  );
}

export const ChatList = memo(ChatListBase);
