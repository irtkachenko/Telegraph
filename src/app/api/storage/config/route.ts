import { NextResponse } from 'next/server';
import { storageConfig } from '@/config/storage.config';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: bucket, error } = await supabase.storage.getBucket(
      storageConfig.buckets.attachments.name,
    );

    // If bucket not found or error, return defaults from static config
    if (error || !bucket) {
      return NextResponse.json({
        buckets: [
          {
            name: storageConfig.buckets.attachments.name,
            public: !storageConfig.buckets.attachments.isPrivate,
            createdAt: new Date().toISOString(),
          },
        ],
        limits: {
          maxFileSize: String(storageConfig.buckets.attachments.maxFileSize),
          allowedTypes: storageConfig.buckets.attachments.allowedExtensions.map((ext) => `.${ext}`),
          signedUrlExpiry: storageConfig.defaultSignedUrlExpiry,
        },
      });
    }

    const config = {
      buckets: [
        {
          name: bucket.name,
          public: bucket.public,
          createdAt: bucket.created_at,
        },
      ],
      limits: {
        maxFileSize: String(
          bucket.file_size_limit ?? storageConfig.buckets.attachments.maxFileSize,
        ),
        allowedTypes:
          Array.isArray(bucket.allowed_mime_types) && bucket.allowed_mime_types.length > 0
            ? bucket.allowed_mime_types
            : storageConfig.buckets.attachments.allowedExtensions.map((ext) => `.${ext}`),
        signedUrlExpiry: storageConfig.defaultSignedUrlExpiry,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Storage config error:', error);
    return NextResponse.json({ error: 'Failed to get storage config' }, { status: 500 });
  }
}
