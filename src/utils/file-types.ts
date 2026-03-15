// File type utilities

export type FileTypeCategory = 'image' | 'video' | 'file';

export function getFileTypeCategory(filename: string): FileTypeCategory {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return 'file';

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

  if (imageExtensions.includes(extension)) return 'image';
  if (videoExtensions.includes(extension)) return 'video';
  return 'file';
}
