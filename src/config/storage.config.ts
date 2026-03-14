// Centralized storage configuration for the application

export interface StorageConfig {
  buckets: {
    attachments: {
      name: string;
      isPrivate: boolean;
      maxFileSize: number; // in bytes
      allowedExtensions: string[];
    };
  };
  fileTypes: {
    images: {
      extensions: string[];
      mimeTypes: string[];
      maxFileSize: number; // in bytes
    };
    videos: {
      extensions: string[];
      mimeTypes: string[];
      maxFileSize: number; // in bytes
    };
    documents: {
      extensions: string[];
      mimeTypes: string[];
      maxFileSize: number; // in bytes
    };
  };
  // Static asset extensions for middleware exclusion
  staticAssetExtensions: string[];
  // Default signed URL expiry in seconds
  defaultSignedUrlExpiry: number;
}

export const storageConfig: StorageConfig = {
  buckets: {
    attachments: {
      name: 'attachments',
      isPrivate: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedExtensions: [
        // Images
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'svg',
        // Videos
        'mp4',
        'mov',
        'avi',
        'webm',
        'mkv',
        // Documents
        'pdf',
        'doc',
        'docx',
        'txt',
        'zip',
        'rar',
        '7z',
      ],
    },
  },
  fileTypes: {
    images: {
      extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
    },
    videos: {
      extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
      mimeTypes: [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/x-matroska',
      ],
      maxFileSize: 50 * 1024 * 1024, // 50MB
    },
    documents: {
      extensions: ['pdf', 'doc', 'docx', 'txt', 'zip', 'rar', '7z'],
      mimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
      ],
      maxFileSize: 20 * 1024 * 1024, // 20MB
    },
  },
  staticAssetExtensions: [
    'svg',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'ico',
    'css',
    'js',
    'woff',
    'woff2',
    'ttf',
    'eot',
  ],
  defaultSignedUrlExpiry: 3600, // 1 hour in seconds
};

// Helper functions for working with storage config

import { ConfigError } from '@/shared/lib/errors';

// Helper functions for working with storage config

export function getBucketConfig(bucketName: string) {
  const bucket = Object.values(storageConfig.buckets).find((b) => b.name === bucketName);
  if (!bucket) {
    throw new ConfigError(
      `Bucket configuration not found for: ${bucketName}`,
      'BUCKET_CONFIG_NOT_FOUND',
    );
  }
  return bucket;
}

export function isPrivateBucket(bucketName: string): boolean {
  try {
    const config = getBucketConfig(bucketName);
    return config.isPrivate;
  } catch {
    return false;
  }
}

export function getFileTypeCategory(extension: string): 'images' | 'videos' | 'documents' | null {
  const ext = extension.toLowerCase();

  for (const [category, config] of Object.entries(storageConfig.fileTypes)) {
    if (config.extensions.includes(ext)) {
      return category as 'images' | 'videos' | 'documents';
    }
  }

  return null;
}

export function getMimeTypeCategory(mimeType: string): 'images' | 'videos' | 'documents' | null {
  const mime = mimeType.toLowerCase();

  for (const [category, config] of Object.entries(storageConfig.fileTypes)) {
    if (config.mimeTypes.some((t) => t.toLowerCase() === mime)) {
      return category as 'images' | 'videos' | 'documents';
    }
  }

  if (mime.startsWith('image/')) return 'images';
  if (mime.startsWith('video/')) return 'videos';

  return null;
}

export function isMediaType(extension: string): boolean {
  const category = getFileTypeCategory(extension);
  return category === 'images' || category === 'videos';
}

export function isAllowedFileExtension(extension: string, bucketName?: string): boolean {
  const ext = extension.toLowerCase();

  if (bucketName) {
    try {
      const bucket = getBucketConfig(bucketName);
      return bucket.allowedExtensions.includes(ext);
    } catch {
      return false;
    }
  }

  // Check all file types if no bucket specified
  return Object.values(storageConfig.fileTypes).some((config) => config.extensions.includes(ext));
}

export function getAllowedMimeTypes(category?: 'images' | 'videos' | 'documents'): string[] {
  if (category) {
    return storageConfig.fileTypes[category].mimeTypes;
  }

  // Return all allowed MIME types
  return Object.values(storageConfig.fileTypes).flatMap((config) => config.mimeTypes);
}

export function getMaxFileSize(extension: string): number {
  const category = getFileTypeCategory(extension);
  if (category) {
    return storageConfig.fileTypes[category].maxFileSize;
  }

  // Default to 10MB if category not found
  return 10 * 1024 * 1024;
}

export function getStaticAssetPattern(): string {
  const extensions = storageConfig.staticAssetExtensions.join('|');
  return `.*\\.(?:${extensions})$`;
}

export function isStaticAsset(pathname: string): boolean {
  const extensions = storageConfig.staticAssetExtensions;
  const extension = pathname.split('.').pop()?.toLowerCase();
  return extension ? extensions.includes(extension) : false;
}
