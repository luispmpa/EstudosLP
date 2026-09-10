-- Allow question removal while retaining immutable study and import records.
alter table public.attempts alter column question_id drop not null;
alter table public.attempts drop constraint attempts_user_id_question_id_fkey;
alter table public.attempts add constraint attempts_user_id_question_id_fkey
  foreign key(user_id,question_id) references public.questions(user_id,id)
  on delete set null (question_id);

alter table public.review_events alter column question_id drop not null;
alter table public.review_events drop constraint review_events_user_id_question_id_fkey;
alter table public.review_events add constraint review_events_user_id_question_id_fkey
  foreign key(user_id,question_id) references public.questions(user_id,id)
  on delete set null (question_id);

alter table public.import_items drop constraint import_items_user_id_question_id_fkey;
alter table public.import_items add constraint import_items_user_id_question_id_fkey
  foreign key(user_id,question_id) references public.questions(user_id,id)
  on delete set null (question_id);

create function private.question_delete_many(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := private.require_user();
  ids uuid[];
  owned_count integer;
  deleted_count integer;
begin
  if coalesce(cardinality(p_ids),0) not between 1 and 100 then
    raise exception 'Selecione de 1 a 100 questões';
  end if;
  select array_agg(input.id order by input.id) into ids
  from (select distinct id from unnest(p_ids) as value(id)) input;
  if cardinality(ids) <> cardinality(p_ids) then
    raise exception 'A seleção contém questões repetidas';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('question-delete:' || u::text, 0));
  select count(*) into owned_count
  from public.questions where user_id=u and id=any(ids);
  if owned_count <> cardinality(ids) then
    raise exception 'Uma ou mais questões não foram encontradas';
  end if;
  delete from public.questions where user_id=u and id=any(ids);
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('deleted',deleted_count);
end $$;
create function public.question_delete_many(p_ids uuid[]) returns jsonb language sql security definer set search_path='' as $$select private.question_delete_many(p_ids)$$;
revoke all on function private.question_delete_many(uuid[]) from public, anon, authenticated;
revoke all on function public.question_delete_many(uuid[]) from public, anon;
grant execute on function public.question_delete_many(uuid[]) to authenticated;
