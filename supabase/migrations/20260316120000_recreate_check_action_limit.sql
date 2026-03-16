-- Recreate check_action_limit with safe parameter names and reapply storage policies
do $$
begin
  -- Drop dependent policies first (if they exist)
  drop policy if exists "Users can upload attachments" on storage.objects;
  drop policy if exists "Users can delete own attachments" on storage.objects;

  -- Drop and recreate the function with unambiguous parameter names
  drop function if exists public.check_action_limit(text, int, int, uuid);

  create function public.check_action_limit(
    p_action text,
    p_max_count int default null,
    p_seconds int default null,
    p_u_id uuid default auth.uid()
  )
  returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $func$
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

    if p_u_id is null then
      raise exception 'Unauthenticated' using errcode = '28000';
    end if;

    if p_max_count is null or p_seconds is null then
      select c.max_count, c.window_seconds, c.enabled
        into cfg_max, cfg_seconds, cfg_enabled
      from public.rate_limit_config as c
      where c.action = p_action;

      if cfg_enabled is false then
        return true;
      end if;

      if cfg_max is null or cfg_seconds is null then
        raise exception 'Rate limit config missing for %', p_action
          using errcode = 'P0001';
      end if;
    else
      cfg_max := p_max_count;
      cfg_seconds := p_seconds;
      cfg_enabled := true;
    end if;

    window_start_ts := to_timestamp(floor(extract(epoch from now_ts) / cfg_seconds) * cfg_seconds);

    insert into public.rate_limits(user_id, action, window_seconds, window_start, count)
    values (p_u_id, p_action, cfg_seconds, window_start_ts, 1)
    on conflict (user_id, action, window_seconds, window_start)
    do update set count = public.rate_limits.count + 1
    returning count into current_count;

    if current_count > cfg_max then
      raise exception 'Rate limit exceeded' using errcode = 'P0001';
    end if;

    return true;
  end;
  $func$;

  grant execute on function public.check_action_limit(text, int, int, uuid) to authenticated;

  -- Recreate storage policies with the new function
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
exception
  when insufficient_privilege then
    raise notice 'Insufficient privilege to recreate storage policies. Apply manually in SQL Editor.';
end $$;
