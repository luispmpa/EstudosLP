import { describe, expect, it } from "vitest";
import {
  addInterval,
  availableIntervals,
  createReviewSnapshot,
  formatLocalDateTime,
  resolvePolicy,
} from "../src/domain/repetition";
import type { Interval, Policy } from "../src/domain/types";

const interval = (value: number, unit: Interval["unit"] = "day"): Interval => ({
  id: "manual",
  label: `${value} ${unit}`,
  value,
  unit,
  position: 0,
  active: true,
});

describe("intervalos manuais A–D", () => {
  it("A: 01/01 + 10 dias = 11/01", () => {
    expect(addInterval("2026-01-01T12:00:00-03:00", interval(10))).toBe(
      "2026-01-11T15:00:00.000Z",
    );
  });
  it("B: 11/01 + 30 dias = 10/02, preservando revisão anterior", () => {
    const first = createReviewSnapshot("2026-01-01T15:00:00Z", interval(10));
    const second = createReviewSnapshot("2026-01-11T15:00:00Z", interval(30));
    expect(first.next_review_at).toBe("2026-01-11T15:00:00.000Z");
    expect(first.interval_snapshot.value).toBe(10);
    expect(second.next_review_at).toBe("2026-02-10T15:00:00.000Z");
  });
  it("C: editar 30→60 não altera snapshots nem datas já agendadas", () => {
    const configured = interval(30);
    const saved = createReviewSnapshot("2026-01-11T15:00:00Z", configured);
    configured.value = 60;
    configured.label = "60 dias";
    configured.active = false;
    expect(saved.interval_snapshot.value).toBe(30);
    expect(saved.interval_snapshot.active).toBe(true);
    expect(saved.next_review_at).toBe("2026-02-10T15:00:00.000Z");
  });
  it("D: reagendamento explícito produz novo evento e nova data", () => {
    const original = createReviewSnapshot("2026-01-11T15:00:00Z", interval(30));
    const rescheduled = createReviewSnapshot(
      "2026-01-12T15:00:00Z",
      interval(60),
    );
    expect(rescheduled.next_review_at).toBe("2026-03-13T15:00:00.000Z");
    expect(original.next_review_at).toBe("2026-02-10T15:00:00.000Z");
  });
  it("calcula minutos, horas, segundos e virada de data precisamente", () => {
    expect(
      addInterval("2026-01-01T23:59:45.123Z", interval(10, "minute")),
    ).toBe("2026-01-02T00:09:45.123Z");
    expect(addInterval("2026-01-01T23:59:45.123Z", interval(8, "hour"))).toBe(
      "2026-01-02T07:59:45.123Z",
    );
  });
  it("define um dia como 24h decorridas mesmo na mudança de horário de verão", () => {
    const answered = "2026-03-07T12:00:00-05:00";
    const next = addInterval(answered, interval(1));
    expect(new Date(next).getTime() - new Date(answered).getTime()).toBe(
      86_400_000,
    );
    expect(formatLocalDateTime(next, "America/New_York")).toContain("13:00");
    expect(
      formatLocalDateTime("2026-01-02T01:30:00Z", "America/Sao_Paulo"),
    ).toContain("01/01/2026");
    expect(
      formatLocalDateTime("2026-01-02T01:30:00Z", "America/Sao_Paulo"),
    ).toContain("22:30");
  });
  it("rejeita configuração inválida e botão inativo", () => {
    for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])
      expect(() =>
        addInterval("2026-01-01T00:00:00Z", interval(value)),
      ).toThrow();
    expect(() => addInterval("inválida", interval(1))).toThrow();
    expect(() =>
      createReviewSnapshot("2026-01-01T00:00:00Z", {
        ...interval(1),
        active: false,
      }),
    ).toThrow();
  });
});

describe("herança pelo contexto explícito", () => {
  const policies: Policy[] = [
    {
      id: "global",
      scope: "global",
      target_id: null,
      name: "Global",
      intervals: [interval(30)],
    },
    {
      id: "project",
      scope: "project",
      target_id: "p",
      name: "Projeto",
      intervals: [interval(10)],
    },
    {
      id: "notebook",
      scope: "notebook",
      target_id: "n",
      name: "Caderno",
      intervals: [interval(3)],
    },
    {
      id: "question",
      scope: "question",
      target_id: "q",
      name: "Questão",
      intervals: [],
    },
  ];
  it("usa questão > caderno > projeto > global, sem escolher um vínculo arbitrário", () => {
    expect(
      resolvePolicy(policies, "q", { project_id: "p", notebook_id: "n" })?.id,
    ).toBe("question");
    expect(
      resolvePolicy(policies, "other", { project_id: "p", notebook_id: "n" })
        ?.id,
    ).toBe("notebook");
    expect(resolvePolicy(policies, "other", { project_id: "p" })?.id).toBe(
      "project",
    );
    expect(resolvePolicy(policies, "other")?.id).toBe("global");
    expect(resolvePolicy([], "q")).toBeNull();
  });
  it("uma política específica vazia continua sendo a escolha; botões ordenados sem mutação", () => {
    expect(availableIntervals(resolvePolicy(policies, "q"))).toEqual([]);
    const policy: Policy = {
      ...policies[0],
      intervals: [
        { ...interval(3), position: 2 },
        { ...interval(1), position: 0 },
        { ...interval(5), active: false },
      ],
    };
    expect(availableIntervals(policy).map((i) => i.value)).toEqual([1, 3]);
    expect(policy.intervals[0].value).toBe(3);
  });
});
