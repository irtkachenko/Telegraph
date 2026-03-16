'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { storageConfig } from '@/config/storage.config';
import { getMaxFilesPerMessage } from '@/config/upload.config';
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
 * Hook for working with files without instant upload
 * Files are prepared for sending, but uploaded only when message is sent
 */
export function useOptimisticAttachmentLazy() {
  const [attachments, setAttachments] = useState<LazyAttachment[]>([]);
  const { user } = useSupabaseAuth();
  const { validateFile, validateFiles } = useStorageLimits();
  
  
  // Constants for limits
  const MAX_FILES_PER_MESSAGE = getMaxFilesPerMessage();
  // Note: max total size comes from Supabase Storage API via useStorageLimits

  // Cleanup preview URLs on component unmount
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
        new AuthError('You are not authorized', 'UPLOAD_AUTH_REQUIRED', 401),
        'OptimisticAttachmentLazy',
      );
      return null;
    }

    // File validation
    const validation = validateFile(file);
    if (!validation.valid) {
      handleError(
        new ValidationError(
          validation.error || 'File validation error',
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

    // Determine file type based on MIME type
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

    // Check each file individually
    for (const file of files) {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    // Check limits WHEN ADDING files
    const currentFilesCount = attachments.length;
    const currentTotalSize = attachments.reduce((sum, a) => sum + a.metadata.size, 0);

    const allowedFiles: File[] = [];
    const rejectedFiles: File[] = [];

    // Calculate how many files can be added
    const remainingSlots = MAX_FILES_PER_MESSAGE - currentFilesCount;
    // Note: max total size comes from Supabase Storage API via useStorageLimits
    // For now, use the same default as in useDynamicStorageConfig
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB
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

    // Show errors about exceeded limits
    if (rejectedFiles.length > 0) {
      const rejectedNames = rejectedFiles.map((f) => f.name).join(', ');
      toast.error(
        `Too many files! Maximum ${getMaxFilesPerMessage()} files per message. Not added: ${rejectedNames}`,
      );
    }

    if (errors.length > 0) {
      toast.error(`Validation errors: ${errors.join(', ')}`);
    }

    // If there are validation errors for individual files (not limits)
    if (errors.length > 0 && rejectedFiles.length === 0) {
      return [];
    }

    // Add only allowed files
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
      uploading: false, // Will be set to true when sending
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
