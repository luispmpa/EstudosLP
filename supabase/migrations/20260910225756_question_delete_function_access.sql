-- Keep the public RPC invoker-safe; the private function rechecks auth and ownership.
create or replace function public.question_delete_many(p_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.question_delete_many(p_ids)$$;
grant execute on function private.question_delete_many(uuid[]) to authenticated;
