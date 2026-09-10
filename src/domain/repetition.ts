import type { Interval, IntervalUnit, Policy, StudyContext } from "./types";

const milliseconds: Record<IntervalUnit, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Days are exact elapsed 24-hour periods, stored as UTC instants, including across DST. */
export function addInterval(
  answeredAt: string | Date,
  interval: Pick<Interval, "value" | "unit">,
): string {
  const timestamp = new Date(answeredAt).getTime();
  if (!Number.isFinite(timestamp))
    throw new Error("Data/hora da resposta inválida.");
  if (
    !(interval.unit in milliseconds) ||
    !Number.isSafeInteger(interval.value) ||
    interval.value <= 0
  ) {
    throw new Error(
      "O intervalo precisa ser um inteiro positivo em minutos, horas ou dias.",
    );
  }
  const next = timestamp + interval.value * milliseconds[interval.unit];
  if (!Number.isSafeInteger(next) || Math.abs(next) > 8.64e15)
    throw new Error("Intervalo fora do limite de datas.");
  return new Date(next).toISOString();
}

/** Empty specific policies intentionally override their parents: no hidden fallback. */
export function resolvePolicy(
  policies: Policy[],
  questionId: string,
  context: StudyContext = {},
): Policy | null {
  const match = (scope: Policy["scope"], target: string | null | undefined) =>
    target === undefined
      ? undefined
      : policies.find((p) => p.scope === scope && p.target_id === target);
  return (
    match("question", questionId) ??
    match("notebook", context.notebook_id) ??
    match("project", context.project_id) ??
    match("global", null) ??
    null
  );
}

export function availableIntervals(
  policy: Policy | null | undefined,
): Interval[] {
  return [...(policy?.intervals ?? [])]
    .filter((interval) => interval.active)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function createReviewSnapshot(
  answeredAt: string | Date,
  selectedInterval: Interval,
): {
  answered_at: string;
  interval_snapshot: Interval;
  next_review_at: string;
} {
  if (!selectedInterval.active)
    throw new Error("Este botão de revisão está desativado.");
  return {
    answered_at: new Date(answeredAt).toISOString(),
    interval_snapshot: { ...selectedInterval },
    next_review_at: addInterval(answeredAt, selectedInterval),
  };
}

export function formatLocalDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
