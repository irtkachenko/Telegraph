'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isAllowedFileExtension } from '@/utils/file-validation';
import { useStorageLimits } from '@/hooks/useDynamicStorageConfig';
import { messagesApi, storageApi } from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, NetworkError, ValidationError } from '@/shared/lib/errors';
import type { Attachment, Message } from '@/types';

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'file';
  metadata: { name: string; size: number };
}

interface SendMessageWithFilesParams {
  content: string;
  files: File[];
  reply_to_id?: string;
}

/**
 * Хук для паралельної відправки повідомлень з файлами
 */
export function useSendMessageWithFiles(chatId: string) {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const { validateFile } = useStorageLimits();

  return useMutation({
    mutationFn: async ({ content, files, reply_to_id }: SendMessageWithFilesParams) => {
      if (!user) throw new AuthError('Ви не авторизовані', 'SEND_MESSAGE_AUTH_REQUIRED', 401);

      // Перевірка чи є що відправляти
      if (!content.trim() && files.length === 0) {
        throw new ValidationError(
          'Повідомлення не може бути порожнім',
          'content',
          'EMPTY_MESSAGE',
          400,
        );
      }

      // Валідація файлів
      const validatedFiles: File[] = [];
      const pendingAttachments: PendingAttachment[] = [];

      for (const file of files) {
        const validation = validateFile(file);
        if (!validation.valid) {
          throw new ValidationError(
            validation.error || 'Помилка валідації файлу',
            'file',
            'FILE_VALIDATION_ERROR',
            400,
          );
        }
        validatedFiles.push(file);

        // Створюємо pending attachment для оптимістичного UI
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        // Визначаємо тип файлу на основі MIME типу
        let type: 'image' | 'video' | 'file';
        if (file.type.startsWith('image/')) {
          type = 'image';
        } else if (file.type.startsWith('video/')) {
          type = 'video';
        } else {
          type = 'file';
        }

        pendingAttachments.push({
          id,
          file,
          previewUrl,
          type,
          metadata: { name: file.name, size: file.size },
        });
      }

      // Паралельне завантаження файлів спочатку
      const uploadOperations = validatedFiles.map((file) =>
        uploadFileOptimized(file, chatId, user.id),
      );
      const uploadResults = await Promise.allSettled(uploadOperations);

      // Обробка результатів завантаження файлів
      const successfulUploads: Attachment[] = [];
      const failedUploads: { file: File; error: Error }[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          // Переконуємось що результат є типом Attachment
          const uploadResult = result.value;
          if (
            uploadResult &&
            typeof uploadResult === 'object' &&
            'id' in uploadResult &&
            'url' in uploadResult
          ) {
            successfulUploads.push(uploadResult as Attachment);
          }
        } else {
          failedUploads.push({ file: validatedFiles[index], error: result.reason });
        }
      });

      // Якщо всі файли не завантажились і немає тексту, не відправляємо повідомлення
      if (successfulUploads.length === 0 && !content.trim()) {
        throw new ValidationError('Не вдалося завантажити файли', 'files', 'UPLOAD_FAILED', 500);
      }

      // Відправляємо повідомлення тільки з успішно завантаженими файлами
      const messagePayload = {
        sender_id: user.id,
        content: content.trim(),
        reply_to_id: reply_to_id || undefined,
        attachments: successfulUploads, // Тільки реальні завантажені файли
      };

      const savedMessage = await messagesApi.sendMessage(chatId, messagePayload);

      // Очищення preview URLs
      pendingAttachments.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));

      // Повідомляємо про помилки завантаження файлів
      if (failedUploads.length > 0) {
        const errorMessages = failedUploads
          .map(({ file, error }) => {
            const errorCode =
              error && typeof error === 'object' && 'status' in error
                ? (error.status as number)
                : 500;
            const errorType =
              errorCode === 400
                ? 'Неправильний формат файлу'
                : errorCode === 413
                  ? 'Файл занадто великий'
                  : 'Помилка завантаження';
            return `${file.name}: ${errorType} (${errorCode})`;
          })
          .join(', ');

        toast.error(`Помилка завантаження файлів: ${errorMessages}`);
      }

      // Оновлюємо повідомлення з успішно завантаженими файлами
      if (successfulUploads.length > 0) {
        // Оновлюємо повідомлення в базі даних з реальними attachments
        // Це може бути зроблено через окремий API виклик або повернення оновленого повідомлення
      }

      // Повертаємо повідомлення з реальними attachments
      return {
        message: savedMessage,
        uploadedFiles: successfulUploads,
        failedFiles: failedUploads,
      };
    },

    onMutate: async ({ content, files, reply_to_id }) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      // Знаходимо батьківське повідомлення для реплаю
      const allMessages = (previousData as InfiniteData<Message[]>)?.pages?.flat() || [];
      const parentMessage = reply_to_id ? allMessages.find((m) => m.id === reply_to_id) : null;

      // Створюємо оптимістичні attachments
      const optimisticAttachments: Attachment[] = files.map((file) => {
        const id = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);

        // Визначаємо тип файлу на основі MIME типу
        let type: 'image' | 'video' | 'file';
        if (file.type.startsWith('image/')) {
          type = 'image';
        } else if (file.type.startsWith('video/')) {
          type = 'video';
        } else {
          type = 'file';
        }

        return {
          id,
          type,
          url: previewUrl,
          metadata: { name: file.name, size: file.size },
          uploading: true,
        } as Attachment;
      });

      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        sender_id: user?.id,
        chat_id: chatId,
        created_at: new Date().toISOString(),
        updated_at: null,
        reply_to_id: reply_to_id || null,
        reply_to: parentMessage,
        attachments: optimisticAttachments,
        is_optimistic: true,
      } as Message;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
        const newPages = [...old.pages];
        newPages[newPages.length - 1] = [...newPages[newPages.length - 1], optimisticMessage];
        return { ...old, pages: newPages };
      });

      return { previousData, optimisticAttachments };
    },

    onError: (error: Error & { status?: number }, variables, context) => {
      handleError(
        new AuthError(error.message, 'SEND_MESSAGE_ERROR', error.status || 500),
        'SendMessageWithFiles',
      );

      // Очищення preview URLs при помилці
      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      // Rollback оптимістичних змін
      queryClient.setQueryData(['messages', chatId], context?.previousData);
    },

    onSuccess: (result, variables, context) => {
      const { message, uploadedFiles, failedFiles } = result;

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((msg) => {
              // Замінюємо оптимістичне повідомлення на реальне
              if (msg.id.toString().startsWith('temp-') && msg.content === message.content) {
                // Використовуємо тільки реальні attachments з повідомлення
                return message;
              }
              return msg;
            }),
          ),
        };
      });

      // Очищення preview URLs
      context?.optimisticAttachments?.forEach((attachment: Attachment) => {
        if (attachment.url?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.url);
        }
      });

      // Показуємо toast про результат
      if (failedFiles.length === 0) {
        toast.success('Повідомлення відправлено');
      } else {
        const failedFileNames = failedFiles.map((f) => f.file.name).join(', ');
        toast.warning(`Повідомлення відправлено, але файли не завантажено: ${failedFileNames}`);
      }
    },
  });
}

/**
 * Оптимізоване завантаження файлу з компресією зображень
 */
async function uploadFileOptimized(
  file: File,
  chatId: string,
  userId: string,
): Promise<Attachment> {
  try {
    let fileToUpload: File | Blob = file;

    // Стиснення тільки для зображень
    if (file.type.startsWith('image/') && file.size > 1024 * 1024) {
      try {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
      } catch (e) {
        console.warn('Стиснення не вдалося, вантажимо оригінал', e);
      }
    }

    // Завантажуємо файл
    const attachment = await storageApi.uploadAttachment(fileToUpload as File, chatId, userId);
    return attachment;
  } catch (error) {
    // Зберігаємо оригінальний код помилки від Supabase
    const statusCode =
      error && typeof error === 'object' && 'status' in error ? (error.status as number) : 500;

    throw new NetworkError(
      `Помилка завантаження файлу ${file.name}: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      'file-upload',
      'ATTACHMENT_UPLOAD_ERROR',
      statusCode,
    );
  }
}
