import { supabase } from '@/lib/supabase/client';
import { isPrivateBucket, type StorageConfig, storageConfig } from '@/config/storage.config';
import type { Attachment } from '@/types';

interface SignedUrlOptions {
  expiresIn?: number;
  download?: string;
  transform?: Record<string, string>;
}

export const storageApi = {
  /**
   * Отримання публічного URL
   */
  getPublicUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
        download: options?.download,
        transform: options?.transform,
      });
      return data.publicUrl;
    } catch (err) {
      throw new Error(`Failed to get public URL for ${bucket}/${path}: ${err}`);
    }
  },

  /**
   * Отримання signed URL для приватних файлів
   */
  getSignedUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    try {
      const { data, error: signedUrlError } = supabase.storage
        .from(bucket)
        .createSignedUrl(path, options?.expiresIn ?? 3600, {
          download: options?.download,
          transform: options?.transform,
        });

      if (signedUrlError) {
        throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
      }

      return data.signedUrl;
    } catch (err) {
      throw new Error(`Failed to get signed URL for ${bucket}/${path}: ${err}`);
    }
  },

  /**
   * Автоматичне визначення типу URL (публічний або signed)
   */
  getUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    try {
      if (isPrivateBucket(bucket)) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, options?.expiresIn ?? storageConfig.defaultSignedUrlExpiry, {
            download: options?.download,
            transform: options?.transform,
          });

        if (error) {
          throw new Error(`Failed to create signed URL: ${error.message}`);
        }

        return data.signedUrl;
      } else {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
          download: options?.download,
          transform: options?.transform,
        });

        return data.publicUrl;
      }
    } catch (err) {
      throw new Error(`Failed to get URL for ${bucket}/${path}: ${err}`);
    }
  },

  /**
   * Завантаження файлу
   */
  uploadFile: async (bucket: string, path: string, file: File, options?: {
    cacheControl?: string;
    upsert?: boolean;
  }) => {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: options?.cacheControl || '3600',
      upsert: options?.upsert || false,
    });

    if (error) throw error;
  },

  /**
   * Завантаження attachment з оптимістичним оновленням
   */
  uploadAttachment: async (file: File, chatId: string, userId: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${chatId}/${userId}/${fileName}`;

    // Завантажуємо файл
    await storageApi.uploadFile('attachments', filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

    // Отримуємо пряме посилання
    const publicUrl = await storageApi.getPublicUrl('attachments', filePath);

    const attachment: Attachment = {
      id: `temp-${Date.now()}`,
      url: publicUrl,
      type: file.type.startsWith('image/') ? 'image' : 
            file.type.startsWith('video/') ? 'video' : 'file',
      is_deleted: false,
      metadata: {
        name: file.name,
        size: file.size,
      },
    };

    return attachment;
  },

  /**
   * Отримання динамічної конфігурації storage
   */
  getStorageConfig: async (): Promise<StorageConfig> => {
    const { data, error } = await supabase
      .from('storage_configs')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || storageConfig;
  },
};
