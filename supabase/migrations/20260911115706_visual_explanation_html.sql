alter table public.questions
  add column visual_explanation_html text not null default '' check (length(visual_explanation_html) <= 200000),
  add column visual_explanation_height integer not null default 720 check (visual_explanation_height between 240 and 2000);

create or replace function private.question_save(p_data jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); qid uuid:=coalesce(p_id,gen_random_uuid()); alt jsonb; alts jsonb:=p_data->'alternatives';
 statement_clean text; explanation_clean text; notes_clean text; visual_html text; visual_height integer; search_body text; fingerprint_body text; i integer:=0; cid uuid; sid uuid; tid uuid; k text; n text;
begin
 if p_id is not null and not exists(select 1 from public.questions where user_id=u and id=p_id) then raise exception 'Questão não encontrada'; end if;
 if p_data->>'type' not in ('multiple_choice','true_false') or p_data->>'type' is null then raise exception 'Tipo inválido'; end if;
 if jsonb_typeof(alts)<>'array' or alts is null or jsonb_array_length(alts) not between 2 and 26 then raise exception 'Informe de 2 a 26 alternativas'; end if;
 if exists(select 1 from jsonb_array_elements(alts) a group by a->>'key' having count(*)>1) then raise exception 'Chave de alternativa duplicada'; end if;
 if not exists(select 1 from jsonb_array_elements(alts) a where a->>'key'=p_data->>'correct_answer') then raise exception 'Gabarito não corresponde a uma alternativa'; end if;
 if p_data->>'type'='true_false' and (jsonb_array_length(alts)<>2 or not alts @> '[{"key":"TRUE"},{"key":"FALSE"}]'::jsonb) then raise exception 'Certo/Errado exige exatamente as chaves TRUE e FALSE'; end if;
 statement_clean:=private.clean_html(p_data->>'statement'); explanation_clean:=private.clean_html(p_data->>'general_explanation'); notes_clean:=private.clean_html(p_data->>'notes');
 visual_html:=coalesce(p_data->>'visual_explanation_html','');
 if length(visual_html)>200000 then raise exception 'HTML visual excede 200.000 caracteres'; end if;
 if visual_html ~* '<[[:space:]]*/?[[:space:]]*(script|iframe|object|embed|base|link|meta|form|img)([[:space:]>])' or visual_html ~* '[[:space:]]on[a-z]+[[:space:]]*=' or visual_html ~* '(@import|url[[:space:]]*[(])' then raise exception 'HTML visual aceita somente HTML e CSS autocontidos'; end if;
 if nullif(p_data->>'visual_explanation_height','') is null then visual_height:=720;
 elsif p_data->>'visual_explanation_height' !~ '^[0-9]{1,4}$' then raise exception 'Altura do HTML visual inválida';
 else visual_height:=(p_data->>'visual_explanation_height')::integer; end if;
 if visual_height not between 240 and 2000 then raise exception 'Altura do HTML visual deve estar entre 240 e 2000'; end if;
 if length(private.plain_text(statement_clean))<1 then raise exception 'Enunciado obrigatório'; end if;
 if p_data->>'source_url' is not null and p_data->>'source_url'<>'' and p_data->>'source_url' !~* '^https?://' then raise exception 'URL deve usar http ou https'; end if;
 search_body:=concat_ws(' ',private.plain_text(statement_clean),private.plain_text(explanation_clean),private.plain_text(notes_clean),private.plain_text(private.clean_html(visual_html)),p_data->>'external_id',p_data->>'source');
 fingerprint_body:=lower(private.plain_text(statement_clean));
 for alt in select value from jsonb_array_elements(alts) loop
   if coalesce(alt->>'key','') !~ '^[A-Za-z0-9_-]{1,16}$' or length(private.plain_text(private.clean_html(alt->>'text')))=0 then raise exception 'Alternativa sem chave ou texto válido'; end if;
   search_body:=search_body || ' ' || private.plain_text(private.clean_html(alt->>'text')) || ' ' || private.plain_text(private.clean_html(alt->>'explanation'));
   fingerprint_body:=fingerprint_body || '|' || lower(private.plain_text(private.clean_html(alt->>'text')));
 end loop;
 insert into public.questions(user_id,id,source,external_id,type,statement,correct_answer,general_explanation,visual_explanation_html,visual_explanation_height,year,level,difficulty,source_url,notes,search_text,fingerprint)
 values(u,qid,btrim(p_data->>'source'),nullif(btrim(p_data->>'external_id'),''),p_data->>'type',statement_clean,p_data->>'correct_answer',explanation_clean,visual_html,visual_height,(p_data->>'year')::integer,p_data->>'level',p_data->>'difficulty',nullif(p_data->>'source_url',''),notes_clean,search_body,private.fingerprint(p_data))
 on conflict(user_id,id) do update set source=excluded.source,external_id=excluded.external_id,type=excluded.type,statement=excluded.statement,correct_answer=excluded.correct_answer,general_explanation=excluded.general_explanation,visual_explanation_html=excluded.visual_explanation_html,visual_explanation_height=excluded.visual_explanation_height,year=excluded.year,level=excluded.level,difficulty=excluded.difficulty,source_url=excluded.source_url,notes=excluded.notes,search_text=excluded.search_text,fingerprint=excluded.fingerprint,updated_at=clock_timestamp();
 delete from public.question_alternatives where user_id=u and question_id=qid;
 for alt in select value from jsonb_array_elements(alts) loop
   insert into public.question_alternatives(user_id,question_id,key,text,explanation,position) values(u,qid,alt->>'key',private.clean_html(alt->>'text'),private.clean_html(alt->>'explanation'),i); i:=i+1;
 end loop;
 delete from public.question_catalogs where user_id=u and question_id=qid;
 for cid in select value::uuid from jsonb_array_elements_text(coalesce(p_data->'catalog_ids','[]')) loop
   insert into public.question_catalogs values(u,qid,cid) on conflict do nothing;
 end loop;
 foreach k in array array['board','organization','position','subject'] loop
   cid:=private.ensure_catalog(k,p_data->>k);
   if k='subject' then sid:=cid; end if;
   if cid is not null then insert into public.question_catalogs values(u,qid,cid) on conflict do nothing; end if;
 end loop;
 tid:=private.ensure_catalog('topic',p_data->>'topic',sid);
 if tid is not null then insert into public.question_catalogs values(u,qid,tid) on conflict do nothing; end if;
 cid:=private.ensure_catalog('subtopic',p_data->>'subtopic',tid);
 if cid is not null then insert into public.question_catalogs values(u,qid,cid) on conflict do nothing; end if;
 foreach k in array array['tag','project','notebook'] loop
   for n in select value from jsonb_array_elements_text(coalesce(p_data->(k||'s'),'[]')) loop
     cid:=private.ensure_catalog(k,n); insert into public.question_catalogs values(u,qid,cid) on conflict do nothing;
   end loop;
 end loop;
 return private.question_json(qid);
end $$;
