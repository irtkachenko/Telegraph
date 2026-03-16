'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';

export interface ScrollPositionResult {
  isAtBottom: boolean;
  scrollPercentage: number;
  scrollToBottom: () => void;
  scrollToMessage: (index: number) => void;
}

/**
 * Hook РґР»СЏ РІС–РґСЃС‚РµР¶РµРЅРЅСЏ scroll position РІ Virtuoso
 */
export function useScrollPosition(
  virtuosoRef: React.RefObject<VirtuosoHandle | null>,
): ScrollPositionResult {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollPercentage, setScrollPercentage] = useState(100);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // РџРµСЂРµРІС–СЂСЏС”РјРѕ РїРѕР·РёС†С–СЋ СЃРєСЂРѕР»Сѓ
  const checkScrollPosition = useCallback(() => {
    const virtuoso = virtuosoRef.current;
    if (!virtuoso) return;

    try {
      // РЎРїСЂРѕС‰РµРЅР° РїРµСЂРµРІС–СЂРєР° - РїСЂРѕСЃС‚Рѕ РѕРЅРѕРІР»СЋС”РјРѕ СЃС‚Р°РЅ
      setIsAtBottom(true);
      setScrollPercentage(100);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Error checking scroll position:', error);
      }
    }
  }, [virtuosoRef]);

  // РџСЂРѕРєСЂСѓС‚РєР° РґРѕ РєС–РЅС†СЏ
  const scrollToBottom = useCallback(() => {
    const virtuoso = virtuosoRef.current;
    if (!virtuoso) return;

    virtuoso.scrollToIndex({
      index: -1, // РћСЃС‚Р°РЅРЅС–Р№ РµР»РµРјРµРЅС‚
      behavior: 'smooth',
      align: 'end',
    });
  }, [virtuosoRef]);

  // РџСЂРѕРєСЂСѓС‚РєР° РґРѕ РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ
  const scrollToMessage = useCallback(
    (index: number) => {
      const virtuoso = virtuosoRef.current;
      if (!virtuoso) return;

      virtuoso.scrollToIndex({
        index,
        behavior: 'smooth',
        align: 'center',
      });
    },
    [virtuosoRef],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    isAtBottom,
    scrollPercentage,
    scrollToBottom,
    scrollToMessage,
  };
}

