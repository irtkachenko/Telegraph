-- Create RPC function to get chat details with proper user info
-- This returns the exact structure that frontend expects

CREATE OR REPLACE FUNCTION public.rpc_get_chat_details(p_chat_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  recipient_id uuid,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  user_last_read_id uuid,
  recipient_last_read_id uuid,
  -- Return nested objects with exact field names frontend expects
  user jsonb,
  recipient jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chat public.chats%ROWTYPE;
  v_user_data jsonb;
  v_recipient_data jsonb;
BEGIN
  -- Get chat details with permission check
  SELECT * INTO v_chat
  FROM public.chats
  WHERE id = p_chat_id
    AND (user_id = auth.uid() OR recipient_id = auth.uid());
  
  IF v_chat IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user info with RLS bypass
  SELECT to_jsonb(u) INTO v_user_data
  FROM public.users u
  WHERE u.id = v_chat.user_id;
  
  -- Get recipient info with RLS bypass
  SELECT to_jsonb(u) INTO v_recipient_data
  FROM public.users u
  WHERE u.id = v_chat.recipient_id;
  
  -- Return single row with exact structure frontend expects
  RETURN QUERY
  SELECT 
    v_chat.id,
    v_chat.user_id,
    v_chat.recipient_id,
    v_chat.title,
    v_chat.created_at,
    v_chat.updated_at,
    v_chat.user_last_read_id,
    v_chat.recipient_last_read_id,
    v_user_data as user,      -- Frontend expects 'user' field
    v_recipient_data as recipient;  -- Frontend expects 'recipient' field
END;
$function$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_get_chat_details(uuid) TO authenticated;
