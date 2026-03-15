'use client';

import { useState } from 'react';
import {
  getFileTypeCategory,
  getMimeTypeCategory,
  isAllowedFileExtension,
  storageConfig,
} from '@/config/storage.config';
import { type StorageConfig, useStorageConfig } from './useStorageConfig';

interface StoragePolicies {
  maxFileSize: number;
  allowedExtensions: string[];
  rateLimitPerMinute: number;
  maxTotalSize: number; // Загальний ліміт для групи файлів
  maxFilesPerMessage: number; // Максимальна кількість файлів на повідомлення
}

// Default fallback configuration
const DEFAULT_POLICIES: StoragePolicies = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedExtensions: storageConfig.buckets.attachments.allowedExtensions,
  rateLimitPerMinute: 10,
  maxTotalSize: 100 * 1024 * 1024, // 100MB загальний ліміт на повідомлення
  maxFilesPerMessage: 4, // Змінено на 4 файли на повідомлення
};

export function useDynamicStorageConfig() {
  return useStorageConfig();
}

export function useStorageLimits() {
  const { data: config, isLoading } = useDynamicStorageConfig();

  const getMaxFileSize = (category: 'images' | 'videos' | 'documents'): number => {
    if (!config) return storageConfig.fileTypes[category].maxFileSize;

    // Convert string to bytes and use dynamic limit
    const dynamicMaxSize = parseInt(config.limits.maxFileSize);
    const categoryMaxSize = storageConfig.fileTypes[category].maxFileSize;
    return Math.min(dynamicMaxSize, categoryMaxSize);
  };

  const isAllowedExtension = (extension: string): boolean => {
    const ext = extension.toLowerCase();
    if (!config) return isAllowedFileExtension(ext);

    // If server returns MIME types (e.g. image/png), extension matching is not reliable.
    // Keep extension-based fallback using static config.
    return isAllowedFileExtension(ext);
  };

  const isAllowedMimeType = (mimeType: string): boolean => {
    if (!config) return true;

    if (!mimeType) return true;

    return config.limits.allowedTypes.some((type) => {
      // type may be exact MIME (image/png) or wildcard (image/*)
      const pattern = `^${type.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
      return new RegExp(pattern, 'i').test(mimeType);
    });
  };

  const getRateLimit = (): number => {
    // For now, use default rate limit
    return DEFAULT_POLICIES.rateLimitPerMinute;
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    // Prefer MIME validation (Supabase returns allowed_mime_types)
    if (config && !isAllowedMimeType(file.type)) {
      return { valid: false, error: 'Тип файлу не підтримується' };
    }

    // Fallback to extension validation only when we don't have a config yet
    if (!config && !isAllowedExtension(extension)) {
      return { valid: false, error: 'Тип файлу не підтримується' };
    }

    const category = file.type
      ? (getMimeTypeCategory(file.type) ?? getFileTypeCategory(extension))
      : getFileTypeCategory(extension);
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

  const validateFiles = (files: File[]): { valid: boolean; error?: string } => {
    // Перевірка кількості файлів
    if (files.length > DEFAULT_POLICIES.maxFilesPerMessage) {
      return {
        valid: false,
        error: `Забагато файлів. Максимально: ${DEFAULT_POLICIES.maxFilesPerMessage}`,
      };
    }

    // Перевірка загального розміру
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > DEFAULT_POLICIES.maxTotalSize) {
      const maxTotalMB = Math.round(DEFAULT_POLICIES.maxTotalSize / 1024 / 1024);
      return {
        valid: false,
        error: `Загальний розмір файлів занадто великий. Максимально: ${maxTotalMB}MB`,
      };
    }

    // Перевірка кожного файлу окремо
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  };

  return {
    config,
    isLoading,
    getMaxFileSize,
    isAllowedExtension,
    getRateLimit,
    validateFile,
    validateFiles,
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
