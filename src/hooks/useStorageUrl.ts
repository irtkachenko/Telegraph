import { useCallback, useRef } from 'react';
import { type StorageConfig, storageConfig } from '@/config/storage.config';
import { storageApi } from '@/services';
import { AuthError, NetworkError } from '@/shared/lib/errors';

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
  const isLoadingRef = useRef(false);
  const errorRef = useRef<Error | null>(null);

  const getPublicUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      return await storageApi.getPublicUrl(bucket, path, options);
    },
    [],
  );

  const getSignedUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      return await storageApi.getSignedUrl(bucket, path, options);
    },
    [],
  );

  const getUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      isLoadingRef.current = true;
      errorRef.current = null;

      try {
        return await storageApi.getUrl(bucket, path, options);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errorRef.current = error;
        throw new NetworkError(
          `Failed to get storage URL for ${bucket}/${path}`,
          `${bucket}/${path}`,
          'STORAGE_URL_ERROR',
          500,
        );
      } finally {
        isLoadingRef.current = false;
      }
    },
    [],
  );

  return {
    getPublicUrl,
    getSignedUrl,
    getUrl,
    isLoading: isLoadingRef.current,
    error: errorRef.current,
  };
}

export async function getStorageUrl(
  bucket: string,
  path: string,
  options?: SignedUrlOptions,
): Promise<string> {
  return await storageApi.getUrl(bucket, path, options);
}
