-- Ensure chat updated_at is bumped when a new message is inserted

create or replace function public.touch_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set updated_at = now()
  where id = new.chat_id;

  return new;
end;
$$;

drop trigger if exists set_messages_updated_at on public.messages;

create trigger set_messages_updated_at
after insert on public.messages
for each row
execute function public.touch_chat_updated_at();
