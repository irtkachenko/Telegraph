'use client';

import { MessageSquare, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { memo, Suspense, useEffect } from 'react';
import { ChatList } from './ChatList';
import { ContactsList } from './ContactsList';
import { SearchInput } from './SearchInput';

function SidebarShellBase() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams.get('tab') || 'chats';
  const query = searchParams.get('q') || '';

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'chats');
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const setTab = (newTab: 'chats' | 'contacts') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    if (newTab === 'chats') {
      params.delete('q');
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <aside
      className="h-screen lg:h-[calc(100vh-64px)] w-80 backdrop-blur-md bg-black/40 border-r border-white/10 flex flex-col z-40 shrink-0 overflow-hidden"
      style={{ willChange: 'transform' }}
    >
      {/* Header */}
      <div className="pt-6 pb-2 lg:pt-8 lg:pb-4">
        {/* View Toggle */}
        <div className="px-4 mb-6">
          <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setTab('chats')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                tab === 'chats'
                  ? 'bg-white text-black shadow-lg shadow-white/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Діалоги
            </button>
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${
                tab === 'contacts'
                  ? 'bg-white text-black shadow-lg shadow-white/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Контакти
            </button>
          </div>
        </div>

        {/* Contacts Specific UI */}
        {tab === 'contacts' && <SearchInput />}

        {/* Chats Specific UI */}
        {tab === 'chats' && <div className="h-4" />}
      </div>

      {/* Lists */}
      <div className="flex-1 flex flex-col min-h-0 py-2 overflow-hidden">
        {tab === 'chats' ? (
          <>
            <div className="px-6 mb-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 letter-spacing-wide">
                Ваші діалоги
              </h2>
            </div>
            <ChatList />
          </>
        ) : (
          <ContactsList query={query} />
        )}
      </div>
    </aside>
  );
}

export const SidebarShell = memo(function SidebarShellWrapper() {
  return (
    <Suspense
      fallback={
        <div className="w-80 h-screen bg-black/40 border-r border-white/10 animate-pulse" />
      }
    >
      <SidebarShellBase />
    </Suspense>
  );
});
