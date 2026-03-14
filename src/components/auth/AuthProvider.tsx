'use client';

import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { createClient } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, DatabaseError } from '@/shared/lib/errors';
import { type AppUser, UserUtils } from '@/types/auth';

interface AuthContextType {
  user: AppUser | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  supabase: SupabaseClient;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  supabaseUser: null,
  loading: true,
  supabase: {} as SupabaseClient,
  refreshUser: async () => {},
});

export const useSupabaseAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  // Функція для нормалізації користувача (без БД доступу)
  const normalizeUser = useCallback((supabaseUser: SupabaseUser | null) => {
    if (!supabaseUser) {
      setUser(null);
      return;
    }

    // Нормалізувати користувача без БД даних
    const normalizedUser = UserUtils.normalize(supabaseUser, undefined);
    setUser(normalizedUser);
  }, []);

  // Функція для оновлення даних користувача
  const refreshUser = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user) {
      setSupabaseUser(user);
      normalizeUser(user);
    }
  }, [supabase, normalizeUser]);

  // Обробник зміни стану автентифікації
  const handleAuthStateChange = useCallback(
    async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'INITIAL_SESSION') {
        setLoading(false);
      }

      const currentUser = session?.user ?? null;
      setSupabaseUser(currentUser);

      if (currentUser) {
        normalizeUser(currentUser);
      } else {
        setUser(null);
      }
    },
    [normalizeUser],
  );

  // Ініціалізація
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error) {
          handleError(
            new AuthError(error.message, 'INITIAL_USER_ERROR', error.status),
            'AuthProvider',
          );
          setLoading(false);
        } else {
          handleAuthStateChange('INITIAL_SESSION', user ? ({ user } as Session) : null);
        }
      } catch (error) {
        handleError(
          new DatabaseError('Error during auth initialization', 'authInit', 'AUTH_INIT_ERROR', 500),
          'AuthProvider',
        );
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, handleAuthStateChange]);

  // Realtime для presence
  useGlobalRealtime(supabaseUser);

  const value = useMemo(
    () => ({
      user,
      supabaseUser,
      loading,
      supabase,
      refreshUser,
    }),
    [user, supabaseUser, loading, supabase, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
