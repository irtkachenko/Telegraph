'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { memo } from 'react';

function NewChatButtonBase() {
  const router = useRouter();

  const handleCreateChat = async () => {
    // Тут буде логіка створення чату в БД через Server Action
    // Але для MVP просто перенаправимо на домашню/нову сторінку
    router.push('/');
  };

  return (
    <div className="px-4 mb-4">
      <button
        type="button"
        onClick={handleCreateChat}
        className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 transition-colors py-3 rounded-xl font-bold text-sm shadow-lg shadow-white/5 active:scale-95 duration-75"
      >
        <Plus className="w-4 h-4" />
        Новий чат
      </button>
    </div>
  );
}

export const NewChatButton = memo(NewChatButtonBase);
