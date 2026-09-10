// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type {
  Attempt,
  Catalog,
  Dashboard,
  ImportResult,
  Page,
  Policy,
  Question,
  QuestionInput,
  ReviewEvent,
} from "../src/domain/types";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
const fixture = (override: Partial<QuestionInput> = {}): QuestionInput => ({
  source: "origem",
  external_id: "123",
  type: "multiple_choice",
  statement: "<p>Como registrar restos a pagar?</p>",
  alternatives: [
    {
      key: "A",
      text: "Primeira opção",
      explanation: "Incorreta: despesa não empenhada.",
    },
    {
      key: "B",
      text: "Segunda opção",
      explanation: "Correta: obrigação financeira.",
    },
  ],
  correct_answer: "B",
  general_explanation: "<strong>Regime orçamentário</strong>",
  ...override,
});

async function role(user: string | null, name = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user ?? "",
  ]);
  await db.exec(`set role ${name}`);
}
async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  // Function and parameter identifiers below are test code constants, never user input.
  const pairs = Object.entries(args);
  const result = await db.query<{ result: T }>(
    `select public.${name}(${pairs.map(([key], i) => `${key} => $${i + 1}`).join(",")}) as result`,
    pairs.map(([, value]) =>
      typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : value,
    ),
  );
  return result.rows[0].result;
}
const save = (input = fixture(), id: string | null = null) =>
  rpc<Question>("question_save", { p_data: input, p_id: id });
const catalog = (kind: string, name: string, parent_id: string | null = null) =>
  rpc<Catalog>("catalog_save", { p_data: { kind, name, parent_id } });
const policy = (
  scope = "global",
  target_id: string | null = null,
  value = 10,
  unit = "day",
  id?: string,
) =>
  rpc<Policy>("policy_save", {
    p_data: {
      id,
      scope,
      target_id,
      name: scope,
      intervals: [
        { label: `${value} ${unit}`, value, unit, position: 0, active: true },
      ],
    },
  });
const answer = (
  q: Question,
  choice = "B",
  request = randomUUID(),
  context = {},
) =>
  rpc<Attempt>("answer_question", {
    p_question_id: q.id,
    p_answer: choice,
    p_elapsed_ms: 5000,
    p_context: context,
    p_request_id: request,
  });
const schedule = (a: Attempt, p: Policy, request = randomUUID()) =>
  rpc<ReviewEvent>("schedule_attempt", {
    p_attempt_id: a.id,
    p_interval_id: p.intervals[0].id,
    p_expected_version: a.schedule_version,
    p_request_id: request,
  });
const questions = (filters = {}) =>
  rpc<Page<Question>>("question_list", { p_filters: filters });

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${alice}'),('${bob}');`);
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(migrations.length).toBeGreaterThan(0);
  for (const file of migrations) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    expect(sql.length, "Migration must not be empty").toBeGreaterThan(100);
    await db.exec(sql);
  }
}, 60000);
afterAll(async () => {
  if (db) await db.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role; truncate public.catalogs,public.questions,public.review_policies,public.imports cascade",
  );
  await role(alice);
});

describe("real PostgreSQL ownership and integrity", () => {
  it("enables RLS on every exposed application table and grants no anonymous access", async () => {
    await db.exec("reset role");
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(12);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
    await role(null, "anon");
    await expect(db.query("select * from public.questions")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(rpc("question_list")).rejects.toThrow(/permission denied/i);
    await role(null);
    await expect(save()).rejects.toThrow();
  });
  it("isolates reads and RPC mutations across two users", async () => {
    const q = await save();
    const project = await catalog("project", "Meu projeto");
    await role(bob);
    expect((await questions()).total).toBe(0);
    expect(await rpc("question_get", { p_id: q.id })).toBeNull();
    expect(
      (await db.query("select * from public.questions")).rows,
    ).toHaveLength(0);
    await expect(
      rpc("question_patch", { p_id: q.id, p_patch: { favorite: true } }),
    ).rejects.toThrow();
    await expect(catalog("notebook", "Invasão", project.id)).rejects.toThrow();
    await expect(
      save(fixture({ catalog_ids: [project.id] })),
    ).rejects.toThrow();
    expect((await save()).id).not.toBe(q.id); // Identity is tenant-scoped.
  });
  it("rejects direct mutations, including immutable history", async () => {
    const q = await save();
    await answer(q);
    await expect(
      db.query("update public.questions set user_id=$1", [bob]),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.query("delete from public.attempts")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      db.query("update public.attempts set is_correct=false"),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.query("delete from public.review_events")).rejects.toThrow(
      /permission denied/i,
    );
  });
  it("checks hierarchy roles and supports many notebooks without copying questions", async () => {
    const p = await catalog("project", "TRT4");
    const n1 = await catalog("notebook", "Direito", p.id);
    const n2 = await catalog("notebook", "Erros", p.id);
    await expect(catalog("subject", "Inválido", n1.id)).rejects.toThrow();
    const q = await save(fixture({ catalog_ids: [n1.id, n2.id] }));
    expect((await questions({ notebook_id: n1.id })).items[0].id).toBe(q.id);
    expect((await questions({ notebook_id: n2.id })).items[0].id).toBe(q.id);
    expect((await questions()).total).toBe(1);
    await expect(rpc("catalog_delete", { p_id: n1.id })).rejects.toThrow();
  });
  it("enforces source + external ID, allowing equal IDs from different providers", async () => {
    await save();
    await expect(
      save(fixture({ source: " ORIGEM ", external_id: "123" })),
    ).rejects.toThrow();
    await save(fixture({ source: "outra origem" }));
    expect((await questions()).total).toBe(2);
  });
  it("does not block content-only similarity and validates answers and alternative keys", async () => {
    await save(fixture({ external_id: null }));
    await save(fixture({ external_id: null }));
    expect((await questions()).total).toBe(2);
    await expect(save(fixture({ correct_answer: "Z" }))).rejects.toThrow();
    await expect(
      save(
        fixture({
          alternatives: [
            { key: "A", text: "Um", explanation: "" },
            { key: "A", text: "Dois", explanation: "" },
          ],
        }),
      ),
    ).rejects.toThrow();
    await expect(save(fixture({ type: "true_false" }))).rejects.toThrow();
    const q = await save(
      fixture({
        type: "true_false",
        alternatives: [
          { key: "TRUE", text: "Certo", explanation: "" },
          { key: "FALSE", text: "Errado", explanation: "" },
        ],
        correct_answer: "TRUE",
      }),
    );
    expect((await answer(q, "TRUE")).is_correct).toBe(true);
  });
  it("sanitizes content even when the browser sanitizer is bypassed", async () => {
    const q = await save(
      fixture({
        statement:
          '<script>alert(1)</script><p onclick="alert(2)"><strong>Questão</strong><img src=x onerror=alert(3)><a href="javascript:alert(4)">link</a></p>',
      }),
    );
    expect(q.statement).not.toMatch(
      /<script|onerror|onclick|javascript:|<img/i,
    );
    expect(q.statement).toContain("<strong>Questão</strong>");
    expect(q.statement).not.toContain("alert(1)");
  });
  it("searches statement, alternatives and explanations with combined filters and real pagination", async () => {
    const subject = await catalog("subject", "AFO");
    await save(fixture({ catalog_ids: [subject.id], year: 2025 }));
    await save(
      fixture({
        external_id: "124",
        statement: "<p>Outro enunciado</p>",
        year: 2022,
      }),
    );
    expect((await questions({ query: "restos a pagar" })).total).toBe(1);
    expect(
      (
        await questions({
          query: "obrigação financeira",
          catalog_ids: [subject.id],
          year_min: 2023,
        })
      ).total,
    ).toBe(1);
    expect(
      (await questions({ query: "Primeira opção", year_min: 2023 })).total,
    ).toBe(1);
    const page = await questions({ page: 1, page_size: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect((await questions({ page: 2, page_size: 1 })).items[0].id).not.toBe(
      page.items[0].id,
    );
  });
});

describe("attempts, policy inheritance and manual scheduling", () => {
  it("persists an answer without silently choosing a review interval", async () => {
    const q = await save();
    const a = await answer(q);
    expect(a.is_correct).toBe(true);
    expect(a.interval_snapshot).toBeNull();
    expect(
      (await rpc<Question>("question_get", { p_id: q.id })).next_review_at,
    ).toBeNull();
    const hist = await rpc<Page<Attempt>>("history_list");
    expect(hist.total).toBe(1);
    expect(hist.items[0].answer).toBe("B");
  });
  it("makes response retries idempotent and rejects request IDs reused with different content", async () => {
    const q = await save();
    const request = randomUUID();
    const a = await answer(q, "B", request);
    expect((await answer(q, "B", request)).id).toBe(a.id);
    await expect(answer(q, "A", request)).rejects.toThrow(/reutilizado/);
    expect(
      (await rpc<Question>("question_get", { p_id: q.id })).attempt_count,
    ).toBe(1);
  });
  it("preserves answer and statement snapshots after editing question content", async () => {
    const q = await save();
    await answer(q);
    await save(
      fixture({ statement: "<p>Enunciado alterado</p>", correct_answer: "A" }),
      q.id,
    );
    const hist = await rpc<Page<Attempt>>("history_list");
    expect(hist.items[0].correct_answer).toBe("B");
    expect(hist.items[0].statement_snapshot).toBe(q.statement);
    expect(hist.items[0].is_correct).toBe(true);
  });
  it("resolves question > notebook > project > global and rejects unrelated study context", async () => {
    const p = await catalog("project", "TRT4");
    const n = await catalog("notebook", "AFO", p.id);
    const other = await catalog("notebook", "Outro");
    const q = await save(fixture({ catalog_ids: [n.id] }));
    const global = await policy();
    const resolve = () =>
      rpc<Policy>("policy_resolve", {
        p_question_id: q.id,
        p_context: { notebook_id: n.id },
      });
    expect((await resolve()).id).toBe(global.id);
    const project = await policy("project", p.id);
    expect((await resolve()).id).toBe(project.id);
    const notebook = await policy("notebook", n.id);
    expect((await resolve()).id).toBe(notebook.id);
    const question = await policy("question", q.id);
    expect((await resolve()).id).toBe(question.id);
    await rpc("policy_delete", { p_id: question.id });
    expect((await resolve()).id).toBe(notebook.id);
    await expect(
      rpc("policy_resolve", {
        p_question_id: q.id,
        p_context: { notebook_id: other.id },
      }),
    ).rejects.toThrow();
  });
  it("adds exactly elapsed seconds and retains schedule/snapshot when configuration changes or is deleted", async () => {
    const q = await save();
    const p = await policy("global", null, 10);
    const a = await answer(q);
    const request = randomUUID();
    const event = await schedule(a, p, request);
    expect(Date.parse(event.next_review_at!) - Date.parse(a.answered_at)).toBe(
      10 * 86400000,
    );
    expect((await schedule(a, p, request)).id).toBe(event.id);
    await policy("global", null, 60, "day", p.id);
    const unchanged = await rpc<Question>("question_get", { p_id: q.id });
    expect(unchanged.next_review_at).toBe(event.next_review_at);
    const hist = await rpc<Page<Attempt>>("history_list");
    expect(hist.items[0].interval_snapshot?.value).toBe(10);
    await rpc("policy_delete", { p_id: p.id });
    expect(
      (await rpc<Question>("question_get", { p_id: q.id })).next_review_at,
    ).toBe(event.next_review_at);
  });
  it("supports minute and hour intervals and rejects stale attempts from another session", async () => {
    const q = await save();
    let p = await policy("global", null, 10, "minute");
    const stale = await answer(q);
    const fresh = await answer(q);
    await expect(schedule(stale, p)).rejects.toThrow(/outra sessão/);
    const e = await schedule(fresh, p);
    expect(Date.parse(e.next_review_at!) - Date.parse(fresh.answered_at)).toBe(
      600000,
    );
    p = await policy("global", null, 8, "hour", p.id);
    const a = await answer(q);
    const next = await schedule(a, p);
    expect(Date.parse(next.next_review_at!) - Date.parse(a.answered_at)).toBe(
      28800000,
    );
  });
  it("requires the selected interval to belong to the effective active policy", async () => {
    const q = await save();
    const p = await policy();
    await policy("question", q.id, 1);
    await expect(schedule(await answer(q), p)).rejects.toThrow(/Intervalo/);
  });
  it("audits rescheduling, suspension, reactivation and removal without deleting attempts", async () => {
    const q = await save();
    const p = await policy();
    await schedule(await answer(q), p);
    let current = await rpc<Question>("question_get", { p_id: q.id });
    for (const action of ["reschedule", "suspend", "activate", "remove"]) {
      await rpc("review_manage", {
        p_question_id: q.id,
        p_action: action,
        p_next_review_at:
          action === "reschedule" ? "2020-01-01T00:00:00Z" : null,
        p_expected_version: current.schedule_version,
        p_request_id: randomUUID(),
      });
      current = await rpc<Question>("question_get", { p_id: q.id });
      expect((await questions({ mode: "due" })).total).toBe(
        ["reschedule", "activate"].includes(action) ? 1 : 0,
      );
    }
    expect(current.next_review_at).toBeNull();
    expect((await rpc<Page<Attempt>>("history_list")).total).toBe(1);
    expect(
      (await db.query("select * from public.review_events")).rows,
    ).toHaveLength(5);
  });
  it("builds error views and dashboard from persisted attempts", async () => {
    const q = await save();
    await answer(q, "A");
    expect((await questions({ mode: "errors" })).total).toBe(1);
    await answer(q, "A");
    expect((await questions({ mode: "recurring" })).total).toBe(1);
    await answer(q, "B");
    expect((await questions({ mode: "recovered" })).total).toBe(1);
    const metrics = await rpc<Dashboard>("dashboard", {
      p_filters: {},
      p_timezone: "America/Sao_Paulo",
    });
    expect(metrics.today.answered).toBe(3);
    expect(metrics.today.correct).toBe(1);
    expect(metrics.today.incorrect).toBe(2);
    expect(metrics.today.elapsed_ms).toBe(15000);
  });
});

describe("transactional import and export", () => {
  const newHash = () => createHash("sha256").update(randomUUID()).digest("hex");
  const commit = (
    rows: unknown[],
    hash = newHash(),
    duplicate = "skip",
    request = randomUUID(),
  ) =>
    rpc<ImportResult>("import_commit", {
      p_rows: rows,
      p_file_name: "teste.json",
      p_file_hash: hash,
      p_duplicate_policy: duplicate,
      p_request_id: request,
    });
  it("imports valid items while isolating row errors", async () => {
    const result = await commit([
      fixture(),
      fixture({ external_id: "bad", correct_answer: "Z" }),
      fixture({ external_id: "124" }),
    ]);
    expect(result.report.received).toBe(3);
    expect(result.report.inserted).toBe(2);
    expect(result.report.errors).toBe(1);
    expect(result.items.find((i) => i.status === "error")?.index).toBe(2);
    expect((await questions()).total).toBe(2);
  });
  it("replays the same file result without duplicating ID-less questions", async () => {
    const hash = newHash();
    const first = await commit([fixture({ external_id: null })], hash);
    const retry = await commit([fixture({ external_id: null })], hash);
    expect(retry.report.id).toBe(first.report.id);
    expect((await questions()).total).toBe(1);
  });
  it("supports skip/update/cancel duplicate policies and preserves old attempts", async () => {
    const q = await save();
    await answer(q);
    const skipped = await commit([fixture()]);
    expect(skipped.report.skipped).toBe(1);
    const updated = await commit(
      [fixture({ statement: "<p>Atualizado</p>", correct_answer: "A" })],
      newHash(),
      "update",
    );
    expect(updated.report.updated).toBe(1);
    expect(
      (await rpc<Page<Attempt>>("history_list")).items[0].correct_answer,
    ).toBe("B");
    await expect(
      commit([fixture({ external_id: "new" }), fixture()], newHash(), "cancel"),
    ).rejects.toThrow();
    expect((await questions()).total).toBe(1);
  });
  it("flags exact and possible duplicates but does not merge by fingerprint", async () => {
    await save();
    const result = await rpc<
      { index: number; exact: boolean; possible: boolean }[]
    >("import_duplicates", {
      p_rows: [fixture(), fixture({ external_id: null })],
    });
    expect(result.some((row) => row.exact)).toBe(true);
    expect(result.some((row) => row.possible)).toBe(true);
  });
  it("exports only own data from a fixed table allowlist", async () => {
    await save();
    const own = await rpc<unknown[]>("export_page", { p_table: "questions" });
    expect(own).toHaveLength(1);
    await expect(
      rpc("export_page", { p_table: "auth.users" }),
    ).rejects.toThrow();
    await role(bob);
    expect(await rpc("export_page", { p_table: "questions" })).toEqual([]);
    expect(await rpc("import_list")).toEqual([]);
  });
});
