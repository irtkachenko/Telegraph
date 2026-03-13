-- ==========================================
-- 1. СИСТЕМА ЛІМІТІВ (RATE LIMITING)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.upload_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_audit_user_created ON public.upload_audit(user_id, created_at);

CREATE OR REPLACE FUNCTION public.check_upload_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    upload_count INT;
BEGIN
    SELECT COUNT(*) INTO upload_count
    FROM public.upload_audit
    WHERE user_id = auth.uid()
    AND created_at > now() - interval '60 seconds';

    IF upload_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: You can only upload 10 files per minute.';
    END IF;

    INSERT INTO public.upload_audit (user_id) VALUES (auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Прив'язка ліміту до сховища
DROP TRIGGER IF EXISTS tr_check_upload_rate_limit ON storage.objects;
CREATE TRIGGER tr_check_upload_rate_limit
BEFORE INSERT ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.check_upload_rate_limit();


-- ==========================================
-- 2. УВІМКНЕННЯ RLS (Row Level Security)
-- ==========================================
-- Важливо: використовуємо назви таблиць з твоєї Drizzle схеми
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- 3. ПОЛІТИКИ ДЛЯ КОРИСТУВАЧІВ (Таблиця "user")
-- ==========================================
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.users;
CREATE POLICY "Profiles are viewable by everyone" ON public.users
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
FOR UPDATE USING (auth.uid()::text = id);


-- ==========================================
-- 4. ПОЛІТИКИ ДЛЯ ЧАТІВ (chats)
-- ==========================================
DROP POLICY IF EXISTS "Users can view their chats" ON public.chats;
CREATE POLICY "Users can view their chats" ON public.chats
FOR SELECT USING (
    user_id = auth.uid()::text OR recipient_id = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can create chats" ON public.chats;
CREATE POLICY "Users can create chats" ON public.chats
FOR INSERT WITH CHECK (
    user_id = auth.uid()::text
);


-- ==========================================
-- 5. ПОЛІТИКИ ДЛЯ ПОВІДОМЛЕНЬ (messages)
-- ==========================================
DROP POLICY IF EXISTS "Users can view messages in their chats" ON public.messages;
CREATE POLICY "Users can view messages in their chats" ON public.messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = messages.chat_id
        AND (c.user_id = auth.uid()::text OR c.recipient_id = auth.uid()::text)
    )
);

DROP POLICY IF EXISTS "Users can insert messages in their chats" ON public.messages;
CREATE POLICY "Users can insert messages in their chats" ON public.messages
FOR INSERT WITH CHECK (
    sender_id = auth.uid()::text
    AND EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = messages.chat_id
        AND (c.user_id = auth.uid()::text OR c.recipient_id = auth.uid()::text)
    )
);


-- ==========================================
-- 6. ПОЛІТИКИ ДЛЯ СХОВИЩА (storage)
-- ==========================================
-- Створення бакета, якщо він не існує
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Доступ на читання учасникам чату
-- Використовуємо foldername(name)[1] як chat_id
CREATE POLICY "Participants can view chat attachments"
ON storage.objects FOR SELECT USING (
    bucket_id = 'attachments'
    AND EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = (storage.foldername(name))[1]
        AND (c.user_id = auth.uid()::text OR c.recipient_id = auth.uid()::text)
    )
);

-- Доступ на завантаження
CREATE POLICY "Participants can upload chat attachments"
ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND EXISTS (
        SELECT 1 FROM public.chats c
        WHERE c.id = (storage.foldername(name))[1]
        AND (c.user_id = auth.uid()::text OR c.recipient_id = auth.uid()::text)
    )
);

-- Видалення тільки власником (завантажувачем)
CREATE POLICY "Users can delete own chat attachments"
ON storage.objects FOR DELETE USING (
    bucket_id = 'attachments'
    AND owner = auth.uid()
);