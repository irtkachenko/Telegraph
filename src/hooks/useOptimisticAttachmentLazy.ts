'use client';

import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isAllowedFileExtension, storageConfig } from '@/config/storage.config';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, ValidationError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';
import { useStorageLimits } from './useDynamicStorageConfig';

export interface LazyAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'file';
  metadata: { name: string; size: number };
  error?: string;
}

/**
 * Хук для роботи з файлами без миттєвого завантаження
 * Файли готуються до відправки, але завантажуються тільки при відправці повідомлення
 */
export function useOptimisticAttachmentLazy() {
  const [attachments, setAttachments] = useState<LazyAttachment[]>([]);
  const { user } = useSupabaseAuth();
  const { validateFile, validateFiles } = useStorageLimits();

  // Очищення URL-прев'ю при розмонтуванні компонента
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, [attachments]);

  const addFile = async (file: File): Promise<LazyAttachment | null> => {
    if (!user) {
      handleError(
        new AuthError('Ви не авторизовані', 'UPLOAD_AUTH_REQUIRED', 401),
        'OptimisticAttachmentLazy',
      );
      return null;
    }

    // Валідація файлу
    const validation = validateFile(file);
    if (!validation.valid) {
      handleError(
        new ValidationError(
          validation.error || 'Помилка валідації файлу',
          'file',
          'FILE_VALIDATION_ERROR',
          400,
        ),
        'OptimisticAttachmentLazy',
      );
      return null;
    }

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

    const newAttachment: LazyAttachment = {
      id,
      file,
      previewUrl,
      type,
      metadata: { name: file.name, size: file.size },
    };

    setAttachments((prev) => [...prev, newAttachment]);
    return newAttachment;
  };

  const addFiles = async (files: File[]): Promise<LazyAttachment[]> => {
    // Валідація групи файлів
    const groupValidation = validateFiles(files);
    if (!groupValidation.valid) {
      handleError(
        new ValidationError(
          groupValidation.error || 'Помилка валідації файлів',
          'files',
          'FILES_VALIDATION_ERROR',
          400,
        ),
        'OptimisticAttachmentLazy',
      );
      return [];
    }

    const results = await Promise.allSettled(files.map((file) => addFile(file)));

    return results
      .filter(
        (result): result is PromiseFulfilledResult<LazyAttachment> =>
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

  const getFilesForUpload = (): File[] => {
    return attachments.map((a) => a.file);
  };

  const getOptimisticAttachments = (): Attachment[] => {
    return attachments.map(({ file, previewUrl, ...attachment }) => ({
      ...attachment,
      url: previewUrl,
      uploading: false, // Буде встановлено в true при відправці
    }));
  };

  const hasAttachments = attachments.length > 0;
  const totalSize = attachments.reduce((sum, a) => sum + a.metadata.size, 0);

  return {
    attachments,
    addFile,
    addFiles,
    removeAttachment,
    clearAttachments,
    getFilesForUpload,
    getOptimisticAttachments,
    hasAttachments,
    totalSize,
  };
}
