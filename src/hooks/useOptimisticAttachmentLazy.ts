'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { isAllowedFileExtension, storageConfig } from '@/config/storage.config';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, ValidationError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';
import { useStorageLimits } from './useDynamicStorageConfig';
import { usePerformanceMonitor } from '@/lib/performance';

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
  
  // Performance monitoring
  usePerformanceMonitor('useOptimisticAttachmentLazy');

  // Константи для лімітів
  const MAX_FILES_PER_MESSAGE = 4; // Змінено на 4 файли
  const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB

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
    const validFiles: File[] = [];
    const errors: string[] = [];

    // Перевіряємо кожен файл окремо
    for (const file of files) {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    // Перевіряємо ліміти ПРИ ДОДАВАННІ файлів
    const currentFilesCount = attachments.length;
    const currentTotalSize = attachments.reduce((sum, a) => sum + a.metadata.size, 0);

    const allowedFiles: File[] = [];
    const rejectedFiles: File[] = [];

    // Розраховуємо скільки файлів можна додати
    const remainingSlots = MAX_FILES_PER_MESSAGE - currentFilesCount;
    const remainingSize = MAX_TOTAL_SIZE - currentTotalSize;

    let addedSize = 0;
    for (const file of validFiles) {
      if (allowedFiles.length >= remainingSlots || addedSize + file.size > remainingSize) {
        rejectedFiles.push(file);
      } else {
        allowedFiles.push(file);
        addedSize += file.size;
      }
    }

    // Показуємо помилки про перевищення лімітів
    if (rejectedFiles.length > 0) {
      const rejectedNames = rejectedFiles.map((f) => f.name).join(', ');
      toast.error(
        `Забагато файлів! Максимально 4 файли на повідомлення. Не додано: ${rejectedNames}`,
      );
    }

    if (errors.length > 0) {
      toast.error(`Помилки валідації: ${errors.join(', ')}`);
    }

    // Якщо є помилки валідації окремих файлів (не ліміти)
    if (errors.length > 0 && rejectedFiles.length === 0) {
      return [];
    }

    // Додаємо тільки дозволені файли
    if (allowedFiles.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(allowedFiles.map((file) => addFile(file)));
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
