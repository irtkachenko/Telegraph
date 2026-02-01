'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { AuthChangeEvent, Session, User, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  supabase: SupabaseClient;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  supabase: {} as SupabaseClient,
});

export const useSupabaseAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    ),
  );

  // Memoize the auth state change handler to prevent unnecessary re-renders
  const handleAuthStateChange = useCallback((event: AuthChangeEvent, session: Session | null) => {
    console.log('Auth state changed:', event, session?.user?.id);

    // Only update loading state on initial auth events
    if (event === 'INITIAL_SESSION') {
      setLoading(false);
    }

    setUser(session?.user ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('Error getting initial session:', error);
        } else {
          handleAuthStateChange('INITIAL_SESSION', session);
        }
      } catch (error) {
        console.error('Error during auth initialization:', error);
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

  // Initialize realtime only when user is available
  useGlobalRealtime(user);

  const value: AuthContextType = {
    user,
    loading,
    supabase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
