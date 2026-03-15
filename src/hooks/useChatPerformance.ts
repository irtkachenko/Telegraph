'use client';

import { useEffect, useRef } from 'react';
import { createPerformanceMonitor } from '@/lib/performance';

/**
 * Hook for monitoring chat-specific performance metrics
 */
export function useChatPerformance(chatId: string) {
  const messageRenderCount = useRef(0);
  const lastMessageRenderTime = useRef(performance.now());

  // Monitor message rendering performance
  useEffect(() => {
    if (!chatId) return;
    
    messageRenderCount.current += 1;
    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastMessageRenderTime.current;
    lastMessageRenderTime.current = currentTime;

    if (process.env.NODE_ENV === 'development') {
      console.log(`💬 Chat ${chatId} render #${messageRenderCount.current} (${timeSinceLastRender.toFixed(2)}ms since last)`);
      
      // Warn about slow renders
      if (timeSinceLastRender > 100) {
        console.warn(`🐌 Slow chat render detected: ${timeSinceLastRender.toFixed(2)}ms`);
      }
    }
  });

  // Monitor message list performance
  const monitorMessageListRender = () => {
    const monitor = createPerformanceMonitor(`MessageList-${chatId}`);
    
    return {
      start: () => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📝 Starting message list render for chat ${chatId}`);
        }
      },
      end: (messageCount: number) => {
        const metric = monitor.end({ messageCount });
        
        if (process.env.NODE_ENV === 'development') {
          const duration = metric.duration || 0;
          const avgTimePerMessage = messageCount > 0 ? duration / messageCount : 0;
          
          console.log(`📝 Message list rendered: ${messageCount} messages in ${duration.toFixed(2)}ms (${avgTimePerMessage.toFixed(2)}ms per message)`);
          
          // Performance warnings
          if (duration > 200) {
            console.warn(`🐌 Slow message list render: ${duration.toFixed(2)}ms for ${messageCount} messages`);
          }
          
          if (avgTimePerMessage > 5) {
            console.warn(`🐌 High per-message render time: ${avgTimePerMessage.toFixed(2)}ms`);
          }
        }
      }
    };
  };

  // Monitor typing indicator performance
  const monitorTypingIndicator = () => {
    const monitor = createPerformanceMonitor(`TypingIndicator-${chatId}`);
    
    return {
      update: (userCount: number) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⌨️ Typing indicator update: ${userCount} users typing`);
        }
      },
      complete: () => {
        monitor.end();
      }
    };
  };

  return {
    monitorMessageListRender,
    monitorTypingIndicator,
    renderCount: messageRenderCount.current
  };
}
