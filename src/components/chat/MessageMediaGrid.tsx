'use client';

import { FileX, ImageOff, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storageConfig, getUrlExpiryBuffer, getUrlCheckInterval } from '@/config/storage.config';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';

const ImageModal = lazy(() => import('./ImageModal'));

interface MessageMediaGridProps {
  items: Attachment[];
}

interface AttachmentWithUrl extends Attachment {
  processedUrl?: string;
}

interface CachedUrl {
  url: string;
  expiresAt: number;
}

type StorageRef = { bucket: string; path: string };

function extractStorageRef(rawUrl: string): StorageRef | null {
  if (!rawUrl) return null;

  // Normalize URL (strip query params for parsing)
  const url = rawUrl.split('?')[0] || rawUrl;

  // Match Supabase storage URLs (public or signed)
  const supabaseMatch = url.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)/,
  );
  if (supabaseMatch) {
    const [, bucket, path] = supabaseMatch;
    return { bucket, path: decodeURIComponent(path) };
  }

  // Match bucket/path style (e.g., attachments/<path>)
  const bucketName = storageConfig.bucketNames.attachments;
  const normalized = url.startsWith('/') ? url.slice(1) : url;
  if (normalized.startsWith(`${bucketName}/`)) {
    return { bucket: bucketName, path: normalized.slice(bucketName.length + 1) };
  }

  return null;
}

interface MediaItemState {
  isLoading: boolean;
  hasError: boolean;
  isLoaded: boolean;
}

const MediaPlaceholder = ({ reason = 'deleted', isLoading = false }: { reason?: 'deleted' | 'error'; isLoading?: boolean }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center min-h-[150px]">
        <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Loading...
        </p>
      </div>
    );
  }
  
  const Icon = reason === 'deleted' ? FileX : ImageOff;
  const text = reason === 'deleted' ? 'Deleted' : 'Error';
  
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center min-h-[150px]">
      <Icon className="w-5 h-5 text-neutral-500 mb-2" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {text}
      </p>
    </div>
  );
};

export default function MessageMediaGrid({ items }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [processedUrls, setProcessedUrls] = useState<Map<string, CachedUrl>>(new Map());
  const [refreshTick, setRefreshTick] = useState(0);
  const [mediaStates, setMediaStates] = useState<Map<string, MediaItemState>>(new Map());
  const { getUrl } = useStorageUrl();
  const pendingRef = useRef<Set<string>>(new Set());
  const failedCacheRef = useRef<Map<string, number>>(new Map());
  const processingRef = useRef<Set<string>>(new Set()); // Rate limiting
  const itemTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map()); // Per-item debouncing

  // Periodic refresh tick to re-check TTL
  useEffect(() => {
    const intervalMs = getUrlCheckInterval() * 1000;
    if (intervalMs <= 0) return;

    const id = setInterval(() => setRefreshTick((prev) => prev + 1), intervalMs);
    return () => clearInterval(id);
  }, []);

  // Initialize media states when items change
  useEffect(() => {
    if (!items || items.length === 0) return;
    
    const newStates = new Map<string, MediaItemState>();
    items.forEach((item) => {
      const key = `${item.id}:${item.url}`;
      const existing = mediaStates.get(key);
      if (!existing) {
        // Start with loading state only for items that need URL resolution
        const needsUrlResolution = !item.url.startsWith('blob:') && extractStorageRef(item.url) !== null;
        newStates.set(key, { 
          isLoading: needsUrlResolution, 
          hasError: false, 
          isLoaded: !needsUrlResolution 
        });
      } else {
        newStates.set(key, existing);
      }
    });
    setMediaStates(newStates);
  }, [items?.length, items?.map(item => `${item.id}:${item.url}`).join(',')]);

  // Prune caches when items change
  useEffect(() => {
    if (!items || items.length === 0) return;
    const keys = new Set(items.map((item) => `${item.id}:${item.url}`));

    setProcessedUrls((prev) => {
      let changed = false;
      const next = new Map<string, CachedUrl>();
      prev.forEach((value, key) => {
        if (keys.has(key)) {
          next.set(key, value);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    // Clear pending timeouts for items that no longer exist
    itemTimeoutsRef.current.forEach((timeoutId, key) => {
      if (!keys.has(key)) {
        clearTimeout(timeoutId);
        itemTimeoutsRef.current.delete(key);
      }
    });

    failedCacheRef.current.forEach((_value, key) => {
      if (!keys.has(key)) failedCacheRef.current.delete(key);
    });
  }, [items?.length, items?.map(item => `${item.id}:${item.url}`).join(',')]); // Memoize by content

  // Resolve and refresh signed URLs with per-item debouncing
  useEffect(() => {
    if (!items || items.length === 0) return;

    const now = Date.now();
    const expiryMs = storageConfig.defaults.signedUrlExpiry * 1000;
    const bufferMs = getUrlExpiryBuffer() * 1000;
    const retryDelayMs = getUrlCheckInterval() * 1000;

    items.forEach((item) => {
      const cacheKey = `${item.id}:${item.url}`;
      const originalUrl = item.url;

      // Skip blob URLs (local previews)
      if (originalUrl.startsWith('blob:')) {
        return;
      }

      const cached = processedUrls.get(cacheKey);
      const needsRefresh = !cached || cached.expiresAt - now <= bufferMs;

      if (!needsRefresh) return;

      const lastFailedAt = failedCacheRef.current.get(cacheKey);
      if (lastFailedAt && now - lastFailedAt < retryDelayMs) return;

      const ref = extractStorageRef(originalUrl);
      if (!ref) return;

      if (pendingRef.current.has(cacheKey)) return;
      if (processingRef.current.has(cacheKey)) return; // Rate limiting

      // Clear existing timeout for this item
      const existingTimeout = itemTimeoutsRef.current.get(cacheKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout for this specific item
      const timeoutId = setTimeout(() => {
        itemTimeoutsRef.current.delete(cacheKey);
        
        pendingRef.current.add(cacheKey);
        processingRef.current.add(cacheKey);

        getUrl(ref.bucket, ref.path)
          .then((resolvedUrl) => {
            setProcessedUrls((prev) => {
              const next = new Map(prev);
              next.set(cacheKey, { url: resolvedUrl, expiresAt: Date.now() + expiryMs });
              return next;
            });
            failedCacheRef.current.delete(cacheKey);
            setFailedUrls((prev) => {
              if (!prev.has(originalUrl)) return prev;
              const next = new Set(prev);
              next.delete(originalUrl);
              return next;
            });
            // Mark as loaded when URL is successfully resolved
            setMediaStates((prev) => {
              const next = new Map(prev);
              next.set(cacheKey, { isLoading: false, hasError: false, isLoaded: true });
              return next;
            });
          })
          .catch(() => {
            failedCacheRef.current.set(cacheKey, Date.now());
            setFailedUrls((prev) => new Set(prev).add(originalUrl));
            // Mark as error when URL resolution fails
            setMediaStates((prev) => {
              const next = new Map(prev);
              next.set(cacheKey, { isLoading: false, hasError: true, isLoaded: false });
              return next;
            });
          })
          .finally(() => {
            pendingRef.current.delete(cacheKey);
            processingRef.current.delete(cacheKey); // Clear rate limiting
          });
      }, 500); // 500ms debounce per item

      itemTimeoutsRef.current.set(cacheKey, timeoutId);
    });
  }, [items, getUrl, refreshTick, processedUrls, getUrlExpiryBuffer, getUrlCheckInterval]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      itemTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      itemTimeoutsRef.current.clear();
    };
  }, []);

  // Process attachment URLs for rendering
  const processedItems = useMemo(() => {
    if (!items || items.length === 0) {
      return [];
    }

    const now = Date.now();

    return items.map((item) => {
      const cacheKey = `${item.id}:${item.url}`;
      const cached = processedUrls.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        return { ...item, processedUrl: cached.url };
      }

      return { ...item, processedUrl: item.url };
    });
  }, [items, processedUrls, refreshTick]);

  if (!items || items.length === 0) {
    return <div className="hidden" />;
  }

  const handleImageError = useCallback((url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url));
    // Update media state to show error
    setMediaStates((prev) => {
      const next = new Map(prev);
      prev.forEach((state, key) => {
        if (key.includes(url)) {
          next.set(key, { ...state, isLoading: false, hasError: true, isLoaded: false });
        }
      });
      return next;
    });
  }, []);

  const handleImageLoad = useCallback((url: string) => {
    // Update media state to show loaded
    setMediaStates((prev) => {
      const next = new Map(prev);
      prev.forEach((state, key) => {
        if (key.includes(url)) {
          next.set(key, { ...state, isLoading: false, hasError: false, isLoaded: true });
        }
      });
      return next;
    });
  }, []);

  const handleImageLoadStart = useCallback((url: string) => {
    // Update media state to show loading
    setMediaStates((prev) => {
      const next = new Map(prev);
      prev.forEach((state, key) => {
        if (key.includes(url)) {
          next.set(key, { ...state, isLoading: true, hasError: false, isLoaded: false });
        }
      });
      return next;
    });
  }, []);

  const activeMedia = useMemo(() => 
    processedItems.filter(
      (item) => !item.is_deleted && !failedUrls.has(item.processedUrl || item.url),
    ), [processedItems, failedUrls]
  );
  const count = processedItems.length;
  const activeCount = activeMedia.length;

  const handleMediaClick = useCallback((index: number) => {
    const clickedItem = processedItems[index];
    
    if (clickedItem.is_deleted || failedUrls.has(clickedItem.processedUrl || clickedItem.url)) {
      return;
    }
    
    const activeIndex = activeMedia.findIndex((m) => m.id === clickedItem.id);
    
    if (activeIndex !== -1) {
      setSelectedIndex(activeIndex);
    }
  }, [processedItems, failedUrls, activeMedia]);

  const modalImages = useMemo(() => 
    activeMedia
      .filter((item) => item.type === 'image' || item.type === 'video')
      .map((item) => ({ ...item, url: item.processedUrl || item.url })),
    [activeMedia]
  );

  const renderItem = useCallback((item: AttachmentWithUrl, index: number, layoutClass: string) => {
    const itemUrl = item.processedUrl || item.url;
    const cacheKey = `${item.id}:${item.url}`;
    const mediaState = mediaStates.get(cacheKey) || { isLoading: false, hasError: false, isLoaded: false };
    const isFailed = failedUrls.has(itemUrl) || item.is_deleted;
    
    // Show placeholder only if loading or if there's an error after attempting to load
    const shouldShowPlaceholder = mediaState.isLoading || (isFailed && mediaState.isLoaded);
    
    // Show actual content if not loading and no error, or if it's a blob URL (already loaded)
    const shouldShowContent = !mediaState.isLoading && !isFailed && (mediaState.isLoaded || itemUrl.startsWith('blob:'));

    return (
      <div
        key={item.id}
        className={cn(
          'relative overflow-hidden group bg-neutral-200 dark:bg-neutral-800',
          layoutClass
        )}
      >
        {shouldShowPlaceholder && (
          <MediaPlaceholder reason={isFailed ? 'error' : 'deleted'} isLoading={mediaState.isLoading} />
        )}
        {shouldShowContent && (
          <button
            type="button"
            className="w-full h-full relative block"
            onClick={() => handleMediaClick(index)}
          >
            {item.type === 'video' ? (
              <div className="w-full h-full relative bg-black">
                <video 
                  src={itemUrl} 
                  className="w-full h-full object-cover text-white"
                  onLoadedData={() => handleImageLoad(itemUrl)}
                  onError={() => handleImageError(itemUrl)}
                >
                  <track kind="captions" />
                </video>
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <PlayCircle className="w-10 h-10 text-white/80" />
                </div>
              </div>
            ) : (
              <Image
                src={itemUrl}
                alt=""
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                unoptimized
                onLoadStart={() => handleImageLoadStart(itemUrl)}
                onLoad={() => handleImageLoad(itemUrl)}
                onError={() => handleImageError(itemUrl)}
                sizes="(max-width: 768px) 280px, 400px"
              />
            )}
            {index === 3 && activeCount > 4 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white z-10">
                <span className="text-xl font-bold">+{activeCount - 4}</span>
              </div>
            )}
          </button>
        )}
      </div>
    );
  }, [failedUrls, handleMediaClick, handleImageLoad, handleImageError, handleImageLoadStart, activeCount, mediaStates]);

  return (
    <>
      <div
        className={cn(
          'grid gap-1 overflow-hidden rounded-2xl w-full',
          {
            'w-[400px] max-w-full max-sm:w-[280px]': activeCount === 1,
            'w-[350px] max-w-full max-sm:w-[250px]': activeCount === 2,
            'w-[320px] max-w-full max-sm:w-[220px]': activeCount === 3,
            'w-[300px] max-w-full max-sm:w-[200px]': activeCount >= 4,
          }
        )}
      >
        {activeCount === 1 && (
          <div
            className="relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 rounded-2xl"
            style={{
              aspectRatio:
                processedItems[0].metadata?.width && processedItems[0].metadata?.height
                  ? `${processedItems[0].metadata.width}/${processedItems[0].metadata.height}`
                  : '16/10',
              maxHeight: '500px',
            }}
          >
            {(() => {
              const item = processedItems[0];
              const itemUrl = item.processedUrl || item.url;
              const cacheKey = `${item.id}:${item.url}`;
              const mediaState = mediaStates.get(cacheKey) || { isLoading: false, hasError: false, isLoaded: false };
              const isFailed = failedUrls.has(itemUrl) || item.is_deleted;
              
              // Show placeholder only if loading or if there's an error after attempting to load
              const shouldShowPlaceholder = mediaState.isLoading || (isFailed && mediaState.isLoaded);
              
              // Show actual content if not loading and no error, or if it's a blob URL (already loaded)
              const shouldShowContent = !mediaState.isLoading && !isFailed && (mediaState.isLoaded || itemUrl.startsWith('blob:'));

              return (
                <>
                  {shouldShowPlaceholder && (
                    <MediaPlaceholder reason={isFailed ? 'error' : 'deleted'} isLoading={mediaState.isLoading} />
                  )}
                  {shouldShowContent && (
                    <button
                      type="button"
                      onClick={() => handleMediaClick(0)}
                      className="w-full h-full relative block"
                    >
                      {item.type === 'video' ? (
                        <video
                          src={itemUrl}
                          className="w-full h-full object-contain bg-black"
                          onLoadedData={() => handleImageLoad(itemUrl)}
                          onError={() => handleImageError(itemUrl)}
                        >
                          <track kind="captions" />
                        </video>
                      ) : (
                        <Image
                          src={itemUrl}
                          alt=""
                          fill
                          className="object-contain bg-neutral-900/10"
                          unoptimized
                          onLoadStart={() => handleImageLoadStart(itemUrl)}
                          onLoad={() => handleImageLoad(itemUrl)}
                          onError={() => handleImageError(itemUrl)}
                          sizes="(max-width: 768px) 280px, 400px"
                        />
                      )}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeCount === 2 && (
          <div className="grid grid-cols-2 gap-1">
            {processedItems.map((item, i) => renderItem(item, i, 'aspect-square'))}
          </div>
        )}

        {activeCount === 3 && (
          <div className="grid grid-cols-2 gap-1">
            {renderItem(processedItems[0], 0, 'col-span-2 aspect-video')}
            {renderItem(processedItems[1], 1, 'aspect-square')}
            {renderItem(processedItems[2], 2, 'aspect-square')}
          </div>
        )}

        {activeCount >= 4 && (
          <div className="grid grid-cols-2 gap-1">
            {processedItems.slice(0, 4).map((item, i) => renderItem(item, i, 'aspect-square'))}
          </div>
        )}
      </div>

      <Suspense fallback={<div className="hidden" />}>
        <ImageModal
          isOpen={selectedIndex !== null}
          images={modalImages}
          initialIndex={selectedIndex ?? 0}
          onClose={() => setSelectedIndex(null)}
        />
      </Suspense>
    </>
  );
}
