-- Remove unused SECURITY DEFINER RPC that can bypass users-table RLS.
-- Chat UI now relies on regular joins + explicit users policies.

drop function if exists public.rpc_get_chat_details(uuid);
