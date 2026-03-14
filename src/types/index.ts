import type { AppUser } from './auth';
import type { Database } from './supabase';

// Define Attachment interface inline to avoid circular import
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

// Експортуємо AppUser як User для сумісності
export type User = AppUser;
export type { AppUser };
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
