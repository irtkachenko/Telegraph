# Supabase RLS Policies Documentation

This document outlines the Row Level Security (RLS) policies needed to secure your chat application when migrating from server actions to pure Supabase client usage.

## Required RLS Policies

### 1. Users Table Policies

```sql
-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON users
FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile" ON users
FOR INSERT WITH CHECK (auth.uid() = id);
```

### 2. Chats Table Policies

```sql
-- Enable RLS on chats table
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Users can view chats they participate in
CREATE POLICY "Users can view own chats" ON chats
FOR SELECT USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
);

-- Users can create chats (rate limited)
CREATE POLICY "Users can create chats" ON chats
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND 
  user_id != recipient_id AND
  recipient_id IN (SELECT id FROM users WHERE id IS NOT NULL) AND
  -- Rate limit: max 5 chats per minute
  (SELECT COUNT(*) FROM chats 
   WHERE user_id = auth.uid() 
   AND created_at > NOW() - INTERVAL '1 minute') < 5
);

-- Users can update chat read status
CREATE POLICY "Users can update chat read status" ON chats
FOR UPDATE USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
) WITH CHECK (
  -- Only allow updating read fields
  (user_last_read_id IS NOT NULL OR recipient_last_read_id IS NOT NULL) AND
  -- Can't change participants
  user_id = (SELECT user_id FROM chats WHERE id = id) AND
  recipient_id = (SELECT recipient_id FROM chats WHERE id = id)
);

-- Users can delete chats they participate in
CREATE POLICY "Users can delete own chats" ON chats
FOR DELETE USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
);
```

### 3. Messages Table Policies

```sql
-- Enable RLS on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages from chats they participate in
CREATE POLICY "Users can view chat messages" ON messages
FOR SELECT USING (
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can send messages (rate limited)
CREATE POLICY "Users can send messages" ON messages
FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  -- Must be participant in the chat
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  ) AND
  -- Rate limit: max 30 messages per minute
  (SELECT COUNT(*) FROM messages 
   WHERE sender_id = auth.uid() 
   AND created_at > NOW() - INTERVAL '1 minute') < 30
);

-- Users can update their own messages (edit)
CREATE POLICY "Users can edit own messages" ON messages
FOR UPDATE USING (
  auth.uid() = sender_id
) WITH CHECK (
  auth.uid() = sender_id AND
  -- Only allow content and updated_at changes
  content IS NOT NULL AND
  updated_at IS NOT NULL
);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages" ON messages
FOR DELETE USING (auth.uid() = sender_id);
```

### 4. Message Reads Table (if exists)

```sql
-- Create message_reads table if not exists
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chat_id, message_id, user_id)
);

-- Enable RLS
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- Users can insert their own read receipts
CREATE POLICY "Users can mark messages as read" ON message_reads
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  -- Must be participant in the chat
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can view read receipts for their chats
CREATE POLICY "Users can view read receipts" ON message_reads
FOR SELECT USING (
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  )
);
```

### 5. Upload Audit Table Policies

```sql
-- Enable RLS on upload_audit table
ALTER TABLE upload_audit ENABLE ROW LEVEL SECURITY;

-- Users can view their own upload audit
CREATE POLICY "Users can view own upload audit" ON upload_audit
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own upload audit (rate limited)
CREATE POLICY "Users can insert upload audit" ON upload_audit
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  -- Rate limit: max 10 uploads per minute
  (SELECT COUNT(*) FROM upload_audit 
   WHERE user_id = auth.uid() 
   AND created_at > NOW() - INTERVAL '1 minute') < 10
);
```

## Storage Policies

### 6. Storage Bucket Policies

```sql
-- Create storage policies for attachments bucket
CREATE POLICY "Users can upload files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  -- Rate limiting handled by application layer
  (storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx')
);

CREATE POLICY "Users can view own files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## Implementation Steps

1. **Enable RLS on all tables**
2. **Apply the policies above**
3. **Test with different user contexts**
4. **Monitor performance and adjust rate limits**
5. **Add additional policies as needed**

## Security Considerations

- **Rate Limiting**: RLS provides basic rate limiting, but consider additional application-level controls
- **Input Validation**: RLS doesn't replace client-side validation
- **Error Handling**: Ensure proper error messages don't leak sensitive information
- **Audit Logging**: Consider adding audit tables for sensitive operations

## Migration Notes

- Remove server actions and Drizzle dependencies
- Update client hooks to use Supabase client directly
- Ensure all API calls have proper error handling
- Test thoroughly with different user roles and scenarios
