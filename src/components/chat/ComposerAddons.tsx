'use client';

import { X } from 'lucide-react';
import type { OptimisticAttachment } from '@/hooks/useOptimisticAttachment';
import type { Message } from '@/types';
import AttachmentPreview from './AttachmentPreview';

interface ComposerAddonsProps {
  replyTo?: Message | null;
  onReplyCancel?: () => void;
  editingMessage?: Message | null;
  onEditCancel?: () => void;
  attachments: OptimisticAttachment[];
  onAttachmentRemove: (id: string) => void;
  otherParticipantName?: string;
}

export default function ComposerAddons({
  replyTo,
  onReplyCancel,
  editingMessage,
  onEditCancel,
  attachments,
  onAttachmentRemove,
  otherParticipantName,
}: ComposerAddonsProps) {
  if (!replyTo && !editingMessage && attachments.length === 0) return null;

  return (
    <div
      className="px-4 py-3 border-t border-white/5 backdrop-blur-md bg-white/5 space-y-2"
      style={{ willChange: 'transform' }}
    >
      {/* Editing Preview */}
      {editingMessage && (
        <div className="flex items-center gap-3 py-2 border-s-4 border-amber-500 px-3 bg-amber-500/5 rounded-e-lg relative group">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-400">Editing message</p>
            <p className="text-sm text-gray-300 truncate">{editingMessage.content}</p>
          </div>
          <button
            type="button"
            onClick={onEditCancel}
            className="p-1 hover:bg-white/10 rounded-full text-gray-400 transition-colors duration-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="flex items-center gap-3 py-2 border-s-4 border-blue-500 px-3 bg-blue-500/5 rounded-e-lg relative group">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-400">
              {replyTo.sender_id === 'me'
                ? 'Reply to yourself'
                : `Reply to ${otherParticipantName || 'user'}`}
            </p>
            <p className="text-sm text-gray-300 truncate">{replyTo.content}</p>
          </div>
          <button
            type="button"
            onClick={onReplyCancel}
            className="p-1 hover:bg-white/10 rounded-full text-gray-400 transition-colors duration-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              onRemove={onAttachmentRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
