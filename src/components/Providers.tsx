'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ProfilerOnRenderCallback } from 'react';
import { Profiler, lazy, Suspense, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import { queryClient } from '@/lib/query-client';

/**
 * Внутрішній компонент-запобіжник.
 * Використовує React.Profiler для глобального моніторингу всього дерева.
 */
function RenderGuard({ children }: { children: React.ReactNode }) {
  const commitCount = useRef(0);
  const lastResetTime = useRef(Date.now());
  const lastToastTime = useRef(0);

  if (process.env.NODE_ENV !== 'development') {
    return <>{children}</>;
  }

  const handleRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    commitCount.current++;
    const now = Date.now();

    // Перевіряємо частоту коммітів кожну секунду
    if (now - lastResetTime.current >= 1000) {
      if (commitCount.current > 40 && now - lastToastTime.current > 5000) {
        toast.error('⚠️ Глобальне перевантаження рендерами!', {
          description: `Детектовано ${commitCount.current} коммітів за секунду. Можлива нескінченна петля оновлень.`,
        });
        lastToastTime.current = now;
      }
      commitCount.current = 0;
      lastResetTime.current = now;
    }

    // Також відстежуємо занадто важкі комміти (більше 150мс)
    if (actualDuration > 150 && now - lastToastTime.current > 10000) {
      toast.warning('🐢 Важкий рендер!', {
        description: `Останнє оновлення дерева зайняло ${actualDuration.toFixed(0)}мс. Це може спричинити фрізи.`,
      });
      lastToastTime.current = now;
    }
  };

  return (
    <Profiler id="TraceMonitor" onRender={handleRender}>
      {children}
    </Profiler>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const ReactQueryDevtools =
    process.env.NODE_ENV === 'development'
      ? lazy(async () => {
          const mod = await import('@tanstack/react-query-devtools');
          return { default: mod.ReactQueryDevtools };
        })
      : null;

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
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
