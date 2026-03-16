import { useQuery } from '@tanstack/react-query';
import type { StorageConfigResponse } from '@/config/storage.config';

export function useStorageConfig() {
  return useQuery({
    queryKey: ['storage-config'],
    queryFn: async (): Promise<StorageConfigResponse> => {
      const response = await fetch('/api/storage/config');
      if (!response.ok) {
        throw new Error('Failed to fetch storage config');
      }
      const data = await response.json();
      return data;
    },
    staleTime: 1000 * 60 * 30, // Cache for 30 min
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
