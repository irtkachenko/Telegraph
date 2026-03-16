-- Fix ambiguous column references in check_action_limit (action)
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
    select c.max_count, c.window_seconds, c.enabled
      into cfg_max, cfg_seconds, cfg_enabled
    from public.rate_limit_config as c
    where c.action = check_action_limit.action;

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
  values (u_id, check_action_limit.action, cfg_seconds, window_start_ts, 1)
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
