-- Enable REPLICA IDENTITY FULL for the tables to provide full row data in payloads
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.chats REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Ensure the supabase_realtime publication includes these tables
-- This allows Supabase to broadcast changes for these tables via WebSockets
DO $$ 
BEGIN
    -- Check if the publication exists
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- Add tables to existing publication. 
        -- We use a sub-DO block to handle "already exists" errors for each table.
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
        
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
        
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    ELSE
        -- Create publication and add tables
        CREATE PUBLICATION supabase_realtime FOR TABLE public.users, public.chats, public.messages;
    END IF;
END $$;
