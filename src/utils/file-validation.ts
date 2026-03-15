// File validation utilities

export function isAllowedFileExtension(filename: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!extension) return false;
  
  const allowedExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', // Images
    'mp4', 'webm', 'mov', 'avi', 'mkv', // Videos
    'pdf', 'doc', 'docx', 'txt', 'rtf', // Documents
    'zip', 'rar', '7z', 'tar', 'gz', // Archives
  ];
  
  return allowedExtensions.includes(extension);
}
