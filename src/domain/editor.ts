import type { QuestionInput } from "./types";

/** Remove server metadata before applying the strict, shared question contract. */
export function questionDraft(question: QuestionInput): QuestionInput {
  const keys: (keyof QuestionInput)[] = [
    "external_id",
    "source",
    "type",
    "statement",
    "alternatives",
    "correct_answer",
    "general_explanation",
    "year",
    "level",
    "difficulty",
    "source_url",
    "notes",
    "catalog_ids",
    "board",
    "organization",
    "position",
    "subject",
    "topic",
    "subtopic",
    "tags",
    "projects",
    "notebooks",
  ];
  return structuredClone(
    Object.fromEntries(
      keys
        .filter((key) => question[key] !== undefined)
        .map((key) => [key, question[key]]),
    ) as unknown as QuestionInput,
  );
}
