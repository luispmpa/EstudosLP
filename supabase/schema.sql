-- EstudosLP: tenant-isolated content, append-only answers and immutable review events.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.catalogs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('project','notebook','subject','topic','subtopic','tag','board','organization','position')),
  name text not null check (length(btrim(name)) between 1 and 180),
  parent_id uuid,
  archived boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id,id),
  foreign key (user_id,parent_id) references public.catalogs(user_id,id) on delete restrict,
  check (parent_id is distinct from id)
);
create unique index catalogs_name_unique on public.catalogs(user_id,kind,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
create index catalogs_parent on public.catalogs(user_id,parent_id);
create index catalogs_name_search on public.catalogs using gin(name extensions.gin_trgm_ops);

create table public.questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  source text not null check (length(btrim(source)) between 1 and 160),
  normalized_source text generated always as (lower(btrim(source))) stored,
  external_id text check (external_id is null or length(btrim(external_id)) between 1 and 160),
  type text not null check (type in ('multiple_choice','true_false')),
  statement text not null,
  correct_answer text not null,
  general_explanation text not null default '',
  visual_explanation_html text not null default '' check (length(visual_explanation_html) <= 200000),
  visual_explanation_height integer not null default 720 check (visual_explanation_height between 240 and 2000),
  year integer check (year between 1900 and 2200),
  level text, difficulty text, source_url text,
  notes text not null default '',
  favorite boolean not null default false,
  status text not null default 'active' check (status in ('active','archived')),
  search_text text not null default '',
  search_vector tsvector generated always as (to_tsvector('portuguese'::regconfig,search_text)) stored,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,id),
  unique (user_id,normalized_source,external_id)
);
create index questions_search on public.questions using gin(search_vector);
create index questions_substring_search on public.questions using gin(search_text extensions.gin_trgm_ops);
create index questions_owner_created on public.questions(user_id,status,created_at desc,id);
create index questions_fingerprint on public.questions(user_id,fingerprint);
create index questions_year on public.questions(user_id,year);
create table public.question_alternatives (
  user_id uuid not null, question_id uuid not null,
  key text not null check (length(key) between 1 and 16),
  text text not null, explanation text not null default '', position integer not null,
  primary key(user_id,question_id,key),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete cascade
);
create table public.question_catalogs (
  user_id uuid not null, question_id uuid not null, catalog_id uuid not null,
  primary key(user_id,question_id,catalog_id),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete cascade,
  foreign key(user_id,catalog_id) references public.catalogs(user_id,id) on delete restrict
);
create index question_catalogs_reverse on public.question_catalogs(user_id,catalog_id,question_id);

create table public.review_policies (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  scope text not null check (scope in ('global','project','notebook','question')),
  catalog_id uuid, question_id uuid, name text not null check (length(btrim(name)) between 1 and 160),
  primary key(user_id,id),
  foreign key(user_id,catalog_id) references public.catalogs(user_id,id) on delete cascade,
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete cascade,
  check ((scope='global' and catalog_id is null and question_id is null) or (scope in ('project','notebook') and catalog_id is not null and question_id is null) or (scope='question' and question_id is not null and catalog_id is null))
);
create unique index review_policy_target on public.review_policies(user_id,scope,coalesce(catalog_id,question_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.review_policy_intervals (
  user_id uuid not null, id uuid not null default gen_random_uuid(), policy_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 80),
  value numeric not null check (value>0 and value<=36500),
  unit text not null check (unit in ('minute','hour','day')),
  seconds numeric generated always as (value * case unit when 'minute' then 60 when 'hour' then 3600 else 86400 end) stored,
  position integer not null default 0, active boolean not null default true, color text,
  primary key(user_id,id),
  foreign key(user_id,policy_id) references public.review_policies(user_id,id) on delete cascade
);
create index review_intervals_policy on public.review_policy_intervals(user_id,policy_id,position);

create table public.attempts (
  user_id uuid not null, id uuid not null default gen_random_uuid(), question_id uuid,
  request_id uuid not null, answered_at timestamptz not null default clock_timestamp(),
  answer text not null, correct_answer text not null, is_correct boolean not null,
  elapsed_ms integer not null check (elapsed_ms between 0 and 86400000),
  statement_snapshot text not null, content_snapshot jsonb not null,
  search_text text not null,
  search_vector tsvector generated always as (to_tsvector('portuguese'::regconfig,search_text)) stored,
  context jsonb not null default '{}',
  project_id uuid, notebook_id uuid,
  was_review boolean not null default false,
  schedule_version integer not null,
  primary key(user_id,id), unique(user_id,request_id),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete set null (question_id),
  foreign key(user_id,project_id) references public.catalogs(user_id,id) on delete restrict,
  foreign key(user_id,notebook_id) references public.catalogs(user_id,id) on delete restrict
);
create index attempts_question_time on public.attempts(user_id,question_id,answered_at desc,id);
create index attempts_time on public.attempts(user_id,answered_at desc,id);
create index attempts_context on public.attempts(user_id,project_id,notebook_id,answered_at desc);
create index attempts_search on public.attempts using gin(search_vector);
create index attempts_substring_search on public.attempts using gin(search_text extensions.gin_trgm_ops);
create table public.question_statistics (
  user_id uuid not null, question_id uuid not null,
  attempt_count integer not null default 0, error_count integer not null default 0,
  last_correct boolean, last_answered_at timestamptz,
  primary key(user_id,question_id),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete cascade
);
create table public.review_schedules (
  user_id uuid not null, question_id uuid not null,
  next_review_at timestamptz,
  status text not null default 'removed' check (status in ('active','suspended','removed')),
  version integer not null default 0,
  last_attempt_id uuid,
  updated_at timestamptz not null default now(),
  primary key(user_id,question_id),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete cascade,
  foreign key(user_id,last_attempt_id) references public.attempts(user_id,id) on delete restrict,
  check (status<>'active' or next_review_at is not null)
);
create index review_schedules_due on public.review_schedules(user_id,next_review_at,question_id) where status='active';
create table public.review_events (
  user_id uuid not null, id uuid not null default gen_random_uuid(), question_id uuid,
  attempt_id uuid, request_id uuid not null,
  action text not null check (action in ('schedule','reschedule','suspend','activate','remove')),
  created_at timestamptz not null default clock_timestamp(),
  interval_snapshot jsonb, next_review_at timestamptz,
  previous_next_review_at timestamptz, previous_status text,
  schedule_version integer not null,
  primary key(user_id,id), unique(user_id,request_id),
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete set null (question_id),
  foreign key(user_id,attempt_id) references public.attempts(user_id,id) on delete restrict
);
create unique index review_events_one_selection on public.review_events(user_id,attempt_id) where action='schedule';
create index review_events_question on public.review_events(user_id,question_id,created_at desc,id);
create table public.imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(), request_id uuid not null,
  file_name text not null, file_hash text not null, payload_hash text not null, duplicate_policy text not null,
  created_at timestamptz not null default clock_timestamp(),
  received integer not null default 0, inserted integer not null default 0,
  updated integer not null default 0, skipped integer not null default 0,
  duplicates integer not null default 0, errors integer not null default 0,
  primary key(user_id,id), unique(user_id,request_id), unique(user_id,file_hash)
);
create table public.import_items (
  user_id uuid not null, import_id uuid not null, index integer not null,
  status text not null check(status in ('inserted','updated','skipped','error')),
  question_id uuid, error text,
  primary key(user_id,import_id,index),
  foreign key(user_id,import_id) references public.imports(user_id,id) on delete cascade,
  foreign key(user_id,question_id) references public.questions(user_id,id) on delete set null (question_id)
);

-- Browser clients can read only their own rows. Mutations are guarded RPCs; histories cannot be edited.
do $$ declare t text; begin
  foreach t in array array['catalogs','questions','question_alternatives','question_catalogs','review_policies','review_policy_intervals','attempts','question_statistics','review_schedules','review_events','imports','import_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

create function private.require_user() returns uuid language plpgsql stable security invoker set search_path='' as $$
declare u uuid := auth.uid(); begin if u is null then raise exception 'Autenticação necessária' using errcode='42501'; end if; return u; end $$;

-- Serialize fresh allowlisted tags and values; no raw input markup is copied into output.
-- Every '<' is either converted into one known tag or escaped. DOMPurify additionally runs in the browser.
create function private.clean_html(p_text text) returns text language plpgsql immutable security invoker set search_path='' as $$
declare token text; tag text; result text := ''; source text := coalesce(p_text,''); attrs text; attr text; prop text; val text; safe_style text; link text; numeric_attr text;
begin
  if length(source)>200000 then raise exception 'Campo excede 200.000 caracteres'; end if;
  source := regexp_replace(source,'<(script|style|iframe|object|embed)[^>]*>.*?</\1\s*>','','gis');
  for token in select (regexp_matches(source,'<[^>]*>|[^<]+|<','g'))[1] loop
    if left(token,1)<>'<' then result := result || token;
    elsif token ~ '^</?[A-Za-z][^>]*>$' then
      tag := lower(substring(token from '^</?([A-Za-z0-9]+)'));
      if tag=any(array['p','br','div','span','strong','b','em','i','u','s','strike','mark','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','a','hr','sub','sup','table','thead','tbody','tr','th','td']) then
        attrs:=''; safe_style:='';
        if left(token,2)<>'</' then
          attr:=substring(token from '(?i)\sstyle="([^"]*)"');
          for val in select unnest(string_to_array(coalesce(attr,''),';')) loop
            prop:=lower(btrim(split_part(val,':',1))); val:=lower(btrim(split_part(val,':',2)));
            if (prop in ('color','background-color') and val ~ '^(#[0-9a-f]{3,8}|[a-z]{1,24}|rgba?\([0-9., %]+\)|hsla?\([0-9., %]+\))$')
             or (prop='text-align' and val in ('left','right','center','justify'))
             or (prop='margin-left' and val ~ '^([0-9]|[1-9][0-9])(\.[0-9]+)?(px|em|rem)$') then
              safe_style:=safe_style||prop||': '||val||';';
            end if;
          end loop;
          if safe_style<>'' then attrs:=attrs||' style="'||safe_style||'"'; end if;
          if tag='a' then
            link:=substring(token from '(?i)\shref="([^"]*)"');
            if link ~* '^(https?://|mailto:|#)' and link !~ '[<>[:cntrl:]]' then attrs:=attrs||' href="'||link||'" rel="noopener noreferrer"'; end if;
          end if;
          foreach numeric_attr in array array['colspan','rowspan','start'] loop
            val:=substring(token from '(?i)\s'||numeric_attr||'="([0-9]{1,3})"');
            if val is not null then attrs:=attrs||' '||numeric_attr||'="'||val||'"'; end if;
          end loop;
        end if;
        result := result || '<' || case when left(token,2)='</' then '/' else '' end || tag || attrs || '>';
      end if;
    else result := result || '&lt;' || substring(token from 2); end if;
  end loop;
  return result;
end $$;
create function private.plain_text(p_text text) returns text language plpgsql immutable security invoker set search_path='' as $$
declare source text:=regexp_replace(coalesce(p_text,''),'<[^>]*>',' ','g'); token text; entity text; value text; codepoint integer; result text:='';
 entities jsonb:='{"nbsp":" ","amp":"&","lt":"<","gt":">","quot":"\"","apos":"''","aacute":"á","eacute":"é","iacute":"í","oacute":"ó","uacute":"ú","Aacute":"Á","Eacute":"É","Iacute":"Í","Oacute":"Ó","Uacute":"Ú","agrave":"à","Agrave":"À","acirc":"â","ecirc":"ê","ocirc":"ô","Acirc":"Â","Ecirc":"Ê","Ocirc":"Ô","atilde":"ã","otilde":"õ","Atilde":"Ã","Otilde":"Õ","ccedil":"ç","Ccedil":"Ç","uuml":"ü","Uuml":"Ü","ndash":"–","mdash":"—","hellip":"…"}';
begin
 for token in select m[1] from regexp_matches(source,'(&(?:#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);|[^&]+|&)','g') m loop
  value:=token;
  if token ~ '^&.*;$' then
   entity:=substring(token from 2 for length(token)-2);
   if entities ? entity then value:=entities->>entity;
   elsif entity ~ '^#[0-9]{1,7}$' or entity ~ '^#x[0-9A-Fa-f]{1,6}$' then
    if left(entity,2)='#x' then codepoint:=('x'||lpad(substring(entity from 3),8,'0'))::bit(32)::integer; else codepoint:=substring(entity from 2)::integer; end if;
    if codepoint between 1 and 1114111 and codepoint not between 55296 and 57343 then value:=chr(codepoint); end if;
   end if;
  end if;
  result:=result||value;
 end loop;
 return btrim(regexp_replace(normalize(result,NFKC),'\s+',' ','g'));
end $$;

create function private.question_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select (to_jsonb(q)-'user_id'-'normalized_source'-'search_text'-'search_vector'-'fingerprint') || jsonb_build_object(
   'alternatives',coalesce((select jsonb_agg(jsonb_build_object('key',a.key,'text',a.text,'explanation',a.explanation) order by a.position) from public.question_alternatives a where a.user_id=q.user_id and a.question_id=q.id),'[]'::jsonb),
   'catalog_ids',coalesce((select jsonb_agg(c.catalog_id) from public.question_catalogs c where c.user_id=q.user_id and c.question_id=q.id),'[]'::jsonb),
   'next_review_at',s.next_review_at,'review_status',s.status,'schedule_version',coalesce(s.version,0),
   'attempt_count',coalesce(st.attempt_count,0),'error_count',coalesce(st.error_count,0),'last_correct',st.last_correct)
 from public.questions q left join public.review_schedules s on s.user_id=q.user_id and s.question_id=q.id
 left join public.question_statistics st on st.user_id=q.user_id and st.question_id=q.id
 where q.user_id=auth.uid() and q.id=p_id
$$;
create function private.attempt_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select (to_jsonb(a)-'user_id'-'request_id') || jsonb_build_object('interval_snapshot',e.interval_snapshot,'next_review_at',e.next_review_at)
 from public.attempts a left join public.review_events e on e.user_id=a.user_id and e.attempt_id=a.id and e.action='schedule'
 where a.user_id=auth.uid() and a.id=p_id
$$;
create function private.policy_json(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'scope',p.scope,'target_id',coalesce(p.catalog_id,p.question_id),'name',p.name,
   'intervals',coalesce((select jsonb_agg(to_jsonb(i)-'user_id'-'policy_id' order by i.position,i.id) from public.review_policy_intervals i where i.user_id=p.user_id and i.policy_id=p.id),'[]'::jsonb))
 from public.review_policies p where p.user_id=auth.uid() and p.id=p_id
$$;

create function public.catalog_list() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c)-'user_id' order by c.kind,c.position,c.name),'[]'::jsonb) from public.catalogs c where c.user_id=auth.uid()
$$;
create function private.catalog_save(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); cid uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); k text:=p_data->>'kind'; pid uuid:=nullif(p_data->>'parent_id','')::uuid; pk text; result jsonb;
begin
  if pid is not null then
    select kind into pk from public.catalogs where user_id=u and id=pid;
    if pk is null or not ((k='notebook' and pk='project') or (k='topic' and pk='subject') or (k='subtopic' and pk='topic')) then raise exception 'Categoria pai incompatível'; end if;
  end if;
  if exists(select 1 from public.catalogs where user_id=u and id=cid and kind<>k) then raise exception 'O tipo da classificação não pode mudar'; end if;
  insert into public.catalogs(user_id,id,kind,name,parent_id,archived,position)
    values(u,cid,k,btrim(p_data->>'name'),pid,coalesce((p_data->>'archived')::boolean,false),coalesce((p_data->>'position')::integer,0))
    on conflict(user_id,id) do update set name=excluded.name,parent_id=excluded.parent_id,archived=excluded.archived,position=excluded.position
    returning to_jsonb(catalogs)-'user_id' into result;
  return result;
end $$;
create function public.catalog_save(p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.catalog_save(p_data) $$;
create function private.catalog_archive(p_id uuid,p_archived boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); result jsonb; begin
 update public.catalogs set archived=p_archived where user_id=u and id=p_id returning to_jsonb(catalogs)-'user_id' into result;
 if result is null then raise exception 'Classificação não encontrada'; end if; return result;
end $$;
create function public.catalog_archive(p_id uuid,p_archived boolean) returns jsonb language sql security invoker set search_path='' as $$select private.catalog_archive(p_id,p_archived)$$;
create function private.catalog_delete(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); begin
 delete from public.catalogs where user_id=u and id=p_id; if not found then raise exception 'Classificação não encontrada'; end if;
 return jsonb_build_object('deleted',true);
exception when foreign_key_violation then raise exception 'Classificação em uso: arquive-a para preservar vínculos e histórico'; end $$;
create function public.catalog_delete(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.catalog_delete(p_id)$$;

create function private.ensure_catalog(p_kind text,p_name text,p_parent uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); cid uuid; begin
 if nullif(btrim(p_name),'') is null then return null; end if;
 select id into cid from public.catalogs where user_id=u and kind=p_kind and parent_id is not distinct from p_parent and lower(btrim(name))=lower(btrim(p_name));
 if cid is null then cid:=(private.catalog_save(jsonb_build_object('kind',p_kind,'name',p_name,'parent_id',p_parent))->>'id')::uuid; end if;
 return cid;
end $$;

create function private.question_save(p_data jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.question_save(p_data jsonb,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.question_save(p_data,p_id)$$;
create function public.question_get(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.question_json(p_id)$$;
create function private.question_patch(p_id uuid,p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); begin
 if p_patch - array['favorite','status'] <> '{}'::jsonb then raise exception 'Alteração não permitida'; end if;
 update public.questions set favorite=coalesce((p_patch->>'favorite')::boolean,favorite),status=coalesce(p_patch->>'status',status),updated_at=clock_timestamp() where user_id=u and id=p_id;
 if not found then raise exception 'Questão não encontrada'; end if; return private.question_json(p_id);
end $$;
create function public.question_patch(p_id uuid,p_patch jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.question_patch(p_id,p_patch)$$;
create function private.question_delete_many(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); ids uuid[]; owned_count integer; deleted_count integer;
begin
 if coalesce(cardinality(p_ids),0) not between 1 and 100 then raise exception 'Selecione de 1 a 100 questões'; end if;
 select array_agg(input.id order by input.id) into ids from (select distinct id from unnest(p_ids) as value(id)) input;
 if cardinality(ids)<>cardinality(p_ids) then raise exception 'A seleção contém questões repetidas'; end if;
 perform pg_advisory_xact_lock(hashtextextended('question-delete:'||u::text,0));
 select count(*) into owned_count from public.questions where user_id=u and id=any(ids);
 if owned_count<>cardinality(ids) then raise exception 'Uma ou mais questões não foram encontradas'; end if;
 delete from public.questions where user_id=u and id=any(ids);
 get diagnostics deleted_count=row_count;
 return jsonb_build_object('deleted',deleted_count);
end $$;
create function public.question_delete_many(p_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.question_delete_many(p_ids)$$;

-- Filter once in SQL, paginate before assembling rich content. All classifications are ANDed.
create function private.filtered_questions(p_filters jsonb) returns setof public.questions language sql stable security invoker set search_path='' as $$
 select q.* from public.questions q
 left join public.question_statistics st on st.user_id=q.user_id and st.question_id=q.id
 left join public.review_schedules rs on rs.user_id=q.user_id and rs.question_id=q.id
 where q.user_id=auth.uid() and q.status=coalesce(p_filters->>'status','active')
 and (nullif(p_filters->>'query','') is null or q.search_vector @@ websearch_to_tsquery('portuguese'::regconfig,p_filters->>'query') or q.search_text ilike '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%' or q.id::text=p_filters->>'query'
   or exists(select 1 from public.question_catalogs qc join public.catalogs c on c.user_id=qc.user_id and c.id=qc.catalog_id where qc.user_id=q.user_id and qc.question_id=q.id and c.name ilike '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%'))
 and (not (p_filters ? 'favorite') or q.favorite=(p_filters->>'favorite')::boolean)
 and (nullif(p_filters->>'year_min','') is null or q.year>=(p_filters->>'year_min')::integer)
 and (nullif(p_filters->>'year_max','') is null or q.year<=(p_filters->>'year_max')::integer)
 and (nullif(p_filters->>'project_id','') is null or exists(select 1 from public.question_catalogs qc join public.catalogs c on c.user_id=qc.user_id and c.id=qc.catalog_id where qc.user_id=q.user_id and qc.question_id=q.id and (c.id=(p_filters->>'project_id')::uuid or (c.kind='notebook' and c.parent_id=(p_filters->>'project_id')::uuid))))
 and (nullif(p_filters->>'notebook_id','') is null or exists(select 1 from public.question_catalogs qc where qc.user_id=q.user_id and qc.question_id=q.id and qc.catalog_id=(p_filters->>'notebook_id')::uuid))
 and not exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'catalog_ids','[]'::jsonb)) f where not exists(select 1 from public.question_catalogs qc where qc.user_id=q.user_id and qc.question_id=q.id and qc.catalog_id=f.value::uuid))
 and case coalesce(p_filters->>'mode','all')
 when 'all' then true
 when 'due' then rs.status='active' and rs.next_review_at<=now()
 when 'new' then coalesce(st.attempt_count,0)=0
 when 'errors' then coalesce(st.error_count,0)>0
 when 'recurring' then coalesce(st.error_count,0)>=2 and not st.last_correct
 when 'recovered' then coalesce(st.error_count,0)>0 and st.last_correct
 else false end
$$;
create function public.question_list(p_filters jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare lim integer:=least(greatest(coalesce((p_filters->>'page_size')::integer,20),1),100); off integer:=greatest(coalesce((p_filters->>'page')::integer,1)-1,0); result jsonb; total bigint;
begin
 perform private.require_user(); off:=least(off,1000000)*lim;
 select count(*) into total from private.filtered_questions(p_filters);
 select coalesce(jsonb_agg(private.question_json(t.id) order by t.n),'[]'::jsonb) into result from (
  select q.id,row_number() over(order by
   case when p_filters->>'sort'='oldest' then q.created_at end asc,
   case when p_filters->>'sort'='due' then (select rs.next_review_at from public.review_schedules rs where rs.user_id=q.user_id and rs.question_id=q.id) end asc nulls last,
   case when coalesce(p_filters->>'sort','newest')='newest' then q.created_at end desc,q.id) n
  from private.filtered_questions(p_filters) q order by n limit lim offset off
 ) t;
 return jsonb_build_object('items',result,'total',total);
end $$;

create function public.policy_list() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(private.policy_json(p.id) order by p.scope,p.name),'[]'::jsonb) from public.review_policies p where p.user_id=auth.uid()
$$;
create function private.policy_save(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); pid uuid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid()); scope_value text:=p_data->>'scope'; target uuid:=nullif(p_data->>'target_id','')::uuid; it jsonb; iid uuid; n integer:=0;
begin
 if jsonb_typeof(p_data->'intervals')<>'array' or p_data->'intervals' is null or jsonb_array_length(p_data->'intervals')>30 then raise exception 'A política deve ter até 30 intervalos'; end if;
 if scope_value in ('project','notebook') and not exists(select 1 from public.catalogs where user_id=u and id=target and kind=scope_value) then raise exception 'Destino da política incompatível'; end if;
 if scope_value='question' and not exists(select 1 from public.questions where user_id=u and id=target) then raise exception 'Questão da política não encontrada'; end if;
 if scope_value='global' and target is not null then raise exception 'Política global não tem destino'; end if;
 insert into public.review_policies(user_id,id,scope,catalog_id,question_id,name) values(u,pid,scope_value,case when scope_value in ('project','notebook') then target end,case when scope_value='question' then target end,btrim(p_data->>'name'))
 on conflict(user_id,id) do update set scope=excluded.scope,catalog_id=excluded.catalog_id,question_id=excluded.question_id,name=excluded.name;
 -- Intervals are configuration, never foreign keys from historical snapshots.
 delete from public.review_policy_intervals where user_id=u and policy_id=pid;
 for it in select value from jsonb_array_elements(p_data->'intervals') loop
   iid:=coalesce(nullif(it->>'id','')::uuid,gen_random_uuid());
   insert into public.review_policy_intervals(user_id,id,policy_id,label,value,unit,position,active,color)
   values(u,iid,pid,it->>'label',(it->>'value')::numeric,it->>'unit',coalesce((it->>'position')::integer,n),coalesce((it->>'active')::boolean,true),it->>'color'); n:=n+1;
 end loop;
 return private.policy_json(pid);
end $$;
create function public.policy_save(p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.policy_save(p_data)$$;
create function private.policy_delete(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); begin delete from public.review_policies where user_id=u and id=p_id; if not found then raise exception 'Política não encontrada'; end if; return jsonb_build_object('deleted',true); end $$;
create function public.policy_delete(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.policy_delete(p_id)$$;

-- A study context must belong to the tenant and question. An explicit project must match the notebook.
create function private.validate_context(p_question_id uuid,p_context jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=private.require_user(); pid uuid:=nullif(p_context->>'project_id','')::uuid; nid uuid:=nullif(p_context->>'notebook_id','')::uuid; parent uuid;
begin
 if not exists(select 1 from public.questions where user_id=u and id=p_question_id) then raise exception 'Questão não encontrada'; end if;
 if nid is not null then
   select c.parent_id into parent from public.catalogs c join public.question_catalogs qc on qc.user_id=c.user_id and qc.catalog_id=c.id where c.user_id=u and c.id=nid and c.kind='notebook' and qc.question_id=p_question_id;
   if not found then raise exception 'Caderno não vinculado à questão'; end if;
   if pid is not null and parent is not null and pid<>parent then raise exception 'Caderno não pertence ao projeto informado'; end if;
   pid:=coalesce(pid,parent);
 end if;
 if pid is not null and not exists(select 1 from public.catalogs c where c.user_id=u and c.id=pid and c.kind='project') then raise exception 'Projeto não encontrado'; end if;
 if pid is not null and pid is distinct from parent and not exists(select 1 from public.question_catalogs where user_id=u and question_id=p_question_id and catalog_id=pid) then raise exception 'Projeto não vinculado à questão'; end if;
 return jsonb_strip_nulls(jsonb_build_object('project_id',pid,'notebook_id',nid));
end $$;
create function public.policy_resolve(p_question_id uuid,p_context jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ctx jsonb:=private.validate_context(p_question_id,p_context); pid uuid; begin
 select p.id into pid from public.review_policies p where p.user_id=auth.uid() and
 ((p.scope='question' and p.question_id=p_question_id) or (p.scope='notebook' and p.catalog_id=(ctx->>'notebook_id')::uuid) or (p.scope='project' and p.catalog_id=(ctx->>'project_id')::uuid) or p.scope='global')
 order by case p.scope when 'question' then 4 when 'notebook' then 3 when 'project' then 2 else 1 end desc limit 1;
 return private.policy_json(pid);
end $$;

create function private.answer_question(p_question_id uuid,p_answer text,p_elapsed_ms integer,p_context jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); a public.attempts; q public.questions; rs public.review_schedules; ctx jsonb; aid uuid:=gen_random_uuid(); now_at timestamptz:=clock_timestamp(); result jsonb;
begin
 if p_request_id is null then raise exception 'request_id obrigatório'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,0));
 select * into a from public.attempts where user_id=u and request_id=p_request_id;
 if found then
  if a.question_id<>p_question_id or a.answer<>p_answer or a.elapsed_ms<>p_elapsed_ms or a.context is distinct from private.validate_context(p_question_id,p_context) then raise exception 'request_id reutilizado com conteúdo diferente'; end if;
  return private.attempt_json(a.id);
 end if;
 select * into q from public.questions where user_id=u and id=p_question_id for update;
 if not found or q.status<>'active' then raise exception 'Questão indisponível'; end if;
 if not exists(select 1 from public.question_alternatives where user_id=u and question_id=p_question_id and key=p_answer) then raise exception 'Resposta inválida'; end if;
 ctx:=private.validate_context(p_question_id,p_context);
 insert into public.review_schedules(user_id,question_id) values(u,p_question_id) on conflict do nothing;
 select * into rs from public.review_schedules where user_id=u and question_id=p_question_id for update;
 result:=private.question_json(p_question_id);
 insert into public.attempts(user_id,id,question_id,request_id,answered_at,answer,correct_answer,is_correct,elapsed_ms,statement_snapshot,content_snapshot,search_text,context,project_id,notebook_id,was_review,schedule_version)
 values(u,aid,p_question_id,p_request_id,now_at,p_answer,q.correct_answer,p_answer=q.correct_answer,p_elapsed_ms,q.statement,result,q.search_text,ctx,(ctx->>'project_id')::uuid,(ctx->>'notebook_id')::uuid,rs.status='active' and rs.next_review_at<=now_at,rs.version+1);
 update public.review_schedules set version=version+1,last_attempt_id=aid,updated_at=now_at where user_id=u and question_id=p_question_id;
 insert into public.question_statistics(user_id,question_id,attempt_count,error_count,last_correct,last_answered_at) values(u,p_question_id,1,case when p_answer=q.correct_answer then 0 else 1 end,p_answer=q.correct_answer,now_at)
 on conflict(user_id,question_id) do update set attempt_count=question_statistics.attempt_count+1,error_count=question_statistics.error_count+excluded.error_count,last_correct=excluded.last_correct,last_answered_at=excluded.last_answered_at;
 return private.attempt_json(aid);
end $$;
create function public.answer_question(p_question_id uuid,p_answer text,p_elapsed_ms integer,p_context jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.answer_question(p_question_id,p_answer,p_elapsed_ms,p_context,p_request_id)$$;

create function private.schedule_attempt(p_attempt_id uuid,p_interval_id uuid,p_expected_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); a public.attempts; rs public.review_schedules; e public.review_events; selected public.review_policy_intervals; policy jsonb; snapshot jsonb; next_at timestamptz;
begin
 if p_request_id is null then raise exception 'request_id obrigatório'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,0));
 select * into e from public.review_events where user_id=u and request_id=p_request_id;
 if found then
  if e.attempt_id is distinct from p_attempt_id or e.interval_snapshot->>'id' is distinct from p_interval_id::text or e.action<>'schedule' then raise exception 'request_id reutilizado com conteúdo diferente'; end if;
  return to_jsonb(e)-'user_id'-'request_id';
 end if;
 select * into a from public.attempts where user_id=u and id=p_attempt_id;
 if not found then raise exception 'Tentativa não encontrada'; end if;
 perform 1 from public.questions where user_id=u and id=a.question_id for update;
 select * into rs from public.review_schedules where user_id=u and question_id=a.question_id for update;
 if p_expected_version is null or rs.version<>p_expected_version or rs.last_attempt_id is distinct from a.id then raise exception 'Agendamento alterado em outra sessão. Atualize a questão.' using errcode='40001'; end if;
 policy:=public.policy_resolve(a.question_id,a.context);
 select * into selected from public.review_policy_intervals where user_id=u and id=p_interval_id and policy_id=(policy->>'id')::uuid and active;
 if not found then raise exception 'Intervalo não disponível na política atual'; end if;
 snapshot:=(to_jsonb(selected)-'user_id')||jsonb_build_object('policy_name',policy->>'name','scope',policy->>'scope');
 -- Seconds intentionally avoid calendar-day/DST arithmetic. Answer timestamp is the immutable origin.
 next_at:=a.answered_at + (selected.seconds::double precision * interval '1 second');
 update public.review_schedules set next_review_at=next_at,status='active',version=version+1,updated_at=clock_timestamp() where user_id=u and question_id=a.question_id;
 insert into public.review_events(user_id,question_id,attempt_id,request_id,action,interval_snapshot,next_review_at,previous_next_review_at,previous_status,schedule_version)
 values(u,a.question_id,a.id,p_request_id,'schedule',snapshot,next_at,rs.next_review_at,rs.status,rs.version+1) returning * into e;
 return to_jsonb(e)-'user_id'-'request_id';
end $$;
create function public.schedule_attempt(p_attempt_id uuid,p_interval_id uuid,p_expected_version integer,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.schedule_attempt(p_attempt_id,p_interval_id,p_expected_version,p_request_id)$$;

create function private.review_manage(p_question_id uuid,p_action text,p_next_review_at timestamptz default null,p_expected_version integer default 0,p_request_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); rs public.review_schedules; e public.review_events; next_at timestamptz; status_value text;
begin
 if p_request_id is null or p_action not in ('reschedule','suspend','activate','remove') then raise exception 'Ação ou request_id inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,0));
 select * into e from public.review_events where user_id=u and request_id=p_request_id;
 if found then
   if e.question_id<>p_question_id or e.action<>p_action or (p_action='reschedule' and e.next_review_at is distinct from p_next_review_at) then raise exception 'request_id reutilizado com conteúdo diferente'; end if;
   return to_jsonb(e)-'user_id'-'request_id';
 end if;
 perform 1 from public.questions where user_id=u and id=p_question_id for update; if not found then raise exception 'Questão não encontrada'; end if;
 insert into public.review_schedules(user_id,question_id) values(u,p_question_id) on conflict do nothing;
 select * into rs from public.review_schedules where user_id=u and question_id=p_question_id for update;
 if p_expected_version is null or rs.version<>p_expected_version then raise exception 'Agendamento alterado em outra sessão. Atualize a questão.' using errcode='40001'; end if;
 if p_action='reschedule' and p_next_review_at is null then raise exception 'Informe a nova data'; end if;
 if p_next_review_at is not null and not isfinite(p_next_review_at) then raise exception 'Data inválida'; end if;
 next_at:=case p_action when 'remove' then null when 'reschedule' then p_next_review_at when 'activate' then coalesce(p_next_review_at,rs.next_review_at,clock_timestamp()) else rs.next_review_at end;
 status_value:=case p_action when 'remove' then 'removed' when 'suspend' then 'suspended' else 'active' end;
 update public.review_schedules set next_review_at=next_at,status=status_value,version=version+1,updated_at=clock_timestamp() where user_id=u and question_id=p_question_id;
 insert into public.review_events(user_id,question_id,request_id,action,next_review_at,previous_next_review_at,previous_status,schedule_version)
 values(u,p_question_id,p_request_id,p_action,next_at,rs.next_review_at,rs.status,rs.version+1) returning * into e;
 return to_jsonb(e)-'user_id'-'request_id';
end $$;
create function public.review_manage(p_question_id uuid,p_action text,p_next_review_at timestamptz default null,p_expected_version integer default 0,p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.review_manage(p_question_id,p_action,p_next_review_at,p_expected_version,p_request_id)$$;

create function private.filtered_attempts(p_filters jsonb) returns setof public.attempts language sql stable security invoker set search_path='' as $$
 select a.* from public.attempts a
 where a.user_id=auth.uid()
 and (nullif(p_filters->>'question_id','') is null or a.question_id=(p_filters->>'question_id')::uuid)
 and (nullif(p_filters->>'days','') is null or a.answered_at>=(date_trunc('day',now() at time zone coalesce(p_filters->>'timezone','America/Sao_Paulo')) - (least(greatest((p_filters->>'days')::integer,1),36500)-1)*interval '1 day') at time zone coalesce(p_filters->>'timezone','America/Sao_Paulo'))
 and (not (p_filters ? 'correct') or a.is_correct=(p_filters->>'correct')::boolean)
 and (nullif(p_filters->>'project_id','') is null or a.project_id=(p_filters->>'project_id')::uuid)
 and (nullif(p_filters->>'notebook_id','') is null or a.notebook_id=(p_filters->>'notebook_id')::uuid)
 and (nullif(p_filters->>'query','') is null or a.search_vector @@ websearch_to_tsquery('portuguese'::regconfig,p_filters->>'query') or a.search_text ilike '%'||replace(replace(replace(p_filters->>'query','\','\\'),'%','\%'),'_','\_')||'%' or a.question_id::text=p_filters->>'query')
 and (nullif(p_filters->>'year_min','') is null or (a.content_snapshot->>'year')::integer>=(p_filters->>'year_min')::integer)
 and (nullif(p_filters->>'year_max','') is null or (a.content_snapshot->>'year')::integer<=(p_filters->>'year_max')::integer)
 and not exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'catalog_ids','[]'::jsonb)) f where not coalesce(a.content_snapshot->'catalog_ids','[]'::jsonb) @> jsonb_build_array(f.value))
$$;
create function public.history_list(p_filters jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare lim integer:=least(greatest(coalesce((p_filters->>'page_size')::integer,25),1),100); off integer:=least(greatest(coalesce((p_filters->>'page')::integer,1)-1,0),1000000); total bigint; result jsonb;
begin
 perform private.require_user();
 if not exists(select 1 from pg_timezone_names where name=coalesce(p_filters->>'timezone','America/Sao_Paulo')) then raise exception 'Timezone inválido'; end if;
 select count(*) into total from private.filtered_attempts(p_filters);
 select coalesce(jsonb_agg(private.attempt_json(t.id) order by t.n),'[]'::jsonb) into result from (
 select a.id,row_number() over(order by case when coalesce((p_filters->>'ascending')::boolean,false) then a.answered_at end asc,case when not coalesce((p_filters->>'ascending')::boolean,false) then a.answered_at end desc,a.id) n
 from private.filtered_attempts(p_filters) a order by n limit lim offset off*lim) t;
 return jsonb_build_object('items',result,'total',total);
end $$;
create function public.dashboard(p_filters jsonb default '{}',p_timezone text default 'America/Sao_Paulo') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today_start timestamptz; tomorrow_start timestamptz; result jsonb;
begin
 perform private.require_user();
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Timezone inválido'; end if;
 today_start:=date_trunc('day',now() at time zone p_timezone) at time zone p_timezone;
 tomorrow_start:=(date_trunc('day',now() at time zone p_timezone)+interval '1 day') at time zone p_timezone;
 with question_set as materialized(select * from private.filtered_questions(p_filters - array['page','page_size','mode','query'])),
 period_attempts as materialized(select * from private.filtered_attempts((p_filters - array['page','page_size','mode','query']) || jsonb_build_object('days',coalesce((p_filters->>'days')::integer,30),'timezone',p_timezone))),
 today_attempts as materialized(select a.* from public.attempts a where a.user_id=auth.uid() and a.answered_at>=today_start and a.answered_at<tomorrow_start
  and (nullif(p_filters->>'project_id','') is null or a.project_id=(p_filters->>'project_id')::uuid)
  and (nullif(p_filters->>'notebook_id','') is null or a.notebook_id=(p_filters->>'notebook_id')::uuid)
  and not exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'catalog_ids','[]'::jsonb)) f where not coalesce(a.content_snapshot->'catalog_ids','[]') @> jsonb_build_array(f.value))),
 schedule_set as materialized(select s.* from public.review_schedules s join question_set q on q.user_id=s.user_id and q.id=s.question_id where s.status='active'),
 daily_rows as(select (a.answered_at at time zone p_timezone)::date date,count(*) answered,count(*) filter(where a.is_correct) correct from period_attempts a group by 1),
 weak_rows as(select c.id,c.name,count(*) answered,count(*) filter(where a.is_correct) correct from period_attempts a
  cross join lateral jsonb_array_elements_text(coalesce(a.content_snapshot->'catalog_ids','[]')) j
  join public.catalogs c on c.user_id=a.user_id and c.id=j.value::uuid and c.kind='subject' group by c.id,c.name),
 forecast_rows as(select (s.next_review_at at time zone p_timezone)::date date,count(*) count from schedule_set s where s.next_review_at>=today_start and s.next_review_at<tomorrow_start+interval '13 days' group by 1)
 select jsonb_build_object(
 'today',(select jsonb_build_object('answered',count(*),'correct',count(*) filter(where is_correct),'incorrect',count(*) filter(where not is_correct),'elapsed_ms',coalesce(sum(elapsed_ms),0),'reviewed',count(*) filter(where was_review)) from today_attempts),
 'due',(select count(*) from schedule_set where next_review_at<=now()),
 'overdue',(select count(*) from schedule_set where next_review_at<today_start),
 'new_questions',(select count(*) from question_set q where not exists(select 1 from public.question_statistics s where s.user_id=q.user_id and s.question_id=q.id and s.attempt_count>0)),
 'total_questions',(select count(*) from question_set),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from daily_rows d),'[]'::jsonb),
 'weak_subjects',coalesce((select jsonb_agg(to_jsonb(w)-'id') from (select * from weak_rows order by correct::numeric/nullif(answered,0),answered desc limit 10) w),'[]'::jsonb),
 'forecast',coalesce((select jsonb_agg(to_jsonb(f) order by f.date) from forecast_rows f),'[]'::jsonb)) into result;
 return result;
end $$;

create function private.fingerprint(p_data jsonb) returns text language plpgsql immutable security invoker set search_path='' as $$
declare body jsonb; alts jsonb; begin
 select coalesce(jsonb_agg(jsonb_build_array(a.value->>'key',lower(private.plain_text(private.clean_html(a.value->>'text')))) order by a.value->>'key'),'[]') into alts from jsonb_array_elements(coalesce(p_data->'alternatives','[]')) a;
 body:=jsonb_build_array(p_data->>'type',lower(private.plain_text(private.clean_html(p_data->>'statement'))),alts);
 return encode(sha256(convert_to(body::text,'UTF8')),'hex');
end $$;
create function public.import_duplicates(p_rows jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=private.require_user(); r jsonb; result jsonb:='[]'; idx integer:=0; exact_id uuid; possible_ids jsonb; begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'Consulte no máximo 1.000 registros por lote'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  idx:=idx+1;
  select id into exact_id from public.questions where user_id=u and normalized_source=lower(btrim(r->>'source')) and external_id=nullif(btrim(r->>'external_id'),'');
  select coalesce(jsonb_agg(t.id),'[]') into possible_ids from (select id from public.questions where user_id=u and fingerprint=private.fingerprint(r) and id is distinct from exact_id limit 10) t;
  result:=result||jsonb_build_array(jsonb_build_object('index',idx,'question_id',exact_id,'exact',exact_id is not null,'possible',jsonb_array_length(possible_ids)>0,'possible_ids',possible_ids));
 end loop;
 return result;
end $$;
create function private.import_result(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('report',to_jsonb(i)-'user_id'-'request_id'-'file_hash'-'payload_hash'-'duplicate_policy','items',coalesce((select jsonb_agg(to_jsonb(x)-'user_id'-'import_id' order by x.index) from public.import_items x where x.user_id=i.user_id and x.import_id=i.id),'[]'::jsonb)) from public.imports i where i.user_id=auth.uid() and i.id=p_id
$$;
create function private.import_commit(p_rows jsonb,p_file_name text,p_file_hash text,p_duplicate_policy text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); job public.imports; jid uuid:=gen_random_uuid(); r jsonb; idx integer:=0; qid uuid; existing uuid; result jsonb; status_value text; error_value text;
begin
 if p_request_id is null or p_file_hash is null or p_file_hash !~ '^[a-fA-F0-9]{64}$' then raise exception 'request_id e hash SHA-256 obrigatórios'; end if;
 if p_duplicate_policy not in ('skip','update','cancel') or p_duplicate_policy is null then raise exception 'Política de duplicação inválida'; end if;
 if jsonb_typeof(p_rows)<>'array' or p_rows is null or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Importe de 1 a 1.000 registros por lote'; end if;
 if length(coalesce(p_file_name,'')) not between 1 and 255 then raise exception 'Nome de arquivo inválido'; end if;
 -- Serialize import transactions per tenant: two overlapping files cannot race classification creation or exact identities.
 perform pg_advisory_xact_lock(hashtextextended('import:'||u::text,0));
 select * into job from public.imports where user_id=u and request_id=p_request_id;
 if found then
  if job.file_hash<>lower(p_file_hash) or job.duplicate_policy<>p_duplicate_policy or job.payload_hash<>encode(sha256(convert_to(p_rows::text,'UTF8')),'hex') then raise exception 'request_id reutilizado com conteúdo diferente'; end if;
  return private.import_result(job.id);
 end if;
 select * into job from public.imports where user_id=u and file_hash=lower(p_file_hash);
 if found then return private.import_result(job.id); end if;
 if p_duplicate_policy='cancel' and (
 exists(select 1 from jsonb_array_elements(p_rows) incoming join public.questions q on q.user_id=u and q.normalized_source=lower(btrim(incoming.value->>'source')) and q.external_id=nullif(btrim(incoming.value->>'external_id'),'')) or
 exists(select 1 from jsonb_array_elements(p_rows) incoming where nullif(btrim(incoming.value->>'external_id'),'') is not null group by lower(btrim(incoming.value->>'source')),btrim(incoming.value->>'external_id') having count(*)>1)) then raise exception 'Importação cancelada: existem IDs duplicados'; end if;
 insert into public.imports(user_id,id,request_id,file_name,file_hash,payload_hash,duplicate_policy,received) values(u,jid,p_request_id,p_file_name,lower(p_file_hash),encode(sha256(convert_to(p_rows::text,'UTF8')),'hex'),p_duplicate_policy,jsonb_array_length(p_rows));
 for r in select value from jsonb_array_elements(p_rows) loop
  idx:=idx+1; existing:=null; qid:=null; error_value:=null;
  begin
   select id into existing from public.questions where user_id=u and normalized_source=lower(btrim(r->>'source')) and external_id=nullif(btrim(r->>'external_id'),'');
   if existing is not null and p_duplicate_policy='skip' then qid:=existing; status_value:='skipped';
   else
    result:=private.question_save(r,existing); qid:=(result->>'id')::uuid; status_value:=case when existing is null then 'inserted' else 'updated' end;
   end if;
  exception when others then
   status_value:='error'; error_value:=SQLERRM; qid:=null;
  end;
  insert into public.import_items(user_id,import_id,index,status,question_id,error) values(u,jid,idx,status_value,qid,error_value);
  update public.imports set inserted=inserted+case when status_value='inserted' then 1 else 0 end,
   updated=updated+case when status_value='updated' then 1 else 0 end,
   skipped=skipped+case when status_value='skipped' then 1 else 0 end,
   errors=errors+case when status_value='error' then 1 else 0 end,
   duplicates=duplicates+case when existing is not null then 1 else 0 end
  where user_id=u and id=jid;
 end loop;
 return private.import_result(jid);
end $$;
create function public.import_commit(p_rows jsonb,p_file_name text,p_file_hash text,p_duplicate_policy text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.import_commit(p_rows,p_file_name,p_file_hash,p_duplicate_policy,p_request_id)$$;
create function public.import_list() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(i)-'user_id'-'request_id'-'file_hash'-'payload_hash'-'duplicate_policy' order by i.created_at desc),'[]'::jsonb) from (select * from public.imports where user_id=auth.uid() order by created_at desc limit 100) i
$$;
create function public.export_page(p_table text,p_offset integer default 0,p_limit integer default 500) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=private.require_user(); result jsonb; ordering text; begin
 if p_table not in ('catalogs','questions','question_alternatives','question_catalogs','review_policies','review_policy_intervals','attempts','review_events','review_schedules','question_statistics','imports','import_items') then raise exception 'Tabela não exportável'; end if;
 ordering:=case p_table when 'question_alternatives' then 'question_id,key' when 'question_catalogs' then 'question_id,catalog_id' when 'review_schedules' then 'question_id' when 'question_statistics' then 'question_id' when 'import_items' then 'import_id,index' else 'id' end;
 execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from (select * from public.%I where user_id=$1 order by %s limit $2 offset $3) t',p_table,ordering)
 into result using u,least(greatest(p_limit,1),1000),greatest(p_offset,0);
 return result;
end $$;

-- Revoke PostgreSQL's default EXECUTE grant on every newly declared API/helper.
-- Private functions are not in exposed PostgREST schemas. They recheck identity even when called directly.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,n.nspname schema_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' or (n.nspname='public' and p.proname=any(array['catalog_list','catalog_save','catalog_archive','catalog_delete','question_list','question_get','question_save','question_patch','question_delete_many','policy_list','policy_save','policy_delete','policy_resolve','answer_question','schedule_attempt','review_manage','history_list','dashboard','import_duplicates','import_commit','import_list','export_page'])) loop
  execute format('revoke all on function %s from public, anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
