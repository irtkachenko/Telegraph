import React, { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Linkify from 'linkify-react';
import { Check, CheckCheck, Clock, Download, Edit, FileIcon, Reply, Trash2 } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { formatMessageDate } from '@/lib/date-utils';
import { isValidUrlForLinkify } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import MessageMediaGrid from './MessageMediaGrid';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string | undefined;
  isRead?: boolean;
  isEditing?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  isHighlighed?: boolean;
  otherParticipantName?: string;
}

const MessageBubble = memo(({
  message,
  currentUserId,
  isRead,
  isEditing,
  onReply,
  onEdit,
  onDelete,
  onScrollToMessage,
  isHighlighed,
  otherParticipantName,
}: MessageBubbleProps) => {
  // Use snake_case field names consistently (native database format)
  const senderId = message.sender_id;
  const isMe = senderId === currentUserId;

  // Check if message was edited - updated_at is NULL for new messages and only set on actual edits
  const isEdited = !!message.updated_at;

  const mediaAttachments =
    message.attachments?.filter((a: any) => a.type === 'image' || a.type === 'video') || [];
  const fileAttachments = message.attachments?.filter((a: any) => a.type === 'file') || [];

  // Handle hydration mismatch by using suppressHydrationWarning for date formatting
  const formattedDate = formatMessageDate(message.created_at);

  return (
    <motion.div
      id={`message-${message.id}`}
      data-highlighted={isHighlighed}
      layout
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex w-full mb-3 px-2.5 sm:px-4 transition-all duration-500 relative',
        isMe ? 'justify-end' : 'justify-start',
      )}
    >
      {/* Highlight overlay */}
      <AnimatePresence>
        {isHighlighed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-blue-500/30 rounded-lg pointer-events-none"
            style={{
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
            }}
          />
        )}
      </AnimatePresence>
      <ContextMenu>
        <ContextMenuTrigger className="max-w-[88%] sm:max-w-[70%] lg:max-w-[60%] min-w-0 block">
          <div className={cn('flex flex-col min-w-0 w-full', isMe ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'relative px-4 py-2.5 shadow-2xl border min-w-0 max-w-full flex flex-col transition-all duration-300',
                isMe
                  ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm border-blue-400/50'
                  : 'bg-neutral-900/80 backdrop-blur-md text-gray-100 rounded-2xl rounded-tl-sm border-white/10',
                mediaAttachments.length > 0 && !message.content ? 'p-1.5 bg-neutral-900/50' : '',
                isEditing && 'ring-2 ring-blue-400/50 ring-offset-2 ring-offset-background',
              )}
              style={{ willChange: 'transform' }}
            >
              {/* Reply Context */}
              {(() => {
                const rId = message.reply_to_id;
                if (!rId) return null;

                const reply = message.reply_details || message.reply_to;
                if (!reply) return null;

                const replySenderId = reply.sender_id;

                const senderName =
                  reply.sender?.name ||
                  (replySenderId === currentUserId ? 'You' : otherParticipantName);

                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onScrollToMessage(reply.id);
                    }}
                    className="mb-2 w-full flex flex-col items-start px-2 py-1 rounded-md bg-black/20 border-l-2 border-blue-400/50 cursor-pointer hover:bg-black/40 transition-colors text-[11px] text-left overflow-hidden min-w-0"
                  >
                    <span className="font-bold text-blue-300 mb-0.5 truncate w-full block">
                      {senderName || 'Unknown'}
                    </span>
                    <span className="text-white/60 line-clamp-1 italic">
                      {reply.content || (reply.attachments?.length ? '📎 Attachment' : '...')}
                    </span>
                  </button>
                );
              })()}

              {mediaAttachments.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-1 w-full">
                  <MessageMediaGrid items={mediaAttachments} />
                </div>
              )}

              {message.content && (
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-all sm:break-words block w-full max-w-full overflow-hidden min-w-0">
                  <Linkify
                    options={{
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      className:
                        'text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors cursor-pointer',
                      validate: {
                        url: isValidUrlForLinkify,
                      },
                    }}
                  >
                    {message.content}
                  </Linkify>
                </div>
              )}

              {fileAttachments.length > 0 && (
                <div className="mt-2 space-y-1.5 w-full min-w-0">
                  {fileAttachments.map((file: any) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-black/30 hover:bg-black/40 transition-all border border-white/5 w-full min-w-0 group"
                    >
                      <div className="p-2 bg-blue-500/10 group-hover:bg-blue-500/20 rounded-lg shrink-0 transition-colors">
                        <FileIcon className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-medium text-blue-100 truncate w-full block">
                          {file.metadata?.name || 'File'}
                        </p>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">
                          {file.metadata?.size
                            ? `${(file.metadata.size / 1024 / 1024).toFixed(2)} MB`
                            : 'Size unknown'}
                        </p>
                      </div>
                      <Download className="w-4 h-4 text-white/20 group-hover:text-white/50 shrink-0 transition-colors" />
                    </a>
                  ))}
                </div>
              )}

              <div
                className={cn(
                  'flex items-center justify-end gap-1 mt-1.5 select-none w-full',
                  isMe ? 'text-blue-100/50' : 'text-white/40',
                  message.is_optimistic && 'opacity-70',
                )}
              >
                <span className="text-[9px] font-medium" suppressHydrationWarning>
                  {formattedDate}
                </span>

                {isEdited && (
                  <span className="text-[10px] text-gray-400/70 ml-1 font-medium">(edited)</span>
                )}

                {message.is_optimistic ? (
                  <div className="flex items-center ml-1">
                    <Clock className="w-3 h-3 text-blue-300/60" strokeWidth={2} />
                  </div>
                ) : (
                  isMe && (
                    <div className="flex items-center ml-1">
                      <AnimatePresence mode="wait">
                        {isRead ? (
                          <motion.div
                            key="read"
                            initial={{ opacity: 0, scale: 0.5, rotate: -15 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{
                              type: 'spring',
                              stiffness: 500,
                              damping: 30,
                            }}
                          >
                            <CheckCheck className="w-3 h-3 text-blue-400" strokeWidth={3} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="sent"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Check className="w-3 h-3 text-blue-100/40" strokeWidth={3} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => onReply(message)} className="gap-2">
            <Reply className="w-4 h-4" /> Reply
          </ContextMenuItem>
          {isMe && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onEdit(message)} className="gap-2">
                <Edit className="w-4 h-4" /> Edit Message
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  onDelete(message.id);
                }}
                className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" /> Delete Message
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </motion.div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
