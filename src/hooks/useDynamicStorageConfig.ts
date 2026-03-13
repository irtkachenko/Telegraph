'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getFileTypeCategory,
  isAllowedFileExtension,
  storageConfig,
} from '@/config/storage.config';
import { storageApi } from '@/api';

interface StoragePolicies {
  maxFileSize: number;
  allowedExtensions: string[];
  rateLimitPerMinute: number;
}

// Default fallback configuration
const DEFAULT_POLICIES: StoragePolicies = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedExtensions: storageConfig.buckets.attachments.allowedExtensions,
  rateLimitPerMinute: 10,
};

export function useDynamicStorageConfig() {
  return useQuery({
    queryKey: ['storage-policies'],
    queryFn: async (): Promise<StoragePolicies> => {
      try {
        // Get storage config from API
        const config = await storageApi.getStorageConfig();
        
        // Use defaults since StorageConfig doesn't have these properties
        return DEFAULT_POLICIES;
      } catch (error) {
        console.warn('Failed to fetch storage policies, using defaults:', error);
        return DEFAULT_POLICIES;
      }
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

export function useStorageLimits() {
  const { data: policies, isLoading } = useDynamicStorageConfig();

  const getMaxFileSize = (category: 'images' | 'videos' | 'documents'): number => {
    if (!policies) return storageConfig.fileTypes[category].maxFileSize;

    // Use dynamic limit if available, otherwise fall back to config
    const categoryMaxSize = storageConfig.fileTypes[category].maxFileSize;
    return Math.min(policies.maxFileSize, categoryMaxSize);
  };

  const isAllowedExtension = (extension: string): boolean => {
    if (!policies) return isAllowedFileExtension(extension);

    const ext = extension.toLowerCase();
    return policies.allowedExtensions.includes(ext);
  };

  const getRateLimit = (): number => {
    return policies?.rateLimitPerMinute || DEFAULT_POLICIES.rateLimitPerMinute;
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!isAllowedExtension(extension)) {
      return { valid: false, error: 'Тип файлу не підтримується' };
    }

    const category = getFileTypeCategory(extension);
    if (!category) {
      return { valid: false, error: 'Невідомий тип файлу' };
    }

    const maxSize = getMaxFileSize(category);
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      return {
        valid: false,
        error: `Файл занадто великий. Максимальний розмір: ${maxSizeMB}MB`,
      };
    }

    return { valid: true };
  };

  return {
    policies,
    isLoading,
    getMaxFileSize,
    isAllowedExtension,
    getRateLimit,
    validateFile,
  };
}

// Hook for tracking upload rate limits
export function useUploadRateLimit() {
  const { getRateLimit } = useStorageLimits();
  const [uploadCount, setUploadCount] = useState(0);
  const [resetTime, setResetTime] = useState<Date | null>(null);

  const canUpload = (): boolean => {
    const rateLimit = getRateLimit();

    // Reset counter if time window has passed
    if (resetTime && new Date() > resetTime) {
      setUploadCount(0);
      setResetTime(null);
      return true;
    }

    return uploadCount < rateLimit;
  };

  const recordUpload = (): void => {
    const rateLimit = getRateLimit();

    if (!resetTime) {
      // Set reset time to 1 minute from now
      const now = new Date();
      setResetTime(new Date(now.getTime() + 60 * 1000));
    }

    setUploadCount((prev: number) => prev + 1);
  };

  const getRemainingUploads = (): number => {
    const rateLimit = getRateLimit();
    return Math.max(0, rateLimit - uploadCount);
  };

  const getTimeUntilReset = (): number => {
    if (!resetTime) return 0;
    return Math.max(0, resetTime.getTime() - new Date().getTime());
  };

  return {
    canUpload,
    recordUpload,
    getRemainingUploads,
    getTimeUntilReset,
    uploadCount,
    resetTime,
  };
}
