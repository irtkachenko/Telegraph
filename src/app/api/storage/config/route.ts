import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface BucketConfig {
  name: string;
  public: boolean;
  createdAt: string;
}

interface StorageLimits {
  maxFileSize: string;
  allowedTypes: string[];
  signedUrlExpiry: number;
}

interface StorageConfigResponse {
  buckets: BucketConfig[];
  limits: StorageLimits;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: bucket, error } = await supabase.storage.getBucket('attachments');

    if (error || !bucket) {
      const fallbackConfig: StorageConfigResponse = {
        buckets: [{
          name: 'attachments',
          public: true,
          createdAt: new Date().toISOString(),
        }],
        limits: {
          maxFileSize: '52428800',
          allowedTypes: ['image/*', 'video/*', 'application/pdf'],
          signedUrlExpiry: 3600,
        },
      };

      return NextResponse.json(fallbackConfig);
    }

    const config: StorageConfigResponse = {
      buckets: [{
        name: bucket.name,
        public: bucket.public,
        createdAt: bucket.created_at,
      }],
      limits: {
        maxFileSize: String(bucket.file_size_limit ?? '52428800'),
        allowedTypes: Array.isArray(bucket.allowed_mime_types) && bucket.allowed_mime_types.length > 0
          ? bucket.allowed_mime_types
          : ['image/*', 'video/*', 'application/pdf'],
        signedUrlExpiry: 3600,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Storage config error:', error);
    return NextResponse.json(
      { error: 'Failed to get storage config' }, 
      { status: 500 }
    );
  }
}
