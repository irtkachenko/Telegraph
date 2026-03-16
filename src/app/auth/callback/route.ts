import { NextResponse } from 'next/server';
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in search params, use it as the redirection URL after successful exchange
  const next = searchParams.get('next') ?? '/chat';
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;
  const safeNext = next.startsWith('/') ? next : '/chat';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, baseUrl));
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/auth-code-error', baseUrl));
}
