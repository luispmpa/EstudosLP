-- Run against an installed EstudosLP schema as the project administrator.
-- Every synthetic user and record is rolled back. This tests SQL authorization,
-- not GoTrue password/email/JWT issuance.
begin;
insert into auth.users(id) values
  ('eeeeeeee-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare q jsonb; p jsonb; a jsonb; e jsonb; again jsonb;
  req uuid := gen_random_uuid(); h jsonb;
begin
  q := public.question_save('{"source":"smoke-test","external_id":"smoke-1","type":"multiple_choice","statement":"<p>Questão de validação transitória</p>","alternatives":[{"key":"A","text":"Primeira","explanation":"Incorreta"},{"key":"B","text":"Segunda","explanation":"Correta"}],"correct_answer":"B","general_explanation":"<strong>Explicação</strong>"}'::jsonb);
  p := public.policy_save('{"scope":"global","target_id":null,"name":"Smoke","intervals":[{"label":"10 dias","value":10,"unit":"day","active":true,"position":0}]}'::jsonb);
  a := public.answer_question((q->>'id')::uuid,'B',5000,'{}',req);
  again := public.answer_question((q->>'id')::uuid,'B',5000,'{}',req);
  if a->>'id' <> again->>'id' or not (a->>'is_correct')::boolean then raise exception 'Answer/idempotency failure'; end if;
  e := public.schedule_attempt((a->>'id')::uuid,(p->'intervals'->0->>'id')::uuid,(a->>'schedule_version')::int,gen_random_uuid());
  if extract(epoch from ((e->>'next_review_at')::timestamptz-(a->>'answered_at')::timestamptz)) <> 864000 then raise exception 'Interval failure'; end if;
  perform public.policy_save(p || '{"intervals":[{"label":"60 dias","value":60,"unit":"day","active":true,"position":0}]}'::jsonb);
  again := public.question_get((q->>'id')::uuid);
  if again->>'next_review_at' <> e->>'next_review_at' then raise exception 'Retroactive schedule mutation'; end if;
  h := public.history_list('{"days":1,"timezone":"America/Sao_Paulo"}'::jsonb);
  if (h->>'total')::int <> 1 or (h->'items'->0->'interval_snapshot'->>'value')::numeric <> 10 then raise exception 'History snapshot failure'; end if;
  begin
    delete from public.attempts;
    raise exception 'History deletion was allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('estudoslp.smoke_question',q->>'id',true);
end $$;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
do $$ begin
  if (public.question_list()->>'total')::int <> 0 then raise exception 'Tenant list leak'; end if;
  if public.question_get(current_setting('estudoslp.smoke_question')::uuid) is not null then raise exception 'Tenant detail leak'; end if;
  if exists(select 1 from public.attempts) then raise exception 'RLS history leak'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.question_list();
    raise exception 'Anonymous API access was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'SQL smoke passed; all synthetic records rolled back' as validation;
