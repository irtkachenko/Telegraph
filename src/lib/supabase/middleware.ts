import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';

export async function createMiddlewareClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Оновлюємо куки в запиті (для поточної роботи сервера)
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // Перестворюємо відповідь з оновленим запитом
        supabaseResponse = NextResponse.next({
          request,
        });

        // Оновлюємо куки у відповіді (щоб вони полетіли в браузер)
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  return { supabase, supabaseResponse };
}
