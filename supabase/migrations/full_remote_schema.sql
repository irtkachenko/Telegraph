-- ==========================================
-- 1. ТАБЛИЦІ (STRUCTURE)
-- ==========================================

-- Таблиця користувачів
CREATE TABLE IF NOT EXISTS public.user (
    id uuid PRIMARY KEY,
    name text,
    email text NOT NULL,
    "emailVerified" timestamp without time zone,
    image text,
    last_seen timestamp with time zone DEFAULT now()
);

-- Таблиця чатів
CREATE TABLE IF NOT EXISTS public.chats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
    recipient_id uuid REFERENCES public.user(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New Chat'::text,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    user_last_read_id uuid,
    recipient_last_read_id uuid
);

-- Таблиця повідомлень
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
    content text NOT NULL,
    attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
    reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone
);

-- Таблиця для аудиту завантажень (Rate limiting)
CREATE TABLE IF NOT EXISTS public.upload_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Таблиця для логування рейт-лімітів (якщо використовується функцією check_action_limit)
CREATE TABLE IF NOT EXISTS public.ratelimit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    action_type text,
    created_at timestamp with time zone DEFAULT now()
);

-- ==========================================
-- 2. ФУНКЦІЇ (LOGIC)
-- ==========================================

-- Оновлення часу останньої активності
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Розумне оновлення повідомлення
CREATE OR REPLACE FUNCTION public.handle_message_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.updated_at = NOW();
    ELSE
        NEW.updated_at = OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Створення профілю при реєстрації (Triggered from auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user (id, email, name, image)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ліміт повідомлень (1000 на добу)
CREATE OR REPLACE FUNCTION public.limit_daily_messages()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM messages WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 day') >= 1000 THEN
    RAISE EXCEPTION 'Daily limit reached (1000)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ліміт створення чатів (7 на хвилину)
CREATE OR REPLACE FUNCTION public.limit_chat_creation()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM chats WHERE user_id = NEW.user_id AND created_at > now() - interval '1 minute') >= 7 THEN
    RAISE EXCEPTION 'Забагато нових чатів. Почекай хвилину.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Рейт-ліміт завантаження файлів
CREATE OR REPLACE FUNCTION public.check_upload_rate_limit()
RETURNS TRIGGER AS $$
DECLARE row_count INT; current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN current_user_id := NEW.user_id; END IF;
    SELECT count(*) INTO row_count FROM public.upload_audit WHERE user_id = current_user_id AND created_at > NOW() - INTERVAL '1 minute';
    IF row_count >= 10 THEN RAISE EXCEPTION 'Upload rate limit exceeded.'; END IF;
    INSERT INTO public.upload_audit (user_id) VALUES (current_user_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Позначення чату як прочитаного
CREATE OR REPLACE FUNCTION public.mark_chat_as_read(p_chat_id uuid, p_user_id uuid, p_message_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.chats SET 
        user_last_read_id = CASE WHEN user_id = p_user_id THEN p_message_id ELSE user_last_read_id END,
        recipient_last_read_id = CASE WHEN recipient_id = p_user_id THEN p_message_id ELSE recipient_last_read_id END
    WHERE id = p_chat_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 3. ТРИГЕРИ (HOOKS)
-- ==========================================

-- На таблицю messages
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION handle_message_update();
CREATE TRIGGER trigger_limit_daily_messages BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION limit_daily_messages();

-- На таблицю chats
CREATE TRIGGER trigger_limit_chat_creation BEFORE INSERT ON public.chats FOR EACH ROW EXECUTE FUNCTION limit_chat_creation();

-- ==========================================
-- 4. ПОЛІТИКИ БЕЗПЕКИ (RLS)
-- ==========================================

ALTER TABLE public.user ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- User Policies
CREATE POLICY "Users can view all contacts" ON public.user FOR SELECT USING (true);

-- Chat Policies
CREATE POLICY "Users can view their own chats" ON public.chats FOR SELECT USING (auth.uid() = user_id OR auth.uid() = recipient_id);
CREATE POLICY "Allow members full access to their chats" ON public.chats FOR ALL USING (auth.uid() = user_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can insert their own chats" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Message Policies
CREATE POLICY "Users can view messages in their chats" ON public.messages FOR SELECT USING (EXISTS (SELECT 1 FROM chats WHERE chats.id = messages.chat_id AND (chats.user_id = auth.uid() OR chats.recipient_id = auth.uid())));
CREATE POLICY "Allow update for owners" ON public.messages FOR UPDATE USING (auth.uid() = sender_id);
CREATE POLICY "Users can insert messages in their chats" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);