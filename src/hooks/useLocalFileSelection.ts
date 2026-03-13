'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { fileUploadSchema, singleFileSchema } from '@/lib/validations/chat';
import type { Attachment } from '@/types';

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
  const supabase = createClient();

  // Clean up preview URLs when component unmounts
  useEffect(() => {
    return () => {
      selectedFiles.forEach((file) => {
        URL.revokeObjectURL(file.previewUrl);
      });
    };
  }, [selectedFiles]);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Validate individual file using Zod schema
    const fileValidation = singleFileSchema.safeParse({
      file,
      maxSize: 5 * 1024 * 1024, // 5MB
    });

    if (!fileValidation.success) {
      const errorMessages = fileValidation.error.issues.map((err: { message: string }) => err.message).join(', ');
      return { valid: false, error: errorMessages };
    }

    return { valid: true };
  };

  const addFiles = async (files: FileList | File[]) => {
    if (!user) {
      toast.error('You must be logged in to select files');
      return;
    }

    const fileArray = Array.from(files);

    // Check total file count limit (max 5 files)
    const currentFileCount = selectedFiles.length;
    if (currentFileCount + fileArray.length > 5) {
      toast.error('Cannot select more than 5 files');
      return;
    }

    // Validate each file
    const validFiles: SelectedFile[] = [];
    for (const file of fileArray) {
      const validation = validateFile(file);
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.error}`);
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
      throw new Error('You must be logged in to upload files');
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

        // Upload to Supabase Storage
        const { error } = await supabase.storage
          .from('attachments')
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) {
          if (error.message.toLowerCase().includes('rate limit')) {
            throw new Error('Rate limit exceeded: maximum 10 files per minute');
          }
          throw error;
        }

        // Get public URL
        const { data: publicData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        const attachment: Attachment = {
          id: selectedFile.id,
          type: selectedFile.type,
          url: publicData.publicUrl,
          metadata: {
            ...selectedFile.metadata,
            size: fileToUpload.size, // Use actual uploaded size
          },
        };

        uploadedAttachments.push(attachment);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        toast.error(`${selectedFile.file.name}: ${errorMessage}`);
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
