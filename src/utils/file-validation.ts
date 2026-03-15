// File validation utilities
import { getUploadAllowedExtensions } from '@/config/storage.config';

export function isAllowedFileExtension(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return false;
  
  const allowedExtensions = getUploadAllowedExtensions();
  return allowedExtensions.includes(extension);
}
