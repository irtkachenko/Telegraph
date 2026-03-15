/**
 * Performance monitoring utilities
 */

import { useEffect, useRef } from 'react';

export interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta?: number;
  id?: string;
}

export interface CustomMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Report Web Vitals to console
 */
export function reportWebVitals(metric: any) {
  if (process.env.NODE_ENV === 'development') {
    console.group(`🚀 Web Vital: ${metric.name}`);
    console.log('Value:', metric.value);
    console.log('Rating:', metric.rating);
    if (metric.delta) console.log('Delta:', metric.delta);
    console.log('ID:', metric.id);
    console.groupEnd();
  }

  // В production також логуємо для debugging
  if (process.env.NODE_ENV === 'production') {
    console.log(`[Performance] ${metric.name}: ${metric.value} (${metric.rating})`);
  }
}

/**
 * Custom performance monitor for components
 */
export function createPerformanceMonitor(name: string) {
  const startTime = performance.now();
  
  return {
    end: (metadata?: Record<string, any>) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const metric: CustomMetric = {
        name,
        startTime,
        endTime,
        duration,
        metadata
      };

      if (process.env.NODE_ENV === 'development') {
        console.group(`⏱️ ${name}`);
        console.log('Duration:', `${duration.toFixed(2)}ms`);
        if (metadata) console.log('Metadata:', metadata);
        console.groupEnd();
      }

      return metric;
    }
  };
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());

  useEffect(() => {
    renderCount.current += 1;
    const currentTime = performance.now();
    const timeSinceLastRender = currentTime - lastRenderTime.current;
    lastRenderTime.current = currentTime;

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 ${componentName} render #${renderCount.current} (${timeSinceLastRender.toFixed(2)}ms since last)`);
    }
  });
}

/**
 * API response time monitor
 */
export function monitorAPICall(apiName: string) {
  return async <T>(apiCall: () => Promise<T>): Promise<T> => {
    const monitor = createPerformanceMonitor(`API: ${apiName}`);
    
    try {
      const result = await apiCall();
      monitor.end({ success: true });
      return result;
    } catch (error) {
      monitor.end({ success: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
}

/**
 * File upload/download monitor
 */
export function monitorFileOperation(operation: 'upload' | 'download', fileName: string, fileSize?: number) {
  const monitor = createPerformanceMonitor(`File ${operation}: ${fileName}`);
  
  return {
    complete: () => {
      const metric = monitor.end({ 
        fileSize, 
        sizeMB: fileSize ? (fileSize / 1024 / 1024).toFixed(2) : 'unknown' 
      });
      
      if (fileSize) {
        const duration = metric.duration || 0;
        const throughput = (fileSize / 1024 / 1024) / (duration / 1000); // MB/s
        console.log(`📁 Throughput: ${throughput.toFixed(2)} MB/s`);
      }
    }
  };
}

/**
 * Realtime subscription monitor
 */
export function monitorRealtimeSubscription(channelName: string) {
  const monitor = createPerformanceMonitor(`Realtime: ${channelName}`);
  
  return {
    connected: () => monitor.end({ status: 'connected' }),
    disconnected: () => monitor.end({ status: 'disconnected' }),
    error: (error: any) => monitor.end({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  };
}
