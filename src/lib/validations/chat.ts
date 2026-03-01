import { z } from 'zod';
import type { Attachment } from '@/types';

/**
 * Validation schemas for chat-related operations
 * Single source of truth for all chat validation logic
 */

// Message validation schema
export const messageSchema = z.object({
  id: z.string().uuid('Message ID must be a valid UUID'),
  chatId: z.string().uuid('Chat ID must be a valid UUID'),
  content: z.string()
    .min(1, 'Message content cannot be empty')
    .max(3000, 'Message content cannot exceed 3000 characters'),
  attachments: z.array(z.object({
    id: z.string(),
    type: z.enum(['image', 'video', 'file']),
    url: z.string().url(),
    is_deleted: z.boolean().optional(),
    metadata: z.object({
      name: z.string(),
      size: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      expired: z.boolean().optional(),
    }),
  })).max(10, 'Cannot have more than 10 attachments')
  .default([]),
});

// Chat creation/update schema
export const chatSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string()
    .min(1, 'Chat title cannot be empty')
    .max(100, 'Chat title cannot exceed 100 characters')
    .optional(),
  recipientId: z.string().uuid('Recipient ID must be a valid UUID'),
});

// User profile schema
export const profileSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(50, 'Name cannot exceed 50 characters')
    .optional(),
  image: z.string().url('Profile image must be a valid URL').optional().nullable(),
});

// Chat membership verification schema
export const chatMembershipSchema = z.object({
  chatId: z.string().uuid('Chat ID must be a valid UUID'),
  userId: z.string().uuid('User ID must be a valid UUID'),
});

// Message read status schema
export const markAsReadSchema = z.object({
  chatId: z.string().uuid('Chat ID must be a valid UUID'),
  messageId: z.string().uuid('Message ID must be a valid UUID'),
});

// Search validation schema with security measures
export const searchSchema = z.object({
  query: z.string()
    .min(0, 'Search query cannot be negative length')
    .max(100, 'Search query cannot exceed 100 characters')
    .transform((val) => {
      // Basic sanitization: remove potentially dangerous characters
      return val
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, ''); // Remove event handlers
    }),
});

// File upload validation schema
export const fileUploadSchema = z.object({
  files: z.array(z.instanceof(File)).max(5, 'Cannot upload more than 5 files'),
  maxSize: z.number().max(5 * 1024 * 1024, 'File size cannot exceed 5MB'), // 5MB
  allowedTypes: z.array(z.string()).default([
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
}).refine((data) => {
  return data.files.every(file => 
    data.allowedTypes.includes(file.type) && 
    file.size <= data.maxSize
  );
}, {
  message: 'All files must be valid types and under 5MB',
});

// Individual file validation
export const singleFileSchema = z.object({
  file: z.instanceof(File),
  maxSize: z.number().max(5 * 1024 * 1024, 'File size cannot exceed 5MB'),
  allowedTypes: z.array(z.string()).default([
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]),
}).refine((data) => {
  return data.allowedTypes.includes(data.file.type) && data.file.size <= data.maxSize;
}, {
  message: 'File must be a valid type and under 5MB',
});

// Type exports for use in components and actions
export type MessageInput = z.infer<typeof messageSchema>;
export type ChatInput = z.infer<typeof chatSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ChatMembershipInput = z.infer<typeof chatMembershipSchema>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type SingleFileInput = z.infer<typeof singleFileSchema>;
