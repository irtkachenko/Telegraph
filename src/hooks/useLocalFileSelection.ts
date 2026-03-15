'use client';

// NOTE: Deprecated. This hook is currently unused in the app.
// Kept for reference and potential future reuse.

import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { storageApi } from '@/services';
import { getMaxFilesPerMessage } from '@/config/upload.config';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, NetworkError, ValidationError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';
import { useStorageLimits } from './useDynamicStorageConfig';

export interface SelectedFile {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'file';
  metadata: {
    name: string;
    size: number;
    width?: number;
    height?: number;
  };
}

// Compatible interface for ComposerAddons component
export interface PendingAttachment extends SelectedFile {
  url: string;
  uploading: boolean;
  error?: string;
}

export function useLocalFileSelection() {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const { user } = useSupabaseAuth();
  const { validateFile: validateFileWithLimits } = useStorageLimits();

  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      selectedFiles.forEach((file) => {
        URL.revokeObjectURL(file.previewUrl);
      });
    };
  }, [selectedFiles]);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const validation = validateFileWithLimits(file);
    if (!validation.valid) {
      throw new ValidationError(
        validation.error || 'Invalid file',
        'file',
        'FILE_VALIDATION_ERROR',
        400,
      );
    }

    return validation;
  };

  const addFiles = async (files: FileList | File[]) => {
    if (!user) {
      handleError(
        new AuthError('You must be logged in to select files', 'FILE_SELECT_AUTH_REQUIRED', 401),
        'LocalFileSelection',
      );
      return;
    }

    const fileArray = Array.from(files);

    // Check total file count limit
    const currentFileCount = selectedFiles.length;
    const maxFiles = getMaxFilesPerMessage();
    if (currentFileCount + fileArray.length > maxFiles) {
      handleError(
        new ValidationError(
          `Cannot select more than ${maxFiles} files`,
          'fileCount',
          'FILE_COUNT_LIMIT',
          400,
        ),
        'LocalFileSelection',
      );
      return;
    }

    // Validate each file
    const validFiles: SelectedFile[] = [];
    for (const file of fileArray) {
      const validation = validateFile(file);
      if (!validation.valid) {
        handleError(
          new ValidationError(
            validation.error || 'Invalid file',
            file.name,
            'FILE_VALIDATION_ERROR',
            400,
          ),
          'LocalFileSelection',
        );
        continue;
      }

      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image/');

      let metadata: SelectedFile['metadata'] = {
        name: file.name,
        size: file.size,
      };

      // For images, try to get dimensions
      if (isImage) {
        try {
          const dimensions = await getImageDimensions(file);
          metadata = { ...metadata, width: dimensions.width, height: dimensions.height };
        } catch (error) {
          console.warn('Could not get image dimensions:', error);
        }
      }

      validFiles.push({
        id,
        file,
        previewUrl,
        type: isImage ? 'image' : 'file',
        metadata,
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearFiles = () => {
    selectedFiles.forEach((file) => {
      URL.revokeObjectURL(file.previewUrl);
    });
    setSelectedFiles([]);
  };

  const uploadFiles = async (chatId: string): Promise<Attachment[]> => {
    if (!user) {
      throw new AuthError('You must be logged in to upload files', 'UPLOAD_AUTH_REQUIRED', 401);
    }

    const uploadedAttachments: Attachment[] = [];

    for (const selectedFile of selectedFiles) {
      try {
        // Form safe filename
        const timestamp = Date.now();
        const safeName = selectedFile.file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        const fileName = `${timestamp}_${safeName}`;

        // Important path structure for RLS policy
        const filePath = `${chatId}/${user.id}/${fileName}`;

        let fileToUpload: File | Blob = selectedFile.file;

        // Compress images if needed
        if (selectedFile.type === 'image' && selectedFile.file.size > 1024 * 1024) {
          try {
            const imageCompression = (await import('browser-image-compression')).default;
            fileToUpload = await imageCompression(selectedFile.file, {
              maxSizeMB: 0.8,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
          } catch (e) {
            console.warn('Image compression failed, uploading original:', e);
          }
        }

        // Upload to Supabase Storage через API
        await storageApi.uploadFile('attachments', filePath, fileToUpload as File, {
          cacheControl: '3600',
          upsert: false,
        });

        // Get public URL через API
        const publicUrl = await storageApi.getPublicUrl('attachments', filePath);

        const attachment: Attachment = {
          id: selectedFile.id,
          type: selectedFile.type,
          url: publicUrl,
          metadata: {
            ...selectedFile.metadata,
            size: fileToUpload.size, // Use actual uploaded size
          },
        };

        uploadedAttachments.push(attachment);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        const appError =
          error instanceof ValidationError
            ? error
            : new NetworkError(errorMessage, selectedFile.file.name, 'FILE_UPLOAD_ERROR', 500);
        handleError(appError, 'LocalFileSelection');
        // Continue with other files even if one fails
      }
    }

    return uploadedAttachments;
  };

  return {
    selectedFiles,
    addFiles,
    removeFile,
    clearFiles,
    uploadFiles,
    hasFiles: selectedFiles.length > 0,
  };
}

// Helper function to get image dimensions
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
