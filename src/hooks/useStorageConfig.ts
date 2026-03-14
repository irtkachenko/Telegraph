'use client';
import { useQuery } from '@tanstack/react-query';

interface BucketConfig {
  name: string;
  public: boolean;
  createdAt: string;
}

interface StorageLimits {
  maxFileSize: string;
  allowedTypes: string[];
  signedUrlExpiry: number;
}

export interface StorageConfig {
  buckets: BucketConfig[];
  limits: StorageLimits;
}

export function useStorageConfig() {
  return useQuery({
    queryKey: ['storage-config'],
    queryFn: async (): Promise<StorageConfig> => {
      const response = await fetch('/api/storage/config');
      if (!response.ok) {
        throw new Error('Failed to fetch storage config');
      }
      const data = await response.json();
      return data;
    },
    staleTime: 1000 * 60 * 30, // Кеш на 30 хв
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
