'use client';

import { useState } from 'react';
import { getDefaultMaxFileSize } from '@/config/storage.config';
import { getMaxFilesPerMessage } from '@/config/upload.config';
import { useStorageConfig } from './useStorageConfig';

interface StoragePolicies {
  maxFileSize: number;
  allowedExtensions: string[];
  rateLimitPerMinute: number;
  maxTotalSize: number; // Total limit for group of files
  maxFilesPerMessage: number; // Maximum number of files per message
}

// Default fallback configuration
const DEFAULT_POLICIES: StoragePolicies = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedExtensions: [], // Will be populated from Supabase API
  rateLimitPerMinute: 10,
  maxTotalSize: 100 * 1024 * 1024, // 100MB total limit per message
  maxFilesPerMessage: getMaxFilesPerMessage(), // Use app config
};


export function useDynamicStorageConfig() {
  return useStorageConfig();
}

export function useStorageLimits() {
  const { data: config, isLoading } = useDynamicStorageConfig();
  const getFileExtension = (filename: string): string =>
    filename.split('.').pop()?.toLowerCase() || '';

  const normalizeExtension = (value: string): string => value.toLowerCase().replace(/^\./, '');

  const isMimeLike = (value: string): boolean => value.includes('/');

  const isGenericMime = (mimeType: string): boolean => {
    const normalized = mimeType.toLowerCase().trim();
    return normalized === '' || normalized === 'application/octet-stream';
  };

  const isMimeCompatibleWithExtension = (_mimeType: string, _extension: string): boolean => {
    // Since we're using only MIME types from API, this function is no longer needed
    // All validation will be done through MIME types directly
    return true;
  };

  const matchesExtension = (_extension: string, allowedTypes: string[]): boolean => {
    // Since we're using only MIME types, extension matching is no longer needed
    // All validation will be done through MIME types directly
    return false;
  };

  const matchesMime = (mimeType: string, allowedTypes: string[]): boolean => {
    if (!mimeType) return false;

    return allowedTypes.some((type) => {
      if (!isMimeLike(type)) return false;
      const pattern = `^${type.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
      return new RegExp(pattern, 'i').test(mimeType);
    });
  };

  const getMaxFileSize = (category: 'images' | 'videos' | 'documents'): number => {
    if (!config) return getDefaultMaxFileSize();

    // Convert string to bytes and use dynamic limit
    const dynamicMaxSize = parseInt(config.limits.maxFileSize);
    const fallbackSize = getDefaultMaxFileSize();
    return Math.min(dynamicMaxSize, fallbackSize);
  };

  const isAllowedExtension = (_extension: string): boolean => {
    // Since we're using only MIME types, extension validation is no longer needed
    // All validation will be done through MIME types directly
    return false;
  };

  const isAllowedMimeType = (mimeType: string): boolean => {
    if (!config) return true;

    return matchesMime(mimeType, config.limits.allowedTypes);
  };

  const getRateLimit = (): number => {
    // For now, use default rate limit
    return DEFAULT_POLICIES.rateLimitPerMinute;
  };

  const getMaxTotalSize = (): number => {
    // Reserved for dynamic policy in future. For now use central default.
    return DEFAULT_POLICIES.maxTotalSize;
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Fallback: no validation without API config
    if (!config) {
      return { valid: false, error: 'Service temporarily unavailable' };
    }

    // Check if file MIME type is allowed
    if (!isAllowedMimeType(file.type)) {
      return { valid: false, error: 'File type not supported' };
    }

    const maxSize = getMaxFileSize('images'); // Use default category for size check
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / 1024 / 1024);
      return {
        valid: false,
        error: `File too large. Maximum size: ${maxSizeMB}MB`,
      };
    }

    return { valid: true };
  };

  const validateFiles = (files: File[]): { valid: boolean; error?: string } => {
    // Check number of files
    if (files.length > DEFAULT_POLICIES.maxFilesPerMessage) {
      return {
        valid: false,
        error: `Too many files. Maximum: ${DEFAULT_POLICIES.maxFilesPerMessage}`,
      };
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > DEFAULT_POLICIES.maxTotalSize) {
      const maxTotalMB = Math.round(DEFAULT_POLICIES.maxTotalSize / 1024 / 1024);
      return {
        valid: false,
        error: `Total file size too large. Maximum: ${maxTotalMB}MB`,
      };
    }

    // Check each file individually
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  };

  /**
   * Build a comprehensive `accept` attribute string for <input type="file">.
   * Since we're using only MIME types from API, we only need to return those.
   */
  const getAcceptString = (): string => {
    if (!config?.limits.allowedTypes || config.limits.allowedTypes.length === 0) {
      return 'image/*,video/*';
    }

    // Return only MIME types from API configuration
    return config.limits.allowedTypes.join(',');
  };

  return {
    config,
    isLoading,
    getMaxFileSize,
    getMaxTotalSize,
    isAllowedExtension,
    getRateLimit,
    validateFile,
    validateFiles,
    getAcceptString,
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
