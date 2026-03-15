import type { Database } from './supabase';

/**
 * Metadata from various OAuth providers
 */
export interface UserMetadata {
  name?: string;
  full_name?: string;
  avatar_url?: string;
  picture?: string;
  provider?: string;
}

/**
 * Combined user type merging Supabase Auth and Database profile
 */
export interface AppUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  user_metadata: UserMetadata;
  name: string | null;
  image: string | null;
  last_seen: string | null;
  is_online: boolean;
  display_name: string;
}

/**
 * Centralized Attachment interface
 */
export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  is_deleted?: boolean;
  metadata: {
    name: string;
    size: number;
    width?: number;
    height?: number;
    expired?: boolean;
  };
}

/**
 * UI attachment shape for previews before upload completes.
 */
export interface OptimisticAttachment extends Attachment {
  file?: File;
  previewUrl: string;
  uploading?: boolean;
  error?: string;
  progress?: number;
}

// Export AppUser as User for backward compatibility
export type User = AppUser;
export type Chat = Database['public']['Tables']['chats']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'] & {
  // Override attachments to be properly typed
  attachments: Attachment[] | null;
  // UI-specific fields with snake_case naming
  reply_details?: {
    id: string;
    sender: { name?: string | null };
    content: string;
    sender_id?: string;
    attachments?: Attachment[];
  } | null;
  reply_to?: Message;
  sender?: User | null;
  // Joined user data from optimized query
  user?: {
    id: string;
    name?: string | null;
    image?: string | null;
  } | null;
  is_optimistic?: boolean;
};

// Extended types for UI with relations
export type FullChat = Chat & {
  messages: Message[];
  participants: User[];
  recipient?: User | null;
  user?: User | null;
  user_last_read?: { id: string; created_at: string } | null;
  recipient_last_read?: { id: string; created_at: string } | null;
};

export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}
