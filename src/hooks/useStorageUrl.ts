import { useState } from 'react';
import { isPrivateBucket, type StorageConfig, storageConfig } from '@/config/storage.config';
import { storageApi } from '@/api';

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
    return await storageApi.getPublicUrl(bucket, path, options);
  };

  const getSignedUrl = async (
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string> => {
    return await storageApi.getSignedUrl(bucket, path, options);
  };

  const getUrl = async (
    bucket: string,
    path: string,
    options?: SignedUrlOptions,
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      return await storageApi.getUrl(bucket, path, options);
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
  return await storageApi.getUrl(bucket, path, options);
}
