-- Tune DB rate limits, remove double throttling, and clean legacy objects.

-- 1) Set/refresh all action limits in one place.
-- Deletes are intentionally less strict than before.
insert into public.rate_limit_config (action, max_count, window_seconds, enabled)
values
  ('chat_create', 30, 60, true),
  ('chat_update', 180, 60, true),
  ('chat_delete', 60, 60, true),
  ('chat_mark_read', 1200, 60, true),
  ('message_send', 180, 60, true),
  ('message_edit', 300, 60, true),
  ('message_delete', 360, 60, true),
  ('storage_upload', 120, 60, true),
  ('storage_delete', 300, 60, true)
on conflict (action) do update
set
  max_count = excluded.max_count,
  window_seconds = excluded.window_seconds,
  enabled = excluded.enabled;

-- 2) Avoid double rate-limit counting:
-- inserts/updates/deletes are already throttled by triggers on tables.
create or replace function public.rpc_send_message(
    p_chat_id uuid,
    p_content text,
    p_reply_to_id uuid default null,
    p_attachments jsonb default '[]'::jsonb,
    p_client_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
    new_message public.messages;
    v_is_participant boolean;
begin
    select exists (
        select 1
        from public.chats
        where id = p_chat_id
          and (user_id = auth.uid() or recipient_id = auth.uid())
    ) into v_is_participant;

    if not v_is_participant then
        raise exception 'Forbidden: You are not a participant in this chat' using errcode = '42501';
    end if;

    insert into public.messages(chat_id, sender_id, content, reply_to_id, attachments, client_id)
    values (p_chat_id, auth.uid(), p_content, p_reply_to_id, p_attachments, p_client_id)
    returning * into new_message;

    return new_message;
end;
$$;

create or replace function public.rpc_create_chat(
    p_recipient_id uuid
)
returns public.chats
language plpgsql
security definer
set search_path = public
as $$
declare
    new_chat public.chats;
begin
    if p_recipient_id = auth.uid() then
        raise exception 'Bad Request: Cannot create a chat with yourself' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.users where id = p_recipient_id) then
        raise exception 'Not Found: Recipient user does not exist' using errcode = 'P0001';
    end if;

    insert into public.chats(user_id, recipient_id, title)
    values (auth.uid(), p_recipient_id, 'Chat')
    returning * into new_chat;

    return new_chat;
end;
$$;

create or replace function public.rpc_delete_message(p_message_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.messages
    where id = p_message_id
      and sender_id = auth.uid();

    return p_message_id;
end;
$$;

create or replace function public.rpc_edit_message(p_message_id uuid, p_content text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_message public.messages;
begin
    update public.messages
    set content = p_content,
        updated_at = now()
    where id = p_message_id
      and sender_id = auth.uid()
    returning * into updated_message;

    if updated_message.id is null then
        raise exception 'Message not found or not owned' using errcode = 'P0001';
    end if;

    return updated_message;
end;
$$;

create or replace function public.rpc_mark_chat_as_read(p_chat_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    c public.chats;
begin
    select * into c from public.chats where id = p_chat_id;
    if c.id is null then
        raise exception 'Chat not found' using errcode = 'P0001';
    end if;

    if c.user_id = auth.uid() then
        update public.chats set user_last_read_id = p_message_id where id = p_chat_id;
    elsif c.recipient_id = auth.uid() then
        update public.chats set recipient_last_read_id = p_message_id where id = p_chat_id;
    else
        raise exception 'Not a participant' using errcode = '28000';
    end if;
end;
$$;

-- 3) Remove legacy upload limiter (it enforced an additional hard-coded 10/min).
drop trigger if exists tr_check_upload_rate_limit on storage.objects;
drop function if exists public.check_upload_rate_limit();

-- 4) Cleanup legacy/dead objects not used by frontend or current DB flow.
drop function if exists public.mark_chat_as_read(uuid, uuid, uuid);
drop function if exists public.set_user_offline();
drop function if exists public.delete_physical_file_from_storage();
drop table if exists public.upload_audit;
drop function if exists ratelimit.check_limit(uuid, text);
drop table if exists ratelimit.requests;
drop schema if exists ratelimit;

-- 5) Remove duplicate FK generated in remote schema dump.
alter table public.messages
  drop constraint if exists messages_chat_id_fkey;

-- 6) Cleanup redundant storage policies.
drop policy if exists "Temp Allow Upload" on storage.objects;
drop policy if exists "Participants can upload chat attachments" on storage.objects;
drop policy if exists "Participants can view chat attachments" on storage.objects;
drop policy if exists "Users can delete own chat attachments" on storage.objects;

-- 7) Lock down mutable config table permissions.
revoke all on table public.rate_limit_config from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_config to service_role;
