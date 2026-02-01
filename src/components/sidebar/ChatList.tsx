'use client';

import { MessageSquare, Trash2, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useSupabaseAuth } from '@/components/SupabaseAuthProvider';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useChats, useDeleteChat } from '@/hooks/useChatHooks';
import { PresenceIndicator } from './PresenceIndicator';
import { formatRelativeTime } from '@/lib/date-utils';

export default function ChatList() {
  const { data: chats, isLoading } = useChats();
  const { user } = useSupabaseAuth();

  const deleteChat = useDeleteChat();
  // const { onlineUsers } = usePresence(); // REMOVED: Caused full re-renders
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  const currentUserId = user?.id;

  const handleChatClick = () => {
    window.dispatchEvent(new CustomEvent('close-mobile-sidebar'));
  };

  if (isLoading)
    return <div className="p-8 text-center text-sm text-gray-500 mt-10">Завантаження...</div>;
  if (!chats?.length)
    return <div className="p-8 text-center text-sm text-gray-500 mt-10">Немає діалогів</div>;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {chats.map((chat) => {
          const partner = chat.user_id === currentUserId ? chat.recipient : chat.user;
          const chatDisplayTitle = partner?.name || chat.title || 'Користувач Trace';
          const partnerImage = partner?.image;
          
          // Debug logging to help identify missing partner data
          if (!partner) {
            console.warn('Chat missing partner data:', {
              chatId: chat.id,
              userId: chat.user_id,
              recipientId: chat.recipient_id,
              currentUserId
            });
          }

          const lastMessage = chat.messages?.[0];
          
          // Determine which read field to check based on who the current user is
          const isCurrentUser = chat.user_id === currentUserId;
          const readMessageId = isCurrentUser ? chat.user_last_read_id : chat.recipient_last_read_id;
          
          // Find the read message in the messages array to get its created_at timestamp
          const readMessage = chat.messages?.find(m => m.id === readMessageId);
          const readAt = readMessage?.created_at;
          
          const isUnread = lastMessage && 
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
                    {partner?.id && (
                      <PresenceIndicator 
                        userId={partner.id} 
                        className="absolute bottom-0 right-0 w-2.5 h-2.5" 
                      />
                    )}
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
                          (Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0 ? '📎 Медіа' : 'Немає повідомлень')}
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
                  onClick={() => setChatToDelete(chat.id)}
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10 gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete Chat
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <ConfirmationDialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
        title="Delete Chat"
        description="Are you sure? This action cannot be undone."
        onConfirm={() => {
          if (chatToDelete) {
            deleteChat.mutate(chatToDelete);
            setChatToDelete(null);
          }
        }}
        isLoading={deleteChat.isPending}
      />
    </>
  );
}
