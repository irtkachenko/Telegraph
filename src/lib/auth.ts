'use client';

import { createClient } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, DatabaseError } from '@/shared/lib/errors';

export async function handleSignIn() {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw new AuthError(error.message, 'SIGN_IN_ERROR', error.status);
  }
}

export async function handleSignOut() {
  const supabase = createClient();

  // Update status before sign out
  try {
    await supabase.rpc('update_last_seen');
  } catch (e) {
    handleError(
      new DatabaseError(
        'Failed to update last seen on sign out',
        'update_last_seen',
        'UPDATE_LAST_SEEN_ERROR',
        500,
      ),
      'Auth',
    );
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new AuthError(error.message, 'SIGN_OUT_ERROR', error.status);
  } else {
    window.location.href = '/';
  }
}
