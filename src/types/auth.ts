import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { AppUser, UserMetadata } from './index';

/**
 * Утиліти для роботи з користувачем
 */
export const UserUtils = {
  normalize(supabaseUser: SupabaseUser, dbUser?: Partial<AppUser> | null): AppUser {
    const metadata = (supabaseUser.user_metadata as UserMetadata) || {};

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
      is_online: UserUtils.isUserOnline(dbUser?.last_seen),
      display_name: UserUtils.getDisplayName(supabaseUser, dbUser),
    };
  },

  getDisplayName(supabaseUser: SupabaseUser, dbUser?: Partial<AppUser> | null): string {
    const metadata = (supabaseUser.user_metadata as UserMetadata) || {};

    return (
      metadata.name ||
      metadata.full_name ||
      dbUser?.name ||
      supabaseUser.email?.split('@')[0] ||
      'Unknown User'
    );
  },

  getUserImage(supabaseUser: SupabaseUser, dbUser?: Partial<AppUser> | null): string | null {
    const metadata = (supabaseUser.user_metadata as UserMetadata) || {};
    return dbUser?.image || metadata.avatar_url || metadata.picture || null;
  },

  isEmailVerified(supabaseUser: SupabaseUser): boolean {
    return !!supabaseUser.email_confirmed_at;
  },

  isUserOnline(lastSeen?: string | null): boolean {
    if (!lastSeen) return false;
    const lastSeenTime = new Date(lastSeen).getTime();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    return lastSeenTime > fiveMinutesAgo;
  },

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  },
};

/**
 * Type guards для безпечної роботи
 */
export function isAppUser(user: unknown): user is AppUser {
  return !!(user && typeof user === 'object' && 'id' in user && 'email' in user);
}

/**
 * Hook – проста обгортка над нормалізацією
 */
export function useNormalizedUser(
  supabaseUser: SupabaseUser | null,
  dbUser?: Partial<AppUser> | null,
): AppUser | null {
  if (!supabaseUser) return null;
  return UserUtils.normalize(supabaseUser, dbUser);
}
