'use client';

/**
 * Component to monitor Web Vitals
 * Add this to your layout.tsx or _app.tsx
 */
export default function PerformanceMonitor() {
  // Note: web-vitals will be added after package installation
  // For now, this component serves as a placeholder
  
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('🚀 Performance Monitor initialized');
    
    // Basic performance monitoring without web-vitals dependency
    if ('performance' in window) {
      // Monitor page load
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            console.group('📊 Page Load Metrics');
            console.log('DOM Content Loaded:', navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart, 'ms');
            console.log('Page Load:', navigation.loadEventEnd - navigation.loadEventStart, 'ms');
            console.log('Time to First Byte:', navigation.responseStart - navigation.requestStart, 'ms');
            console.groupEnd();
          }
        }, 0);
      });
    }
  }

  return null;
}
