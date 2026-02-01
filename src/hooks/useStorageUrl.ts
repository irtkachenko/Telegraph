import { useState } from 'react';
import { isPrivateBucket, type StorageConfig, storageConfig } from '@/config/storage.config';
import { supabase } from '@/lib/supabase/client';

interface SignedUrlOptions {
  expiresIn?: number; // Default: from config
  download?: string;
  transform?: Record<string, string>;
}

interface UseStorageUrlReturn {
  getPublicUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  getSignedUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  getUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for handling storage URLs with automatic detection of private vs public buckets
 * Private buckets will use signed URLs, public buckets will use public URLs
 */
export function useStorageUrl(): UseStorageUrlReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getPublicUrl = async (
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string> => {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
        download: options?.download,
        transform: options?.transform,
      });

      return data.publicUrl;
    } catch (err) {
      throw new Error(`Failed to get public URL for ${bucket}/${path}: ${err}`);
    }
  };

  const getSignedUrl = async (
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string> => {
    try {
      const { data, error: signedUrlError } = supabase.storage
        .from(bucket)
        .createSignedUrl(path, options?.expiresIn ?? 3600, {
          download: options?.download,
          transform: options?.transform,
        });

      if (signedUrlError) {
        throw signedUrlError;
      }

      if (!data?.signedUrl) {
        throw new Error('No signed URL returned from Supabase');
      }

      return data.signedUrl;
    } catch (err) {
      throw new Error(`Failed to create signed URL for ${bucket}/${path}: ${err}`);
    }
  };

  const getUrl = async (
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      if (isPrivateBucket(bucket)) {
        return await getSignedUrl(bucket, path, {
          expiresIn: options?.expiresIn ?? storageConfig.defaultSignedUrlExpiry,
          ...options,
        });
      } else {
        return await getPublicUrl(bucket, path, options);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    getPublicUrl,
    getSignedUrl,
    getUrl,
    isLoading,
    error,
  };
}

export async function getStorageUrl(
  bucket: string,
  path: string,
  options?: SignedUrlOptions,
): Promise<string> {
  try {
    if (isPrivateBucket(bucket)) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, options?.expiresIn ?? storageConfig.defaultSignedUrlExpiry, {
          download: options?.download,
          transform: options?.transform,
        });

      if (error) {
        throw error;
      }

      if (!data?.signedUrl) {
        throw new Error('No signed URL returned from Supabase');
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
}
