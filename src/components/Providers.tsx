'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useLayoutEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { queryClient } from '@/lib/query-client';

/**
 * Внутрішній компонент-запобіжник.
 * Він відстежує кількість рендерів у всьому додатку.
 */
function RenderGuard({ children }: { children: React.ReactNode }) {
  const renderCount = useRef(0);
  const startTime = useRef<number | null>(null);

  useLayoutEffect(() => {
    // Initialize startTime on first render
    if (startTime.current === null) {
      startTime.current = Date.now();
    }

    renderCount.current += 1;
    const now = Date.now();

    // Скидаємо лічильник кожні 5 секунд
    if (startTime.current && now - startTime.current > 5000) {
      renderCount.current = 1;
      startTime.current = now;
      return;
    }

    // Якщо рендерів занадто багато (більше 30 за 5 сек) — це "петля"
    if (renderCount.current > 30) {
      console.error('⛔ [RenderGuard] Detected an infinite loop.');

      toast.error('Критична помилка клієнта', {
        description: 'Виявлено вічний цикл. Повертаємось на головну...',
        duration: 5000,
      });

      // Робимо жорсткий редірект, щоб розірвати цикл
      const timeoutId = setTimeout(() => {
        window.location.replace('/');
      }, 1500);

      // Очищення таймауту при анмаунті
      return () => clearTimeout(timeoutId);
    }
  }); // Run on every render to detect infinite loops

  return <>{children}</>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <RenderGuard>{children}</RenderGuard>
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand={true}
          visibleToasts={3}
          toastOptions={{
            style: { zIndex: 9999 },
          }}
        />
      </GlobalErrorBoundary>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
