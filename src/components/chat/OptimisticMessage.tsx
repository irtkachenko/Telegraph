'use client';

import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Attachment, Message } from '@/types';

interface OptimisticAttachment extends Attachment {
  uploading?: boolean;
  progress?: number;
  error?: string;
  previewUrl?: string;
}

interface OptimisticMessageProps {
  message: Message & { is_optimistic?: boolean };
}

const OptimisticAttachmentComponent = memo(
  ({ attachment }: { attachment: OptimisticAttachment }) => {
    const isImage = attachment.type === 'image';
    const isUploading = attachment.uploading;
    const hasError = attachment.error;

    return (
      <div className="relative group w-24 h-24 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mb-1" />
            <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${attachment.progress || 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="absolute inset-0 z-10 bg-red-500/20 flex flex-col items-center justify-center p-2">
            <AlertCircle className="w-4 h-4 text-red-400 mb-1" />
            <span className="text-[8px] text-red-200 text-center">Error</span>
          </div>
        )}

        {/* Content */}
        {isImage ? (
          <Image
            src={attachment.previewUrl || attachment.url}
            alt={attachment.metadata.name}
            fill
            className={cn(
              'w-full h-full object-cover transition-transform group-hover:scale-105',
              isUploading && 'opacity-50',
            )}
            unoptimized
          />
        ) : (
          <div className="flex flex-col items-center gap-1 p-2">
            <div
              className={cn(
                'w-8 h-8 rounded flex items-center justify-center',
                isUploading ? 'bg-gray-600' : 'bg-blue-500/20',
              )}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              ) : (
                <div className="w-3 h-3 bg-blue-400 rounded-sm" />
              )}
            </div>
            <span className="text-[8px] text-gray-400 truncate w-full text-center">
              {attachment.metadata.name}
            </span>
          </div>
        )}

        {/* File size indicator */}
        <div className="absolute bottom-1 right-1 text-[8px] text-black/60 bg-white/80 px-1 rounded">
          {(attachment.metadata.size / 1024).toFixed(1)}KB
        </div>
      </div>
    );
  },
);

OptimisticAttachmentComponent.displayName = 'OptimisticAttachmentComponent';

interface OptimisticMessageProps {
  message: Message & { is_optimistic?: boolean };
}

export function OptimisticMessage({ message }: OptimisticMessageProps) {
  const isOptimistic = message.is_optimistic;
  const hasUploadingAttachments = message.attachments?.some((att: OptimisticAttachment) => att.uploading);
  const hasFailedAttachments = message.attachments?.some((att: OptimisticAttachment) => att.error);

  return (
    <div
      className={cn(
        'group flex gap-3 p-3 rounded-lg transition-all duration-200',
        isOptimistic && 'bg-blue-500/5 border border-blue-500/20',
        hasFailedAttachments && 'bg-red-500/5 border border-red-500/20',
      )}
    >
      {/* Status Indicator */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
            isOptimistic && 'bg-blue-500 text-white',
            hasFailedAttachments && 'bg-red-500 text-white',
            !isOptimistic && 'bg-gray-600 text-gray-300',
          )}
        >
          {isOptimistic ? (
            hasUploadingAttachments ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : hasFailedAttachments ? (
              <X className="w-4 h-4" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin" />
            )
          ) : (
            <Check className="w-4 h-4" />
          )}
        </div>

        {/* Status Text */}
        <div className="text-[10px] text-gray-500 mt-1 text-center">
          {isOptimistic
            ? hasUploadingAttachments
              ? 'Uploading'
              : hasFailedAttachments
                ? 'Failed'
                : 'Sending'
            : 'Sent'}
        </div>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* Message Text */}
        {message.content && (
          <div
            className={cn(
              'text-sm mb-2',
              isOptimistic && 'text-blue-200',
              hasFailedAttachments && 'text-red-200',
            )}
          >
            {message.content}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((attachment) => (
              <OptimisticAttachmentComponent
                key={attachment.id}
                attachment={attachment as OptimisticAttachment}
              />
            ))}
          </div>
        )}

        {/* Error Message */}
        {hasFailedAttachments && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 p-2 rounded">
            <AlertCircle className="w-3 h-3" />
            <span>Some attachments failed to upload</span>
          </div>
        )}

        {/* Upload Progress Summary */}
        {hasUploadingAttachments && (
          <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 p-2 rounded">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>
              Uploading {message.attachments?.filter((att: OptimisticAttachment) => att.uploading).length} file(s)...
            </span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-[10px] text-gray-500">
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}

export default memo(OptimisticMessage);
