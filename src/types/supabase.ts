export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      user: {
        Row: {
          id: string
          name: string | null
          email: string
          email_verified: string | null
          image: string | null
          last_seen: string | null
        }
        Insert: {
          id?: string
          name?: string | null
          email: string
          email_verified?: string | null
          image?: string | null
          last_seen?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          email?: string
          email_verified?: string | null
          image?: string | null
          last_seen?: string | null
        }
      }
      chats: {
        Row: {
          id: string
          user_id: string
          recipient_id: string | null
          user_last_read_id: string | null
          recipient_last_read_id: string | null
          title: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          recipient_id?: string | null
          user_last_read_id?: string | null
          recipient_last_read_id?: string | null
          title?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          recipient_id?: string | null
          user_last_read_id?: string | null
          recipient_last_read_id?: string | null
          title?: string
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          sender_id: string
          content: string | null
          attachments: Json
          reply_to_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          chat_id: string
          sender_id: string
          content?: string | null
          attachments?: Json
          reply_to_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          chat_id?: string
          sender_id?: string
          content?: string | null
          attachments?: Json
          reply_to_id?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
