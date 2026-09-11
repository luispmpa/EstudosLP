import { supabase } from "./supabase";
import { sanitizeHtml } from "../domain/content";
import type {
  Attempt,
  Catalog,
  Dashboard,
  DuplicatePolicy,
  Filters,
  HistoryFilters,
  ImportReport,
  ImportResult,
  Page,
  Policy,
  Question,
  QuestionInput,
  ReviewEvent,
  StudyContext,
} from "../domain/types";

async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase)
    throw new Error(
      "O banco de dados ainda não foi configurado. Consulte as instruções de instalação.",
    );
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const messages: Record<string, string> = {
      "42501":
        "Você não tem permissão para acessar este registro. Entre novamente e tente outra vez.",
      "23505":
        "Já existe um registro com essa identificação. Revise a origem e o ID externo.",
      "23503":
        "Este registro está vinculado a outros dados. Arquive-o para preservar o histórico.",
      "40001":
        "Esta revisão mudou em outra sessão. Atualize a questão antes de agendar novamente.",
    };
    throw new Error(messages[error.code] ?? error.message);
  }
  return data as T;
}

function safeQuestion(input: QuestionInput): QuestionInput {
  return {
    ...input,
    statement: sanitizeHtml(input.statement),
    general_explanation: sanitizeHtml(input.general_explanation ?? ""),
    // This field intentionally stays intact: it is rendered in an iframe with an
    // empty sandbox attribute, never as HTML in the application document.
    visual_explanation_html: input.visual_explanation_html ?? "",
    visual_explanation_height: input.visual_explanation_height ?? 720,
    notes: sanitizeHtml(input.notes ?? ""),
    alternatives: input.alternatives.map((a) => ({
      ...a,
      text: sanitizeHtml(a.text),
      explanation: sanitizeHtml(a.explanation ?? ""),
    })),
  };
}
const pageFilters = <T extends Filters>(filters: T): T => ({
  ...filters,
  page: Math.max(1, filters.page ?? 1),
  page_size: Math.min(100, Math.max(1, filters.page_size ?? 20)),
});
export interface DuplicateMatch {
  index: number;
  question_id: string;
  exact: boolean;
  possible: boolean;
  existing?: QuestionInput;
  possible_ids?: string[];
}

export const api = {
  catalogs: () => rpc<Catalog[]>("catalog_list"),
  saveCatalog: (data: Partial<Catalog> & Pick<Catalog, "kind" | "name">) =>
    rpc<Catalog>("catalog_save", { p_data: data }),
  archiveCatalog: (id: string, archived = true) =>
    rpc<void>("catalog_archive", { p_id: id, p_archived: archived }),
  deleteCatalog: (id: string) => rpc<void>("catalog_delete", { p_id: id }),
  questions: (filters: Filters = {}) =>
    rpc<Page<Question>>("question_list", { p_filters: pageFilters(filters) }),
  question: (id: string) => rpc<Question>("question_get", { p_id: id }),
  saveQuestion: (input: QuestionInput, id?: string) =>
    rpc<Question>("question_save", {
      p_data: safeQuestion(input),
      p_id: id ?? null,
    }),
  updateQuestion: (
    id: string,
    patch: { favorite?: boolean; status?: "active" | "archived" },
  ) => rpc<Question>("question_patch", { p_id: id, p_patch: patch }),
  deleteQuestions: (ids: string[]) =>
    rpc<{ deleted: number }>("question_delete_many", { p_ids: ids }),
  policies: () => rpc<Policy[]>("policy_list"),
  savePolicy: (data: Omit<Policy, "id"> & { id?: string }) =>
    rpc<Policy>("policy_save", { p_data: data }),
  deletePolicy: (id: string) => rpc<void>("policy_delete", { p_id: id }),
  resolvePolicy: (questionId: string, context: StudyContext = {}) =>
    rpc<Policy | null>("policy_resolve", {
      p_question_id: questionId,
      p_context: context,
    }),
  answer: (
    questionId: string,
    answer: string,
    elapsedMs: number,
    context: StudyContext = {},
    requestId = crypto.randomUUID(),
  ) =>
    rpc<Attempt>("answer_question", {
      p_question_id: questionId,
      p_answer: answer,
      p_elapsed_ms: Math.round(elapsedMs),
      p_context: context,
      p_request_id: requestId,
    }),
  schedule: (
    attemptId: string,
    intervalId: string,
    expectedVersion: number,
    requestId = crypto.randomUUID(),
  ) =>
    rpc<ReviewEvent>("schedule_attempt", {
      p_attempt_id: attemptId,
      p_interval_id: intervalId,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
    }),
  manageReview: (
    questionId: string,
    action: "reschedule" | "suspend" | "activate" | "remove",
    nextReviewAt: string | null,
    expectedVersion: number,
    requestId = crypto.randomUUID(),
  ) =>
    rpc<ReviewEvent>("review_manage", {
      p_question_id: questionId,
      p_action: action,
      p_next_review_at: nextReviewAt,
      p_expected_version: expectedVersion,
      p_request_id: requestId,
    }),
  history: (filters: HistoryFilters = {}) =>
    rpc<Page<Attempt>>("history_list", {
      p_filters: {
        ...pageFilters(filters),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }),
  dashboard: (
    filters: Filters = {},
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) =>
    rpc<Dashboard>("dashboard", { p_filters: filters, p_timezone: timezone }),
  async duplicates(rows: QuestionInput[]): Promise<DuplicateMatch[]> {
    const matches = await rpc<DuplicateMatch[]>("import_duplicates", {
      p_rows: rows.map(safeQuestion),
    });
    return matches
      .filter((match) => match.exact || match.possible)
      .map((match) => ({
        ...match,
        question_id: match.question_id || match.possible_ids?.[0] || "",
      }));
  },
  importQuestions: (
    rows: QuestionInput[],
    fileName: string,
    fileHash: string,
    policy: DuplicatePolicy,
    requestId = crypto.randomUUID(),
  ) =>
    rpc<ImportResult>("import_commit", {
      p_rows: rows.map(safeQuestion),
      p_file_name: fileName,
      p_file_hash: fileHash,
      p_duplicate_policy: policy,
      p_request_id: requestId,
    }),
  imports: () => rpc<ImportReport[]>("import_list"),
  async exportData() {
    const tables = [
      "catalogs",
      "questions",
      "question_alternatives",
      "question_catalogs",
      "review_policies",
      "review_policy_intervals",
      "attempts",
      "review_events",
      "review_schedules",
      "question_statistics",
      "imports",
      "import_items",
    ];
    const data: Record<string, unknown[]> = {};
    for (const table of tables) {
      data[table] = [];
      for (let offset = 0; ; offset += 500) {
        const rows = await rpc<unknown[]>("export_page", {
          p_table: table,
          p_offset: offset,
          p_limit: 500,
        });
        data[table].push(...rows);
        if (rows.length < 500) break;
      }
    }
    return {
      export_version: "1.0",
      exported_at: new Date().toISOString(),
      data,
    };
  },
};
