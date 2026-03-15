'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { handleError } from '@/shared/lib/error-handler';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error using our centralized handler
    handleError(error, 'GlobalErrorNextJS');
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center bg-background rounded-3xl border border-white/5 backdrop-blur-xl m-4">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <span className="text-4xl">⚠️</span>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Щось пішло не так</h2>
      <p className="text-gray-400 mb-8 max-w-md">
        Сталася помилка при завантаженні сторінки. Ми вже працюємо над її вирішенням.
      </p>
      <div className="flex gap-4">
        <Button
          onClick={() => (window.location.href = '/')}
          variant="outline"
          className="rounded-xl border-white/10 hover:bg-white/5"
        >
          На головну
        </Button>
        <Button
          onClick={() => reset()}
          className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-8"
        >
          Спробувати ще раз
        </Button>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-8 p-4 bg-black/50 rounded-xl text-left text-xs text-red-400 overflow-auto max-w-full">
          {error.message}
          {error.stack && `\n\n${error.stack}`}
        </pre>
      )}
    </div>
  );
}
