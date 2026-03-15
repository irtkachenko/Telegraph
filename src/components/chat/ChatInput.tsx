'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useEditMessage } from '@/hooks/chat';
import { useSendMessageWithFiles } from '@/hooks/chat/useSendMessageWithFiles';
import { useOptimisticAttachmentLazy } from '@/hooks/useOptimisticAttachmentLazy';
import { useStorageConfig } from '@/hooks/useStorageConfig';
import { cn } from '@/lib/utils';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Message } from '@/types';
import ComposerAddons from './ComposerAddons';

interface ChatInputProps {
  chatId: string;
  setTyping: (typing: boolean) => void;
  replyToId?: string | null;
  onReplyCancel?: () => void;
  editingMessage?: Message | null;
  onEditCancel?: () => void;
  onMessageSent?: () => void;
}

export default function ChatInput({
  chatId,
  setTyping,
  replyToId,
  onReplyCancel,
  editingMessage, // Added editingMessage prop
  onEditCancel, // Added onEditCancel prop
  onMessageSent,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const { user } = useSupabaseAuth();
  const { attachments, addFiles, removeAttachment, clearAttachments, hasAttachments } =
    useOptimisticAttachmentLazy();
  const { data: storageConfig } = useStorageConfig();

  // Використовуємо новий хук для паралельної відправки з файлами
  const sendMessageWithFiles = useSendMessageWithFiles(chatId);
  const editMessage = useEditMessage(chatId);

  // Update content when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content || '');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } else {
      setContent('');
    }
  }, [editingMessage]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Автоматична висота textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // eslint-disable-next-line react-hooks/immutability
      textarea.style.height = 'inherit';
      const scrollHeight = textarea.scrollHeight;
      // eslint-disable-next-line react-hooks/immutability
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
    // We want to adjust height whenever content changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: content is needed to trigger the effect
  }, [content, adjustTextareaHeight]);

  // Знаходимо повідомлення для реплаю в кеші
  const replyToMessage = !replyToId
    ? null
    : queryClient
        .getQueryData<InfiniteData<Message[]>>(['messages', chatId])
        ?.pages?.flat()
        .find((m) => m.id === replyToId) || null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    const hasFiles = attachments.length > 0;

    // Валідація - якщо немає ні тексту, ні файлів, не відправляємо
    if (!trimmed && !hasFiles) return;

    // 1. Очищуємо UI миттєво (для відчуття швидкості)
    setContent('');
    setTyping(false);

    // Отримуємо файли для відправки
    const filesToSend = attachments.map((a) => a.file);
    clearAttachments();

    try {
      if (editingMessage) {
        // РЕДАГУВАННЯ (файли не підтримуються при редагуванні)
        if (!trimmed) {
          toast.error('Повідомлення не може бути порожнім');
          setContent(trimmed);
          return;
        }

        await editMessage.mutateAsync({
          messageId: editingMessage.id,
          content: trimmed,
        });
        if (onEditCancel) onEditCancel();
      } else {
        // ВІДПРАВКА НОВОГО з файлами
        await sendMessageWithFiles.mutateAsync({
          content: trimmed,
          files: filesToSend,
          reply_to_id: replyToId || undefined,
        });
        // Clear reply state only after successful send
        if (onReplyCancel) onReplyCancel();
      }

      if (onMessageSent) onMessageSent();
    } catch (_error) {
      // Якщо впало — повертаємо текст назад, щоб юзер не втратив повідомлення
      handleError(
        new NetworkError('Failed to process message', 'message', 'MESSAGE_PROCESS_ERROR', 500),
        'ChatInput',
      );
      setContent(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    setTyping(content.length > 0);
  }, [content, setTyping]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      await addFiles(Array.from(files));
    }
    e.target.value = '';
  };

  const isButtonVisible = content.trim().length > 0 || hasAttachments;

  return (
    <div className="flex flex-col relative" style={{ willChange: 'transform' }}>
      <ComposerAddons
        attachments={attachments.map(({ file, previewUrl, ...attachment }) => ({
          ...attachment,
          file,
          uploading: false,
          url: previewUrl,
          previewUrl,
        }))}
        onAttachmentRemove={removeAttachment}
        replyTo={replyToMessage}
        onReplyCancel={onReplyCancel}
        editingMessage={editingMessage || null}
        onEditCancel={onEditCancel}
        otherParticipantName="Співрозмовник"
        currentUserId={user?.id}
      />

      <form onSubmit={handleSubmit} className="p-3 sm:p-4 flex gap-2 items-end">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          className="hidden"
          accept={storageConfig?.limits.allowedTypes.join(',') || 'image/*,video/*'}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 mb-0.5 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all"
          title="Додати файл"
        >
          <Paperclip size={20} />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишіть повідомлення..."
            className={cn(
              'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500',
              'focus:outline-none focus:border-blue-500/50 transition-all duration-300',
              'resize-none overflow-y-auto leading-relaxed',
            )}
            style={{ minHeight: '44px' }}
          />
        </div>

        {isButtonVisible && (
          <button
            type="submit"
            disabled={sendMessageWithFiles.isPending || (!content.trim() && !hasAttachments)}
            className="p-3 mb-0.5 rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-600/20 shrink-0"
          >
            <Send size={20} className={sendMessageWithFiles.isPending ? 'animate-pulse' : ''} />
          </button>
        )}
      </form>
    </div>
  );
}
