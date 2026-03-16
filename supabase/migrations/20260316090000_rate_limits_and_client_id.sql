-- Add client_id to messages and enforce server-side rate limits

-- 1) Client-side optimistic matching support
alter table public.messages
  add column if not exists client_id uuid;

create index if not exists idx_messages_client_id on public.messages(client_id);

-- 2) Rate limit config (editable without code changes)
create table if not exists public.rate_limit_config (
  action text primary key,
  max_count int not null,
  window_seconds int not null,
  enabled boolean not null default true
);

-- Default limits (adjust any time via SQL/Studio)
insert into public.rate_limit_config (action, max_count, window_seconds, enabled)
values
  ('message_send', 30, 60, true),
  ('message_edit', 20, 60, true),
  ('message_delete', 20, 60, true),
  ('chat_create', 5, 60, true),
  ('chat_mark_read', 120, 60, true),
  ('chat_update', 20, 60, true),
  ('chat_delete', 5, 60, true),
  ('storage_upload', 10, 60, true),
  ('storage_delete', 10, 60, true)
  on conflict (action) do update
  set max_count = excluded.max_count,
      window_seconds = excluded.window_seconds,
      enabled = excluded.enabled;

-- 3) Rate limit storage
create table if not exists public.rate_limits (
  user_id uuid not null,
  action text not null,
  window_seconds int not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, action, window_seconds, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- 4) Rate limit function
create or replace function public.check_action_limit(
  action text,
  max_count int default null,
  seconds int default null,
  u_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  window_start_ts timestamptz;
  current_count int;
  cfg_max int;
  cfg_seconds int;
  cfg_enabled boolean;
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return true;
  end if;

  if u_id is null then
    raise exception 'Unauthenticated' using errcode = '28000';
  end if;

  if max_count is null or seconds is null then
    select max_count, window_seconds, enabled
      into cfg_max, cfg_seconds, cfg_enabled
    from public.rate_limit_config
    where action = check_action_limit.action;

    if cfg_enabled is false then
      return true;
    end if;

    if cfg_max is null or cfg_seconds is null then
      raise exception 'Rate limit config missing for %', check_action_limit.action
        using errcode = 'P0001';
    end if;
  else
    cfg_max := max_count;
    cfg_seconds := seconds;
    cfg_enabled := true;
  end if;

  window_start_ts := to_timestamp(floor(extract(epoch from now_ts) / cfg_seconds) * cfg_seconds);

  insert into public.rate_limits(user_id, action, window_seconds, window_start, count)
  values (u_id, action, cfg_seconds, window_start_ts, 1)
  on conflict (user_id, action, window_seconds, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into current_count;

  if current_count > cfg_max then
    raise exception 'Rate limit exceeded' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

grant execute on function public.check_action_limit(text, int, int, uuid) to authenticated;

-- 5) Triggers for messages
create or replace function public.enforce_messages_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.check_action_limit('message_send', null, null, new.sender_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.check_action_limit('message_edit');
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.check_action_limit('message_delete');
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists messages_rate_limit_insert on public.messages;
drop trigger if exists messages_rate_limit_update on public.messages;
drop trigger if exists messages_rate_limit_delete on public.messages;

create trigger messages_rate_limit_insert
before insert on public.messages
for each row
execute function public.enforce_messages_rate_limit();

create trigger messages_rate_limit_update
before update on public.messages
for each row
execute function public.enforce_messages_rate_limit();

create trigger messages_rate_limit_delete
before delete on public.messages
for each row
execute function public.enforce_messages_rate_limit();

-- 6) Triggers for chats
create or replace function public.enforce_chats_rate_limit()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.check_action_limit('chat_create', null, null, new.user_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (new.user_last_read_id is distinct from old.user_last_read_id)
      or (new.recipient_last_read_id is distinct from old.recipient_last_read_id) then
      perform public.check_action_limit('chat_mark_read');
    elsif (new.title is distinct from old.title) then
      perform public.check_action_limit('chat_update');
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.check_action_limit('chat_delete');
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists chats_rate_limit_insert on public.chats;
drop trigger if exists chats_rate_limit_update on public.chats;
drop trigger if exists chats_rate_limit_delete on public.chats;

create trigger chats_rate_limit_insert
before insert on public.chats
for each row
execute function public.enforce_chats_rate_limit();

create trigger chats_rate_limit_update
before update on public.chats
for each row
execute function public.enforce_chats_rate_limit();

create trigger chats_rate_limit_delete
before delete on public.chats
for each row
execute function public.enforce_chats_rate_limit();

-- 7) Storage rate limits (may require supabase_admin privileges)
-- If this fails in hosted Supabase, run the policy block manually in SQL Editor.
DO $$
BEGIN
  drop policy if exists "Users can upload attachments" on storage.objects;
  drop policy if exists "Users can delete own attachments" on storage.objects;

  create policy "Users can upload attachments"
    on storage.objects for insert
    with check (
      bucket_id = 'attachments'
      and (storage.foldername(name))[2] = auth.uid()::text
      and (storage.foldername(name))[1]::uuid in (
        select id from public.chats
        where user_id = auth.uid() or recipient_id = auth.uid()
      )
      and public.check_action_limit('storage_upload')
    );

  create policy "Users can delete own attachments"
    on storage.objects for delete
    using (
      bucket_id = 'attachments'
      and (storage.foldername(name))[2] = auth.uid()::text
      and public.check_action_limit('storage_delete')
    );
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privilege to create policies on storage.objects. Apply manually in SQL Editor.';
END $$;

-- 8) RPCs for critical actions
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
begin
  perform public.check_action_limit('message_send');

  insert into public.messages(chat_id, sender_id, content, reply_to_id, attachments, client_id)
  values (p_chat_id, auth.uid(), p_content, p_reply_to_id, p_attachments, p_client_id)
  returning * into new_message;

  return new_message;
end;
$$;

grant execute on function public.rpc_send_message(uuid, text, uuid, jsonb, uuid) to authenticated;

create or replace function public.rpc_edit_message(
  p_message_id uuid,
  p_content text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_message public.messages;
begin
  perform public.check_action_limit('message_edit');

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

grant execute on function public.rpc_edit_message(uuid, text) to authenticated;

create or replace function public.rpc_delete_message(
  p_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_action_limit('message_delete');

  delete from public.messages
  where id = p_message_id
    and sender_id = auth.uid();

  return p_message_id;
end;
$$;

grant execute on function public.rpc_delete_message(uuid) to authenticated;

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
  perform public.check_action_limit('chat_create');

  insert into public.chats(user_id, recipient_id)
  values (auth.uid(), p_recipient_id)
  returning * into new_chat;

  return new_chat;
end;
$$;

grant execute on function public.rpc_create_chat(uuid) to authenticated;

create or replace function public.rpc_mark_chat_as_read(
  p_chat_id uuid,
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chats;
  update_data record;
begin
  perform public.check_action_limit('chat_mark_read');

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

grant execute on function public.rpc_mark_chat_as_read(uuid, uuid) to authenticated;
