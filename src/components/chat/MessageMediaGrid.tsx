'use client';

import { FileX, ImageOff, Loader2, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isMediaType, storageConfig } from '@/config/storage.config';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { cn } from '@/lib/utils';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';

const ImageModal = lazy(() => import('./ImageModal'));

interface MessageMediaGridProps {
  items: Attachment[];
}

interface AttachmentWithUrl extends Attachment {
  processedUrl?: string;
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
  const bucketName = storageConfig.buckets.attachments.name;
  const normalized = url.startsWith('/') ? url.slice(1) : url;
  if (normalized.startsWith(`${bucketName}/`)) {
    return { bucket: bucketName, path: normalized.slice(bucketName.length + 1) };
  }

  return null;
}

const MediaPlaceholder = ({ reason = 'deleted' }: { reason?: 'deleted' | 'error' }) => {
  const Icon = reason === 'deleted' ? FileX : ImageOff;
  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center min-h-[150px]">
      <Icon className="w-5 h-5 text-neutral-500 mb-2" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {reason === 'deleted' ? 'Deleted' : 'Error'}
      </p>
    </div>
  );
};

export default function MessageMediaGrid({ items }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [processedItems, setProcessedItems] = useState<AttachmentWithUrl[]>([]);
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const { getUrl } = useStorageUrl();
  const processedCacheRef = useRef<Map<string, string>>(new Map());
  const failedCacheRef = useRef<Set<string>>(new Set());

  // Process attachment URLs to handle private storage
  useEffect(() => {
    const processUrls = async () => {
      if (!items || items.length === 0) {
        setProcessedItems([]);
        return;
      }

      const processed = await Promise.all(
        items.map(async (item) => {
          const cacheKey = `${item.id}:${item.url}`;
          const cached = processedCacheRef.current.get(cacheKey);
          if (cached) {
            return { ...item, processedUrl: cached };
          }
          if (failedCacheRef.current.has(cacheKey)) {
            return { ...item, processedUrl: item.url };
          }

          // Якщо це blob URL (оптимістичне повідомлення), використовуємо як є
          if (item.url.startsWith('blob:')) {
            processedCacheRef.current.set(cacheKey, item.url);
            return { ...item, processedUrl: item.url };
          }

          // Skip if already processed or if URL is already a signed URL
          if (item.url.includes('?token=')) {
            return { ...item, processedUrl: item.url };
          }

          try {
            const ref = extractStorageRef(item.url);
            if (ref) {
              const resolvedUrl = await getUrl(ref.bucket, ref.path, {
                expiresIn: storageConfig.defaultSignedUrlExpiry,
              });
              processedCacheRef.current.set(cacheKey, resolvedUrl);
              return { ...item, processedUrl: resolvedUrl };
            }

            // If not a Supabase storage URL, use as-is
            processedCacheRef.current.set(cacheKey, item.url);
            return { ...item, processedUrl: item.url };
          } catch (_error) {
            // Avoid spamming errors for missing/legacy paths; fall back to original URL
            handleError(
              new NetworkError(
                'Failed to process attachment URL',
                'attachment',
                'ATTACHMENT_URL_PROCESS_ERROR',
                500,
              ),
              'MessageMediaGrid',
              { enableToast: false },
            );
            failedCacheRef.current.add(cacheKey);
            // Fallback to original URL
            return { ...item, processedUrl: item.url };
          }
        }),
      );

      setProcessedItems(processed);
      
      // Only set loading for images that are not already cached
      const newImageUrls = processed
        .filter(item => item.type === 'image')
        .map(item => {
          const url = item.processedUrl || item.url;
          const cacheKey = `${item.id}:${item.url}`;
          // Only add to loading if not already cached and not already loading
          return !processedCacheRef.current.has(cacheKey) && !loadingImages.has(url) ? url : null;
        })
        .filter((url): url is string => url !== null);
      
      if (newImageUrls.length > 0) {
        setLoadingImages(prev => new Set([...prev, ...newImageUrls]));
      }
    };

    processUrls();
  }, [items, getUrl]);

  if (!items || items.length === 0) {
    return <div className="hidden" />;
  }

  const handleImageError = useCallback((url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url));
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(url);
      return newSet;
    });
  }, []);

  const handleImageLoad = useCallback((url: string) => {
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(url);
      return newSet;
    });
  }, []);

  const handleImageLoadStart = useCallback((url: string) => {
    setLoadingImages((prev) => new Set(prev).add(url));
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

  const renderItem = useCallback((item: AttachmentWithUrl, index: number, isLarge = false) => {
    const itemUrl = item.processedUrl || item.url;
    const isFailed = failedUrls.has(itemUrl) || item.is_deleted;
    const isLoading = loadingImages.has(itemUrl);

    return (
      <div
        key={item.id}
        className={cn(
          'relative overflow-hidden group bg-neutral-200 dark:bg-neutral-800',
          isLarge ? 'col-span-2 aspect-video' : 'aspect-square',
        )}
        style={{
          aspectRatio: item.metadata?.width && item.metadata?.height 
            ? `${item.metadata.width}/${item.metadata.height}` 
            : isLarge ? '16/9' : '1/1'
        }}
      >
        {isFailed ? (
          <MediaPlaceholder reason={item.is_deleted ? 'deleted' : 'error'} />
        ) : (
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
              <>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-10">
                    <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                  </div>
                )}
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
              </>
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
  }, [failedUrls, loadingImages, handleMediaClick, handleImageLoad, handleImageError, handleImageLoadStart, activeCount]);

  return (
    <>
      <div
        className={cn(
          'grid gap-1 overflow-hidden rounded-2xl w-[400px] max-w-full max-sm:w-[280px]',
          activeCount === 1 ? 'grid-cols-1' : 'grid-cols-2',
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
            {processedItems[0].is_deleted ||
            failedUrls.has(processedItems[0].processedUrl || processedItems[0].url) ? (
              <MediaPlaceholder reason="error" />
            ) : (
              <button
                type="button"
                onClick={() => handleMediaClick(0)}
                className="w-full h-full relative block"
              >
                {processedItems[0].type === 'video' ? (
                  <video
                    src={processedItems[0].processedUrl || processedItems[0].url}
                    className="w-full h-full object-contain bg-black"
                    onLoadedData={() => handleImageLoad(processedItems[0].processedUrl || processedItems[0].url)}
                    onError={() => handleImageError(processedItems[0].processedUrl || processedItems[0].url)}
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <>
                    {loadingImages.has(processedItems[0].processedUrl || processedItems[0].url) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 z-10">
                        <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
                      </div>
                    )}
                    <Image
                      src={processedItems[0].processedUrl || processedItems[0].url}
                      alt=""
                      fill
                      className="object-contain bg-neutral-900/10"
                      unoptimized
                      onLoadStart={() => handleImageLoadStart(processedItems[0].processedUrl || processedItems[0].url)}
                      onLoad={() => handleImageLoad(processedItems[0].processedUrl || processedItems[0].url)}
                      onError={() =>
                        handleImageError(processedItems[0].processedUrl || processedItems[0].url)
                      }
                      sizes="(max-width: 768px) 280px, 400px"
                    />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {activeCount === 2 && processedItems.map((item, i) => renderItem(item, i))}

        {activeCount === 3 && (
          <>
            {renderItem(processedItems[0], 0, true)}
            {renderItem(processedItems[1], 1)}
            {renderItem(processedItems[2], 2)}
          </>
        )}

        {activeCount >= 4 && processedItems.slice(0, 4).map((item, i) => renderItem(item, i))}
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
