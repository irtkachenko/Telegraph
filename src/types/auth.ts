import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User as DatabaseUser } from './index';

/**
 * Повний тип користувача, що об'єднує Supabase Auth та Database
 */
export interface AppUser {
  // Supabase Auth поля
  id: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  user_metadata: UserMetadata;
  
  // Database поля (merged)
  name: string | null;
  image: string | null;
  last_seen: string | null;
  
  // Обчислювані поля
  is_online: boolean;
  display_name: string;
}

export interface UserMetadata {
  name?: string;
  full_name?: string;
  avatar_url?: string;
  picture?: string;
  provider?: string;
}

/**
 * Утиліти для роботи з користувачем
 */
export class UserUtils {
  static normalize(supabaseUser: SupabaseUser, dbUser?: DatabaseUser | null): AppUser {
    const metadata = supabaseUser.user_metadata || {};
    
    return {
      // Supabase поля
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      email_confirmed_at: supabaseUser.email_confirmed_at,
      phone: supabaseUser.phone,
      user_metadata: metadata,
      
      // Database поля (з пріоритетом DB)
      name: dbUser?.name || metadata.name || metadata.full_name || null,
      image: dbUser?.image || metadata.avatar_url || metadata.picture || null,
      last_seen: dbUser?.last_seen || null,
      
      // Обчислювані
      is_online: this.isUserOnline(dbUser?.last_seen),
      display_name: this.getDisplayName(supabaseUser, dbUser),
    };
  }
  
  static getDisplayName(supabaseUser: SupabaseUser, dbUser?: DatabaseUser | null): string {
    const metadata = supabaseUser.user_metadata || {};
    
    return (
      metadata.name ||
      metadata.full_name ||
      dbUser?.name ||
      supabaseUser.email?.split('@')[0] ||
      'Unknown User'
    );
  }
  
  static getUserImage(supabaseUser: SupabaseUser, dbUser?: DatabaseUser | null): string | null {
    const metadata = supabaseUser.user_metadata || {};
    
    return (
      dbUser?.image ||
      metadata.avatar_url ||
      metadata.picture ||
      null
    );
  }
  
  static isEmailVerified(supabaseUser: SupabaseUser): boolean {
    return !!supabaseUser.email_confirmed_at;
  }
  
  static isUserOnline(lastSeen?: string | null): boolean {
    if (!lastSeen) return false;
    const lastSeenTime = new Date(lastSeen).getTime();
    const now = new Date().getTime();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    return lastSeenTime > fiveMinutesAgo;
  }
  
  static getInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}

/**
 * Type guards для безпечної роботи
 */
export function isAppUser(user: unknown): user is AppUser {
  return !!(user && typeof user === 'object' && 'id' in user && 'email' in user);
}

/**
 * Hook для отримання нормалізованого користувача
 */
export function useNormalizedUser(supabaseUser: SupabaseUser | null, dbUser?: DatabaseUser | null): AppUser | null {
  if (!supabaseUser) return null;
  return UserUtils.normalize(supabaseUser, dbUser);
}
