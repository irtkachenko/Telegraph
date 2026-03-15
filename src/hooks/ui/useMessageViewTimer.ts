'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface MessageViewTimer {
  startViewing: (messageId: string) => void;
  stopViewing: (messageId: string) => void;
  getViewTime: (messageId: string) => number;
  isViewedLongEnough: (messageId: string, minTime: number) => boolean;
  clearTimers: () => void;
}

interface MessageTimer {
  startTime: number;
  totalTime: number;
  isViewing: boolean;
}

/**
 * Hook РґР»СЏ РІС–РґСЃС‚РµР¶РµРЅРЅСЏ С‡Р°СЃСѓ РїРµСЂРµРіР»СЏРґСѓ РїРѕРІС–РґРѕРјР»РµРЅСЊ
 */
export function useMessageViewTimer(): MessageViewTimer {
  const timersRef = useRef<Map<string, MessageTimer>>(new Map());
  const [, forceUpdate] = useState({});

  // РџРѕС‡РёРЅР°С”РјРѕ РІС–РґСЃС‚РµР¶РµРЅРЅСЏ РїРµСЂРµРіР»СЏРґСѓ
  const startViewing = useCallback((messageId: string) => {
    const existing = timersRef.current.get(messageId);
    
    if (existing) {
      // РЇРєС‰Рѕ РІР¶Рµ РІС–РґСЃС‚РµР¶СѓС”РјРѕ, РїСЂРѕСЃС‚Рѕ РїРѕРЅРѕРІР»СЋС”РјРѕ СЃС‚Р°РЅ
      existing.isViewing = true;
      existing.startTime = Date.now();
    } else {
      // РЎС‚РІРѕСЂСЋС”РјРѕ РЅРѕРІРёР№ С‚Р°Р№РјРµСЂ
      timersRef.current.set(messageId, {
        startTime: Date.now(),
        totalTime: 0,
        isViewing: true,
      });
    }
    
    // Trigger re-render РґР»СЏ РѕРЅРѕРІР»РµРЅРЅСЏ СЃС‚Р°РЅСѓ
    forceUpdate({});
  }, []);

  // РџСЂРёРїРёРЅСЏС”РјРѕ РІС–РґСЃС‚РµР¶РµРЅРЅСЏ РїРµСЂРµРіР»СЏРґСѓ
  const stopViewing = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (!timer || !timer.isViewing) return;

    const viewDuration = Date.now() - timer.startTime;
    timer.totalTime += viewDuration;
    timer.isViewing = false;
    
    // Cleanup СЏРєС‰Рѕ РїРѕРІС–РґРѕРјР»РµРЅРЅСЏ РїРµСЂРµРіР»СЏРЅСѓС‚Рѕ РґРѕСЃС‚Р°С‚РЅСЊРѕ РґРѕРІРіРѕ
    if (timer.totalTime > 60000) { // 1 С…РІРёР»РёРЅР°
      timersRef.current.delete(messageId);
    }
    
    forceUpdate({});
  }, []);

  // РћС‚СЂРёРјСѓС”РјРѕ Р·Р°РіР°Р»СЊРЅРёР№ С‡Р°СЃ РїРµСЂРµРіР»СЏРґСѓ
  const getViewTime = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (!timer) return 0;

    let totalTime = timer.totalTime;
    
    // РЇРєС‰Рѕ Р·Р°СЂР°Р· РїРµСЂРµРіР»СЏРґР°С”РјРѕ, РґРѕРґР°С”РјРѕ РїРѕС‚РѕС‡РЅСѓ СЃРµСЃС–СЋ
    if (timer.isViewing) {
      totalTime += Date.now() - timer.startTime;
    }
    
    return totalTime;
  }, []);

  // РџРµСЂРµРІС–СЂСЏС”РјРѕ С‡Рё РґРѕСЃС‚Р°С‚РЅСЊРѕ С‡Р°СЃСѓ РїРµСЂРµРіР»СЏРЅСѓС‚Рѕ
  const isViewedLongEnough = useCallback((messageId: string, minTime: number) => {
    const viewTime = getViewTime(messageId);
    return viewTime >= minTime;
  }, [getViewTime]);

  // РћС‡РёС‰СѓС”РјРѕ РІСЃС– С‚Р°Р№РјРµСЂРё
  const clearTimers = useCallback(() => {
    timersRef.current.clear();
    forceUpdate({});
  }, []);

  // РђРІС‚РѕРјР°С‚РёС‡РЅРµ РѕС‡РёС‰РµРЅРЅСЏ СЃС‚Р°СЂРёС… С‚Р°Р№РјРµСЂС–РІ
  const cleanup = useCallback(() => {
    const now = Date.now();
    const toDelete: string[] = [];
    
    timersRef.current.forEach((timer, messageId) => {
      // Р’РёРґР°Р»СЏС”РјРѕ С‚Р°Р№РјРµСЂРё СЏРєРёРј Р±С–Р»СЊС€Рµ 5 С…РІРёР»РёРЅ С– РЅРµР°РєС‚РёРІРЅС–
      if (!timer.isViewing && (now - timer.startTime) > 300000) {
        toDelete.push(messageId);
      }
    });
    
    toDelete.forEach(messageId => {
      timersRef.current.delete(messageId);
    });
    
    if (toDelete.length > 0) {
      forceUpdate({});
    }
  }, []);

  // РџРµСЂС–РѕРґРёС‡РЅРµ РѕС‡РёС‰РµРЅРЅСЏ
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    cleanupInterval.current = setInterval(cleanup, 30000); // РљРѕР¶РЅС– 30 СЃРµРєСѓРЅРґ

    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
        cleanupInterval.current = null;
      }
    };
  }, [cleanup]);

  return {
    startViewing,
    stopViewing,
    getViewTime,
    isViewedLongEnough,
    clearTimers,
  };
}



