import { storageConfig } from '@/config/storage.config';

export type StorageRef = { bucket: string; path: string };

/**
 * Extracts bucket and path from Supabase storage URLs
 * Supports both signed URLs and public URLs
 */
export function extractStorageRef(rawUrl: string): StorageRef | null {
  if (!rawUrl) return null;

  // Normalize URL (strip query params for parsing)
  const url = rawUrl.split('?')[0] || rawUrl;

  // Match Supabase storage URLs (public or signed)
  const supabaseMatch = url.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)/,
  );
  if (supabaseMatch) {
    const [, bucket, path] = supabaseMatch;
    return { bucket, path: decodeURIComponent(path) };
  }

  // Match bucket/path style (e.g., attachments/<path>)
  const bucketName = storageConfig.bucketNames.attachments;
  const normalized = url.startsWith('/') ? url.slice(1) : url;
  if (normalized.startsWith(`${bucketName}/`)) {
    return { bucket: bucketName, path: normalized.slice(bucketName.length + 1) };
  }

  return null;
}

/**
 * Checks if a URL is a Supabase storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return extractStorageRef(url) !== null;
}

/**
 * Creates a storage reference from bucket and path
 */
export function createStorageRef(bucket: string, path: string): StorageRef {
  return { bucket, path };
}

/**
 * Converts storage reference to public URL format
 */
export function storageRefToPublicUrl(ref: StorageRef): string {
  return `/${ref.bucket}/${ref.path}`;
}
