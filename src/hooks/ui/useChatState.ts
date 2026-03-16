'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ChatStateResult {
  isChatOpen: boolean;
  isWindowFocused: boolean;
  isDocumentVisible: boolean;
  openChat: (chatId: string) => void;
  closeChat: (chatId: string) => void;
  getCurrentChat: () => string | null;
}

/**
 * Hook РґР»СЏ СѓРїСЂР°РІР»С–РЅРЅСЏ СЃС‚Р°РЅРѕРј С‡Р°С‚С–РІ (РІС–РґРєСЂРёС‚С–, СЃС„РѕРєСѓСЃРѕРІР°РЅС–)
 */
export function useChatState(): ChatStateResult {
  const [openChats, setOpenChats] = useState<Set<string>>(new Set());
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true,
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  // Р’С–РґСЃС‚РµР¶СѓС”РјРѕ С„РѕРєСѓСЃ РІС–РєРЅР°
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => {
      setIsWindowFocused(false);
      setOpenChats(new Set());
      setCurrentChat(null);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Р’С–РґСЃС‚РµР¶СѓС”РјРѕ РІРёРґРёРјС–СЃС‚СЊ РґРѕРєСѓРјРµРЅС‚Р°
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsDocumentVisible(isVisible);
      if (!isVisible) {
        setOpenChats(new Set());
        setCurrentChat(null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Р’С–РґРєСЂРёРІР°С”РјРѕ С‡Р°С‚
  const openChat = useCallback((chatId: string) => {
    setOpenChats((prev) => new Set(prev).add(chatId));
    setCurrentChat(chatId);
  }, []);

  // Р—Р°РєСЂРёРІР°С”РјРѕ С‡Р°С‚
  const closeChat = useCallback(
    (chatId: string) => {
      setOpenChats((prev) => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });

      if (currentChat === chatId) {
        setCurrentChat(null);
      }
    },
    [currentChat],
  );

  // РћС‚СЂРёРјСѓС”РјРѕ РїРѕС‚РѕС‡РЅРёР№ С‡Р°С‚
  const getCurrentChat = useCallback(() => currentChat, [currentChat]);

  // РџРµСЂРµРІС–СЂСЏС”РјРѕ С‡Рё РєРѕРЅРєСЂРµС‚РЅРёР№ С‡Р°С‚ РІС–РґРєСЂРёС‚РёР№
  const isChatOpen = useCallback(
    (chatId: string) => {
      return openChats.has(chatId);
    },
    [openChats],
  );

  return {
    isChatOpen: currentChat !== null,
    isWindowFocused,
    isDocumentVisible,
    openChat,
    closeChat,
    getCurrentChat,
  };
}





