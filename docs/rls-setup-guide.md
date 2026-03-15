# RLS Policies Setup Guide for Supabase

## Quick Setup Steps

### 1. Enable RLS on All Tables

Run these commands in Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create message_reads table if it doesn't exist
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(chat_id, message_id, user_id)
);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_audit ENABLE ROW LEVEL SECURITY;
```

### 2. Users Table Policies

```sql
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

### 3. Chats Table Policies

```sql
-- Users can view chats they participate in
CREATE POLICY "Users can view own chats" ON chats
FOR SELECT USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
);

-- Users can create chats
CREATE POLICY "Users can create chats" ON chats
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND 
  user_id != recipient_id AND
  recipient_id IN (SELECT id FROM users WHERE id IS NOT NULL)
);

-- Users can update chat read status
CREATE POLICY "Users can update chat read status" ON chats
FOR UPDATE USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
);

-- Users can delete chats they participate in
CREATE POLICY "Users can delete own chats" ON chats
FOR DELETE USING (
  auth.uid() = user_id OR 
  auth.uid() = recipient_id
);
```

### 4. Messages Table Policies

```sql
-- Users can view messages from chats they participate in
CREATE POLICY "Users can view chat messages" ON messages
FOR SELECT USING (
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can send messages
CREATE POLICY "Users can send messages" ON messages
FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  chat_id IN (
    SELECT id FROM chats 
    WHERE user_id = auth.uid() OR recipient_id = auth.uid()
  )
);

-- Users can edit their own messages
CREATE POLICY "Users can edit own messages" ON messages
FOR UPDATE USING (auth.uid() = sender_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages" ON messages
FOR DELETE USING (auth.uid() = sender_id);
```

### 5. Message Reads Table Policies

```sql
-- Users can insert their own read receipts
CREATE POLICY "Users can mark messages as read" ON message_reads
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
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

### 6. Upload Audit Table Policies

```sql
-- Users can view their own upload audit
CREATE POLICY "Users can view own upload audit" ON upload_audit
FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own upload audit
CREATE POLICY "Users can insert upload audit" ON upload_audit
FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 7. Storage Policies (for attachments bucket)

```sql
-- Insert policy for file uploads
CREATE POLICY "Users can upload files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Select policy for file access
CREATE POLICY "Users can view own files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Update policy for file updates
CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete policy for file deletion
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE USING (
  bucket_id = 'attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## Testing RLS Policies

### Test User Access

```sql
-- Test as different users
SET LOCAL "request.jwt.claims" = '{"sub": "USER_ID_HERE", "role": "authenticated"}';

-- Test queries
SELECT * FROM users WHERE id = 'USER_ID_HERE';
SELECT * FROM chats WHERE user_id = 'USER_ID_HERE' OR recipient_id = 'USER_ID_HERE';
SELECT * FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = 'USER_ID_HERE' OR recipient_id = 'USER_ID_HERE');
```

### Verify Policies

```sql
-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'chats', 'messages', 'message_reads', 'upload_audit');
```

## Important Notes

1. **Replace USER_ID_HERE** with actual user UUIDs from your auth.users table
2. **Test thoroughly** with different user contexts
3. **Monitor performance** - RLS adds overhead to queries
4. **Consider rate limiting** at the database level if needed
5. **Backup your database** before applying policies

## Troubleshooting

### Common Issues:

1. **"permission denied" errors** - Check if RLS is enabled and policies exist
2. **"no such table" errors** - Verify table names match exactly
3. **Performance issues** - Consider adding indexes for policy conditions
4. **Storage policies not working** - Check bucket exists and foldername extraction

### Debug Commands:

```sql
-- Check current user context
SELECT current_setting('request.jwt.claims', true);

-- Test specific policy
SELECT * FROM pg_policies WHERE tablename = 'chats';

-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'chats';
```

Run these SQL commands in your Supabase SQL Editor to complete the migration!
