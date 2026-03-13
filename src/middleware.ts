import { type NextRequest, NextResponse } from 'next/server';
import { isStaticAsset } from '@/config/storage.config';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // 1. Пропускаємо статичні файли (картинки, шрифти тощо)
  if (isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // 2. Створюємо клієнт та отримуємо початкову відповідь з куками
  const { supabase, supabaseResponse } = await createMiddlewareClient(request);
  
  try {
    // ВАЖЛИВО: Отримуємо юзера. Це оновлює токен у куках, якщо він прострочений
    const { data: { user } } = await supabase.auth.getUser();

    const url = request.nextUrl.clone();
    const path = url.pathname;

    // Визначаємо публічні маршрути
    const isPublicPage = path === '/' || path.startsWith('/auth');

    // КЕЙС 1: Юзер НЕ залогінений, але намагається зайти в чат
    if (!user && !isPublicPage) {
      url.pathname = '/';
      const redirectResponse = NextResponse.redirect(url);
      // Копіюємо оновлені куки в редирект, щоб не розлогінювати юзера при помилках
      supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }

    // КЕЙС 2: Юзер ВЖЕ залогінений і зайшов на публічну сторінку (/, /auth/login тощо)
    // Тепер ми перекидаємо його на /chat
    if (user && isPublicPage) {
      url.pathname = '/chat';
      const redirectResponse = NextResponse.redirect(url);
      // ОБОВ'ЯЗКОВО копіюємо куки, інакше сесія "відпаде" після редиректу
      supabaseResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }

  } catch (e) {
    // Якщо сесія пошкоджена — скидаємо на головну
    if (request.nextUrl.pathname !== '/' && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Якщо редиректи не потрібні — повертаємо відповідь від Supabase (з куками)
  return supabaseResponse;
}

export const config = {
  // Оновлений matcher: ігноруємо внутрішні запити Next.js та статику
  matcher: ['/((?!api|_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};