import { create } from 'zustand';

interface CachedUrl {
  url: string;
  expiresAt: number;
}

interface MediaState {
  isLoading: boolean;
  hasError: boolean;
  isLoaded: boolean;
}

interface StorageStore {
  // Кеш URL: 'bucket:path' -> { url, expiresAt }
  urlCache: Record<string, CachedUrl>;
  // Стани завантаження: 'bucket:path' -> MediaState
  mediaStates: Record<string, MediaState>;
  // Помилкові URL:Set оригінальних URL
  failedUrls: Set<string>;
  
  // Дії
  setUrl: (key: string, data: CachedUrl) => void;
  setMediaState: (key: string, state: Partial<MediaState>) => void;
  addFailedUrl: (url: string) => void;
  removeFailedUrl: (url: string) => void;
  clearCache: () => void;
}

/**
 * Глобальний стор для керування станом сховища та кешуванням підписаних URL.
 * Це забезпечує стабільність медіа-файлів при скролі та переключенні сторінок.
 */
export const useStorageStore = create<StorageStore>((set) => ({
  urlCache: {},
  mediaStates: {},
  failedUrls: new Set(),

  setUrl: (key, data) => 
    set((state) => ({
      urlCache: { ...state.urlCache, [key]: data }
    })),

  setMediaState: (key, newState) =>
    set((state) => ({
      mediaStates: {
        ...state.mediaStates,
        [key]: {
          ...(state.mediaStates[key] || { isLoading: false, hasError: false, isLoaded: false }),
          ...newState
        }
      }
    })),

  addFailedUrl: (url) =>
    set((state) => {
      const next = new Set(state.failedUrls);
      next.add(url);
      return { failedUrls: next };
    }),

  removeFailedUrl: (url) =>
    set((state) => {
      const next = new Set(state.failedUrls);
      next.delete(url);
      return { failedUrls: next };
    }),

  clearCache: () => set({ urlCache: {}, mediaStates: {}, failedUrls: new Set() }),
}));
