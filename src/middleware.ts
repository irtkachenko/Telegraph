import { type NextRequest, NextResponse } from 'next/server';
import { isStaticAsset } from '@/config/storage.config';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  if (isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const { supabase, supabaseResponse } = await createMiddlewareClient(request);

  try {
    // ВАЖЛИВО: Отримуємо юзера. Це оновлює токен у куках, якщо він прострочений
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const url = request.nextUrl.clone();
    const path = url.pathname;

    const isPublicPage = path === '/' || path.startsWith('/auth');

    if (!user && !isPublicPage) {
      url.pathname = '/';
      const redirectResponse = NextResponse.redirect(url);

      supabaseResponse.cookies
        .getAll()
        .forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }

    if (user && isPublicPage) {
      url.pathname = '/chat';
      const redirectResponse = NextResponse.redirect(url);

      supabaseResponse.cookies
        .getAll()
        .forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }
  } catch (e) {
    if (request.nextUrl.pathname !== '/' && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
