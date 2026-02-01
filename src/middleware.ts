import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { isStaticAsset } from '@/config/storage.config';

export async function middleware(request: NextRequest) {
  // Check if this is a static asset and bypass middleware if so
  if (isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Використовуємо try/catch, щоб Middleware не "падав", якщо з сесією щось не так
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const url = request.nextUrl.clone();
    const path = url.pathname;

    const isPublicPage = path === '/' || path.startsWith('/auth');

    // Якщо юзера немає і сторінка захищена — на головну
    if (!user && !isPublicPage) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }

    // Якщо юзер вже є і він на сторінці логіну — в чат
    if (user && isPublicPage) {
      url.pathname = '/chat';
      return NextResponse.redirect(url);
    }
  } catch (e) {
    // Якщо сталася будь-яка помилка авторизації (сесія біта тощо)
    // Просто кидаємо на головну, якщо ми не на публічній сторінці
    const url = request.nextUrl.clone();
    if (url.pathname !== '/' && !url.pathname.startsWith('/auth')) {
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
