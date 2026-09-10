// Reproducible, local-only load check; run from the repository root:
// node tests/performance.mjs
// No hosted database, credentials, package changes, or persistent data files.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const user = '00000000-0000-4000-8000-000000000001';
const repetitions = 5;
const batchSize = 2500;
const db = new PGlite({ extensions: { pg_trgm } });
const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
const measurements = [];
const memory = () => ({ rss_mib: +(process.memoryUsage().rss / 1024 ** 2).toFixed(1), heap_mib: +(process.memoryUsage().heapUsed / 1024 ** 2).toFixed(1) });
async function role() {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('set role authenticated');
}
async function rpc(name, filters = {}) {
  assert.ok(['question_list', 'dashboard', 'history_list'].includes(name));
  return (await db.query(`select public.${name}(p_filters => $1::jsonb) as result`, [JSON.stringify(filters)])).rows[0].result;
}
async function measure(size, name, call, validate) {
  validate(await call()); // Warm PostgreSQL buffers, query plans and WASM code.
  const samples = [];
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now();
    const value = await call();
    samples.push(+(performance.now() - start).toFixed(2));
    validate(value);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const record = { questions: size, name, samples_ms: samples, median_ms: sorted[2], max_ms: sorted.at(-1), ...memory() };
  measurements.push(record);
  console.log(JSON.stringify(record));
}
function pageCheck(total, length = 20) {
  return value => {
    assert.equal(value.total, total);
    assert.equal(value.items.length, length);
    assert.equal(new Set(value.items.map(q => q.id)).size, length);
  };
}

try {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${user}');`);
  for (const migration of migrations) await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  console.log(JSON.stringify({ environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, postgres: (await db.query('select version()')).rows[0].version, pglite: '0.3.15', date_utc: new Date().toISOString(), migrations, repetitions, batchSize } }));
  await db.exec(`insert into public.catalogs(user_id,id,kind,name)
    select '${user}',md5('subject-'||i)::uuid,'subject','Matéria sintética '||i from generate_series(1,10) i;
    insert into public.catalogs(user_id,id,kind,name)
    select '${user}',md5('notebook-'||i)::uuid,'notebook','Caderno sintético '||i from generate_series(1,5) i;`);
  let previous = 0;
  for (const size of [10000, 50000]) {
    await db.exec('reset role');
    const seedStart = performance.now();
    for (let start = previous + 1; start <= size; start += batchSize) {
      const end = Math.min(size, start + batchSize - 1);
      await db.exec(`begin;
        insert into public.questions(user_id,id,source,external_id,type,statement,correct_answer,general_explanation,year,search_text,fingerprint,created_at)
        select '${user}',md5('question-'||i)::uuid,'Carga sintética',i::text,'multiple_choice',
          '<p>Questão sintética '||i||': '||case when i%100=0 then 'restos a pagar' else 'administração de recursos públicos' end||'. Avalie a aplicação do procedimento ao caso apresentado.</p>',
          'B','Comentário geral sobre planejamento, execução e controle.',2020+i%7,
          'Questão sintética '||i||' '||case when i%100=0 then 'restos a pagar' else 'administração de recursos públicos' end||
          ' Avalie a aplicação do procedimento ao caso apresentado. Comentário geral sobre planejamento execução e controle. Alternativa A Alternativa B Alternativa C Alternativa D '||
          case when i%125=0 then 'obrigação financeira' else 'fundamento administrativo' end,
          md5('synthetic-'||i),now()-i*interval '1 second' from generate_series(${start},${end}) i;
        insert into public.question_alternatives(user_id,question_id,key,text,explanation,position)
        select '${user}',md5('question-'||i)::uuid,chr(64+a),'Alternativa '||chr(64+a),
          case when a=2 and i%125=0 then 'obrigação financeira' else 'fundamento administrativo' end,a-1
          from generate_series(${start},${end}) i cross join generate_series(1,4) a;
        insert into public.question_catalogs(user_id,question_id,catalog_id)
        select '${user}'::uuid,md5('question-'||i)::uuid,md5('subject-'||(1+i%10))::uuid from generate_series(${start},${end}) i
        union all select '${user}'::uuid,md5('question-'||i)::uuid,md5('notebook-'||(1+i%5))::uuid from generate_series(${start},${end}) i;
        insert into public.review_schedules(user_id,question_id,next_review_at,status,version)
        select '${user}',md5('question-'||i)::uuid,now()+case when i%5=0 then interval '-1 day' else interval '5 days' end,'active',1
        from generate_series(${start},${end}) i; commit;`);
    }
    if (previous === 0) {
      await db.exec(`insert into public.attempts(user_id,id,question_id,request_id,answered_at,answer,correct_answer,is_correct,elapsed_ms,statement_snapshot,content_snapshot,search_text,context,notebook_id,was_review,schedule_version)
        select q.user_id,md5('attempt-'||q.external_id)::uuid,q.id,md5('request-'||q.external_id)::uuid,
          now()-(q.external_id::integer%30)*interval '1 day',case when q.external_id::integer%4=0 then 'A' else 'B' end,'B',q.external_id::integer%4<>0,5000,
          q.statement,jsonb_build_object('id',q.id,'statement',q.statement,'year',q.year,'catalog_ids',jsonb_build_array(md5('subject-'||(1+q.external_id::integer%10))::uuid,md5('notebook-'||(1+q.external_id::integer%5))::uuid)),
          q.search_text,jsonb_build_object('notebook_id',md5('notebook-'||(1+q.external_id::integer%5))::uuid),md5('notebook-'||(1+q.external_id::integer%5))::uuid,q.external_id::integer%5=0,1 from public.questions q;
        insert into public.question_statistics(user_id,question_id,attempt_count,error_count,last_correct,last_answered_at)
        select user_id,question_id,1,case when is_correct then 0 else 1 end,is_correct,answered_at from public.attempts;
        update public.review_schedules s set last_attempt_id=a.id from public.attempts a where s.user_id=a.user_id and s.question_id=a.question_id;`);
    }
    await db.exec('analyze');
    const seedMs = +(performance.now() - seedStart).toFixed(2);
    await role();
    const counts = (await db.query(`select (select count(*) from public.questions)::int questions,
      (select count(*) from public.question_alternatives)::int alternatives,(select count(*) from public.question_catalogs)::int links,
      (select count(*) from public.attempts)::int attempts,(select count(*) from public.review_schedules where status='active' and next_review_at<=now())::int due`)).rows[0];
    assert.deepEqual(counts, { questions: size, alternatives: size * 4, links: size * 2, attempts: 10000, due: size / 5 });
    console.log(JSON.stringify({ seeded: counts, added_questions: size - previous, seed_ms: seedMs, ...memory() }));
    await measure(size, 'question_list first page', () => rpc('question_list', { page: 1, page_size: 20 }), pageCheck(size));
    await measure(size, 'question_list final page', () => rpc('question_list', { page: size / 20, page_size: 20 }), pageCheck(size));
    await measure(size, 'statement phrase', () => rpc('question_list', { query: 'restos a pagar', page_size: 20 }), pageCheck(size / 100));
    await measure(size, 'alternative explanation phrase', () => rpc('question_list', { query: 'obrigação financeira', page_size: 20 }), pageCheck(size / 125));
    await measure(size, 'due queue', () => rpc('question_list', { mode: 'due', sort: 'due', page_size: 20 }), value => {
      pageCheck(size / 5)(value);
      assert.ok(value.items.every(q => q.review_status === 'active' && Date.parse(q.next_review_at) < Date.now()));
    });
    await measure(size, 'history 10k', () => rpc('history_list', { page_size: 25 }), pageCheck(10000, 25));
    await measure(size, 'dashboard 30 days', () => rpc('dashboard', { days: 30 }), value => {
      assert.equal(value.total_questions, size);
      assert.equal(value.due, size / 5);
      assert.equal(value.new_questions, size - 10000);
      assert.equal(value.daily.reduce((sum, day) => sum + day.answered, 0), 10000);
      assert.equal(value.daily.reduce((sum, day) => sum + day.correct, 0), 7500);
    });
    const limited = await rpc('question_list', { page_size: 1000 });
    pageCheck(size, 100)(limited);
    assert.equal(limited.items[0].alternatives.length, 4);
    assert.equal(limited.items[0].catalog_ids.length, 2);
    const first = await rpc('question_list', { page: 1, page_size: 20 });
    const second = await rpc('question_list', { page: 2, page_size: 20 });
    assert.ok(second.items.every(q => !first.items.some(p => p.id === q.id)));
    previous = size;
  }
  console.log(JSON.stringify({ status: 'PASS', measured_cases: measurements.length, note: 'Local single-process PostgreSQL WASM timings; not a production SLA or concurrent/network load test.' }));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', message: error.message, code: error.code }));
  process.exitCode = 1;
} finally {
  await db.close();
}
