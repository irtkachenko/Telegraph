'use client';

import imageCompression from 'browser-image-compression';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import {
  getFileTypeCategory,
  isAllowedFileExtension,
  storageConfig,
} from '@/config/storage.config';
import { createClient } from '@/lib/supabase/client';
import type { Attachment } from '@/types';
import { useStorageLimits } from './useDynamicStorageConfig';

export interface OptimisticAttachment extends Attachment {
  file: File;
  previewUrl: string;
  uploading: boolean;
  error?: string;
  progress?: number;
}

export function useOptimisticAttachment(chatId: string) {
  const [attachments, setAttachments] = useState<OptimisticAttachment[]>([]);
  const { user } = useSupabaseAuth();
  const supabase = createClient();
  const { validateFile } = useStorageLimits();

  // Очищення URL-прев'ю при розмонтуванні компонента
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, [attachments]);

  const uploadFile = async (file: File): Promise<Attachment | null> => {
    if (!user) {
      toast.error('Ви не авторизовані');
      return null;
    }

    // Use dynamic validation instead of hardcoded checks
    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return null;
    }

    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/');

    // Формуємо чисте ім'я файлу (безпечно для URL)
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const fileName = `${timestamp}_${safeName}`;

    // Шлях ВАЖЛИВИЙ: першим має йти chatId для нашої RLS політики
    const filePath = `${chatId}/${user.id}/${fileName}`;

    const newAttachment: OptimisticAttachment = {
      id,
      type: isImage ? 'image' : 'file',
      url: '',
      metadata: { name: file.name, size: file.size },
      file,
      previewUrl,
      uploading: true,
      progress: 0,
    };

    setAttachments((prev) => [...prev, newAttachment]);

    try {
      let fileToUpload: File | Blob = file;

      // Стиснення тільки для зображень
      if (isImage && file.size > 1024 * 1024) {
        // Стискати, якщо > 1MB
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

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, progress: Math.min((a.progress || 0) + 10, 90) } : a,
          ),
        );
      }, 100);

      const { error } = await supabase.storage.from('attachments').upload(filePath, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
      });

      clearInterval(progressInterval);

      if (error) {
        // Обробка нашого SQL-тригера на ліміт 10 завантажень
        if (error.message.toLowerCase().includes('rate limit')) {
          throw new Error('Ліміт вичерпано: не більше 10 файлів на хвилину.');
        }
        throw error;
      }

      // Отримуємо пряме посилання
      const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(filePath);

      const finalAttachment: Attachment = {
        id,
        type: isImage ? 'image' : 'file',
        url: publicData.publicUrl,
        metadata: { name: file.name, size: fileToUpload.size },
      };

      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, url: publicData.publicUrl, uploading: false, progress: 100 } : a,
        ),
      );

      return finalAttachment;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Помилка завантаження';
      toast.error(errorMessage);

      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploading: false, error: errorMessage } : a)),
      );

      return null;
    }
  };

  const uploadAllFiles = async (files: File[]): Promise<Attachment[]> => {
    const uploadPromises = files.map((file) => uploadFile(file));
    const results = await Promise.allSettled(uploadPromises);

    return results
      .filter(
        (result): result is PromiseFulfilledResult<Attachment> =>
          result.status === 'fulfilled' && result.value !== null,
      )
      .map((result) => result.value);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const clearAttachments = () => {
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const getCompletedAttachments = (): Attachment[] => {
    return attachments
      .filter((a) => !a.uploading && !a.error)
      .map(({ file, previewUrl, uploading, error, progress, ...attachment }) => attachment);
  };

  const hasUploadingAttachments = attachments.some((a) => a.uploading);
  const hasFailedAttachments = attachments.some((a) => a.error);

  return {
    attachments,
    uploadFile,
    uploadAllFiles,
    removeAttachment,
    clearAttachments,
    getCompletedAttachments,
    isUploading: hasUploadingAttachments,
    hasErrors: hasFailedAttachments,
  };
}
