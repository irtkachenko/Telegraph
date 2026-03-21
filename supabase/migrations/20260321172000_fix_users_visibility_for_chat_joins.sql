-- Fix user profile visibility for chat joins (name/avatar in chat UI).
-- The previous restrictive policy blocked all direct reads from public.users.

drop policy if exists "Users cannot directly access users table" on public.users;
drop policy if exists "Users can view chat participants" on public.users;

-- Keep direct access limited, but allow profiles only when:
-- 1) it's the current user profile, or
-- 2) the profile belongs to a participant of one of current user's chats.
drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
on public.users
as permissive
for select
to authenticated
using (auth.uid() = id);

create policy "Users can view chat participants"
on public.users
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where (c.user_id = auth.uid() or c.recipient_id = auth.uid())
      and (c.user_id = users.id or c.recipient_id = users.id)
  )
);
