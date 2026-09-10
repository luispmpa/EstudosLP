import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Study } from "../src/pages/Study";
import { ImportPage } from "../src/pages/ImportPage";
import { QuestionsPage } from "../src/pages/Questions";
import { api } from "../src/lib/api";
import { questionDraft } from "../src/domain/editor";
import { validateQuestion } from "../src/domain/import";
import type { Attempt, Policy, Question } from "../src/domain/types";

vi.mock("../src/lib/api", () => ({
  api: {
    questions: vi.fn(),
    resolvePolicy: vi.fn(),
    answer: vi.fn(),
    schedule: vi.fn(),
    imports: vi.fn(),
    duplicates: vi.fn(),
    importQuestions: vi.fn(),
    question: vi.fn(),
    deleteQuestions: vi.fn(),
  },
}));
vi.mock("../src/components/RichEditor", () => ({
  RichText: ({ html }: { html: string }) => (
    <div>{html.replace(/<[^>]*>/g, "")}</div>
  ),
  RichEditor: () => <textarea aria-label="Editor" />,
}));
const q: Question = {
  id: "00000000-0000-4000-8000-000000000001",
  source: "manual",
  external_id: null,
  type: "multiple_choice",
  statement: "Qual alternativa é correta?",
  alternatives: [
    {
      key: "A",
      text: "Alternativa primeira",
      explanation: "Explicação incorreta.",
    },
    {
      key: "B",
      text: "Alternativa segunda",
      explanation: "Explicação correta.",
    },
  ],
  correct_answer: "B",
  general_explanation: "Explicação geral.",
  favorite: false,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  next_review_at: null,
  review_status: null,
  attempt_count: 0,
  error_count: 0,
  last_correct: null,
  schedule_version: 0,
};
const p: Policy = {
  id: "policy",
  scope: "global",
  target_id: null,
  name: "Meus intervalos",
  intervals: [
    {
      id: "interval",
      label: "10 dias",
      value: 10,
      unit: "day",
      position: 0,
      active: true,
    },
  ],
};
const attempt: Attempt = {
  id: "attempt",
  question_id: q.id,
  answered_at: "2026-01-01T12:00:00Z",
  answer: "B",
  correct_answer: "B",
  is_correct: true,
  elapsed_ms: 1000,
  statement_snapshot: q.statement,
  context: {},
  interval_snapshot: null,
  next_review_at: null,
  schedule_version: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.questions).mockResolvedValue({ items: [q], total: 1 });
  vi.mocked(api.resolvePolicy).mockResolvedValue(p);
  vi.mocked(api.answer).mockResolvedValue(attempt);
  vi.mocked(api.schedule).mockResolvedValue({
    id: "event",
    schedule_version: 2,
    question_id: q.id,
    attempt_id: attempt.id,
    created_at: attempt.answered_at,
    action: "schedule",
    interval_snapshot: p.intervals[0],
    next_review_at: "2026-01-11T12:00:00Z",
  });
  vi.mocked(api.imports).mockResolvedValue([]);
  vi.mocked(api.duplicates).mockResolvedValue([]);
  vi.mocked(api.deleteQuestions).mockResolvedValue({ deleted: 1 });
});
afterEach(cleanup);
const study = () =>
  render(
    <Study
      filters={{}}
      catalogs={[]}
      onBack={() => {}}
      onHistory={() => {}}
      onSettings={() => {}}
      onRefresh={() => {}}
    />,
  );

describe("study interaction integrity", () => {
  it("requires a choice, shows all explanations, and schedules only after explicit interval selection", async () => {
    study();
    const respond = await screen.findByRole("button", { name: "Responder" });
    expect((respond as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Alternativa segunda/ }));
    fireEvent.click(respond);
    await screen.findByText("Você acertou. Bom trabalho!");
    expect(screen.getByText("Explicação incorreta.")).toBeTruthy();
    expect(screen.getByText("Explicação correta.")).toBeTruthy();
    expect(api.schedule).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /10 dias/ }));
    await screen.findByRole("status");
    expect(api.schedule).toHaveBeenCalledWith(
      "attempt",
      "interval",
      1,
      expect.any(String),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima questão" }));
    await screen.findByText("Sessão concluída");
  });
  it("retries the identical answer payload after a lost response", async () => {
    vi.mocked(api.answer)
      .mockRejectedValueOnce(new Error("Conexão interrompida"))
      .mockResolvedValueOnce(attempt);
    study();
    fireEvent.click(
      await screen.findByRole("radio", { name: /Alternativa segunda/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Conexão interrompida");
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Você acertou. Bom trabalho!");
    expect(vi.mocked(api.answer).mock.calls[1]).toEqual(
      vi.mocked(api.answer).mock.calls[0],
    );
  });
  it("does not answer when Enter is pressed without a choice or while typing", async () => {
    study();
    await screen.findByRole("button", { name: "Responder" });
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(api.answer).not.toHaveBeenCalled();
    const date = screen.getByLabelText("Data e hora da próxima revisão");
    fireEvent.keyDown(date, { key: "B" });
    expect(
      (screen.getByRole("button", { name: "Responder" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("uses a bounded study session instead of repeating the same first page forever", async () => {
    vi.mocked(api.questions).mockResolvedValue({ items: [q], total: 51 });
    study();
    fireEvent.click(
      await screen.findByRole("radio", { name: /Alternativa segunda/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    await screen.findByText("Você acertou. Bom trabalho!");
    fireEvent.click(screen.getByRole("button", { name: /10 dias/ }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Próxima questão" }));
    await screen.findByText("Sessão concluída");
    expect(api.questions).toHaveBeenCalledTimes(1);
  });
});

it("deletes only the checked questions after an explicit confirmation", async () => {
  render(
    <QuestionsPage
      catalogs={[]}
      onEdit={() => {}}
      onStudy={() => {}}
      onImport={() => {}}
      refresh={0}
    />,
  );
  fireEvent.click(
    await screen.findByRole("checkbox", { name: /Selecionar questão/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Excluir 1 questão" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Excluir 1 questão?" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Excluir permanentemente" }),
  );
  await waitFor(() =>
    expect(api.deleteQuestions).toHaveBeenCalledWith([q.id]),
  );
});

it("removes database metadata before editing a saved question", () => {
  const draft = questionDraft(q);
  expect("id" in draft).toBe(false);
  expect(validateQuestion(draft).errors).toEqual([]);
  expect(draft.external_id).toBeNull();
});
it("maps a one-based duplicate index back to the correct preview record", async () => {
  vi.mocked(api.duplicates).mockResolvedValue([
    { index: 1, question_id: q.id, exact: true, possible: false },
  ]);
  vi.mocked(api.question).mockResolvedValue(q);
  render(<ImportPage onImported={() => {}} />);
  fireEvent.change(screen.getByLabelText("Ou cole o conteúdo"), {
    target: {
      value: JSON.stringify({
        schema_version: "1.0",
        questions: [questionDraft(q)],
      }),
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validar lote" }));
  await screen.findByText("Já existente");
  expect(screen.getByText("#1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver diferenças" }));
  await screen.findByText("Questão salva");
  expect(api.question).toHaveBeenCalledWith(q.id);
  expect(api.importQuestions).not.toHaveBeenCalled();
});
