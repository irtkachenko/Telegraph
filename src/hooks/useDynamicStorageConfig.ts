'use client';

import { useState } from 'react';
import { getDefaultMaxFileSize } from '@/config/storage.config';
import { useStorageConfig } from './useStorageConfig';
import { getMaxFilesPerMessage } from '@/config/upload.config';

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

  const getMaxFileSize = (category: 'images' | 'videos' | 'documents'): number => {
    if (!config) return getDefaultMaxFileSize();

    // Convert string to bytes and use dynamic limit
    const dynamicMaxSize = parseInt(config.limits.maxFileSize);
    const fallbackSize = getDefaultMaxFileSize();
    return Math.min(dynamicMaxSize, fallbackSize);
  };

  const isAllowedExtension = (extension: string): boolean => {
    const ext = extension.toLowerCase();
    if (!config) return false; // No fallback - require API

    // If server returns MIME types (e.g. image/png), extension matching is not reliable.
    // Keep extension-based fallback using static config.
    return false; // Will be handled by MIME validation
  };

  const isAllowedMimeType = (mimeType: string): boolean => {
    if (!config) return true;

    if (!mimeType) return true;

    // Check if allowedTypes contains MIME types (has '/') or extensions (no '/')
    const hasMimeTypes = config.limits.allowedTypes.some(type => type.includes('/'));
    
    if (hasMimeTypes) {
      // Use MIME type validation
      return config.limits.allowedTypes.some((type) => {
        // type may be exact MIME (image/png) or wildcard (image/*)
        const pattern = `^${type.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`;
        return new RegExp(pattern, 'i').test(mimeType);
      });
    } else {
      // Fallback to extension validation if only extensions are provided
      // Extract extension from MIME type or use common mappings
      const extensionFromMime = mimeType.split('/')[1]?.toLowerCase();
      if (extensionFromMime) {
        return config.limits.allowedTypes.some(ext => 
          ext.toLowerCase() === `.${extensionFromMime}` || 
          ext.toLowerCase() === extensionFromMime
        );
      }
      // If we can't extract extension from MIME, allow the file
      // This prevents false negatives when bucket is not found
      return true;
    }
  };

  const getRateLimit = (): number => {
    // For now, use default rate limit
    return DEFAULT_POLICIES.rateLimitPerMinute;
  };

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    // Prefer MIME validation if available
    if (config && !isAllowedMimeType(file.type)) {
      // Try extension fallback if MIME validation fails
      if (!config.limits.allowedTypes.some(type => type.includes('/'))) {
        // Only extensions are provided, check extension directly
        const fileExt = `.${extension}`;
        const allowedExtension = config.limits.allowedTypes.some(ext => 
          ext.toLowerCase() === fileExt || ext.toLowerCase() === extension
        );
        if (!allowedExtension) {
          return { valid: false, error: 'File type not supported' };
        }
      } else {
        return { valid: false, error: 'File type not supported' };
      }
    }

    // Fallback: no validation without API config
    if (!config) {
      return { valid: false, error: 'Service temporarily unavailable' };
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
