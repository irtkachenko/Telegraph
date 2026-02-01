'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { memo, useEffect, useState } from 'react';

function SearchInputBase() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const currentQuery = params.get('q') || '';

      if (query === currentQuery) return;

      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      router.push(`?${params.toString()}`, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, router, searchParams]);

  return (
    <div className="relative group px-4">
      <div className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-white transition-colors duration-300">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Пошук контактів..."
        className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-all duration-300 placeholder:text-gray-500"
      />
    </div>
  );
}

export const SearchInput = memo(SearchInputBase);
