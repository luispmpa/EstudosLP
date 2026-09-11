import Papa from "papaparse";
import { z } from "zod";
import { fingerprint, identityKey, plainText, sanitizeHtml } from "./content";
import type { QuestionInput } from "./types";

export type ImportFormat = "auto" | "json" | "csv" | "text" | "html";
export interface ImportPreviewRow {
  index: number;
  question?: QuestionInput;
  errors: string[];
  warnings: string[];
}

const richText = z.string().max(2_000_000);
const visualHtml = z.string().max(200_000);
const optionalLabel = z.string().max(180).optional();
const common = {
  external_id: z.string().min(1).max(160).nullable().optional(),
  source: z.string().min(1).max(160),
  statement: richText.min(1),
  general_explanation: richText,
  visual_explanation_html: visualHtml.optional(),
  visual_explanation_height: z.number().int().min(240).max(2000).optional(),
  year: z.number().int().min(1900).max(2200).nullable().optional(),
  level: z.string().max(100).nullable().optional(),
  difficulty: z.string().max(100).nullable().optional(),
  source_url: z.string().max(2048).nullable().optional(),
  notes: richText.optional(),
  catalog_ids: z.array(z.string().uuid()).max(160).optional(),
  board: optionalLabel,
  organization: optionalLabel,
  position: optionalLabel,
  subject: optionalLabel,
  topic: optionalLabel,
  subtopic: optionalLabel,
  tags: z.array(z.string().min(1).max(180)).max(160).optional(),
  projects: z.array(z.string().min(1).max(180)).max(160).optional(),
  notebooks: z.array(z.string().min(1).max(180)).max(160).optional(),
};
const alternative = z.strictObject({
  key: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
  text: richText.min(1),
  explanation: richText,
});
const trueFalseAlternative = alternative.extend({
  key: z.enum(["TRUE", "FALSE"]),
});

/** Structural schema is shared with the published JSON Schema. Cross-field rules live in validateQuestion. */
export const QuestionImportSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...common,
    type: z.literal("multiple_choice"),
    alternatives: z.array(alternative).min(2).max(26),
    correct_answer: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
  }),
  z.strictObject({
    ...common,
    type: z.literal("true_false"),
    alternatives: z.array(trueFalseAlternative).length(2),
    correct_answer: z.enum(["TRUE", "FALSE"]),
  }),
]);
export const ImportDocumentSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  questions: z.array(QuestionImportSchema).max(50_000),
});
export function importJsonSchema() {
  return {
    ...z.toJSONSchema(ImportDocumentSchema, { target: "draft-2020-12" }),
    $id: "https://estudoslp.app/schemas/import-v1.schema.json",
    title: "EstudosLP — importação de questões v1.0",
    description:
      "Validação estrutural. Também aplicar as regras semânticas documentadas: chaves únicas, gabarito existente, conteúdo visível, URL http(s), identidade e sanitização.",
  };
}

function issueMessages(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join(".") || "registro"}: ${issue.message}`,
  );
}

export function validateQuestion(
  input: unknown,
): Omit<ImportPreviewRow, "index"> {
  const parsed = QuestionImportSchema.safeParse(input);
  if (!parsed.success)
    return { errors: issueMessages(parsed.error), warnings: [] };
  const question: QuestionInput = structuredClone(parsed.data);
  const errors: string[] = [],
    warnings: string[] = [];
  question.source = question.source.trim();
  if (!question.source) errors.push("source: informe uma fonte não vazia.");
  if (question.external_id) question.external_id = question.external_id.trim();
  if (question.external_id === "")
    errors.push("external_id: não pode conter apenas espaços.");
  if (!question.external_id)
    warnings.push(
      "Sem ID externo: possíveis duplicatas serão sinalizadas pelo conteúdo; não há identidade externa para atualização.",
    );
  const keys = question.alternatives.map((a) => a.key);
  if (new Set(keys).size !== keys.length)
    errors.push("alternatives: existem chaves de alternativas repetidas.");
  if (!keys.includes(question.correct_answer))
    errors.push(
      "correct_answer: o gabarito deve ser exatamente a chave de uma alternativa.",
    );
  if (
    question.type === "true_false" &&
    !(keys.includes("TRUE") && keys.includes("FALSE"))
  )
    errors.push(
      "alternatives: Certo/Errado exige exatamente as chaves TRUE e FALSE.",
    );
  if (question.source_url) {
    try {
      if (!["https:", "http:"].includes(new URL(question.source_url).protocol))
        throw new Error();
    } catch {
      errors.push("source_url: use uma URL absoluta http ou https.");
    }
  }
  const clean = (value: string, field: string, required = false) => {
    const safe = sanitizeHtml(value);
    if (safe !== value)
      warnings.push(
        `${field}: HTML normalizado e conteúdo não permitido removido quando presente.`,
      );
    if (required && !plainText(safe))
      errors.push(`${field}: precisa conter texto visível após a sanitização.`);
    return safe;
  };
  question.statement = clean(question.statement, "statement", true);
  question.general_explanation = clean(
    question.general_explanation,
    "general_explanation",
  );
  if (!plainText(question.general_explanation))
    warnings.push("Sem explicação geral.");
  if (question.visual_explanation_html !== undefined) {
    if (
      /<\s*\/?\s*(?:script|iframe|object|embed|base|link|meta|form|img)\b/i.test(
        question.visual_explanation_html,
      )
    )
      errors.push(
        "visual_explanation_html: use HTML e CSS autocontidos; scripts, imagens, incorporações, formulários e recursos externos não são aceitos.",
      );
    if (/(?:@import|url\s*\()/i.test(question.visual_explanation_html))
      errors.push(
        "visual_explanation_html: CSS não pode carregar recursos externos.",
      );
    if (/\son[a-z]+\s*=/i.test(question.visual_explanation_html))
      errors.push(
        "visual_explanation_html: atributos de evento JavaScript não são aceitos.",
      );
  }
  if (question.notes !== undefined)
    question.notes = clean(question.notes, "notes");
  question.alternatives = question.alternatives.map((a, i) => ({
    ...a,
    text: clean(a.text, `alternatives.${i}.text`, true),
    explanation: clean(a.explanation, `alternatives.${i}.explanation`),
  }));
  return { ...(errors.length ? {} : { question }), errors, warnings };
}

const aliases: Record<string, string> = {
  ID: "external_id",
  ID_EXTERNO: "external_id",
  EXTERNAL_ID: "external_id",
  FONTE: "source",
  ORIGEM: "source",
  SOURCE: "source",
  TIPO: "type",
  TYPE: "type",
  ENUNCIADO: "statement",
  STATEMENT: "statement",
  GABARITO: "correct_answer",
  CORRECT_ANSWER: "correct_answer",
  EXPLICACAO_GERAL: "general_explanation",
  GENERAL_EXPLANATION: "general_explanation",
  HTML_VISUAL_VERSO: "visual_explanation_html",
  VISUAL_EXPLANATION_HTML: "visual_explanation_html",
  ALTURA_HTML_VISUAL: "visual_explanation_height",
  VISUAL_EXPLANATION_HEIGHT: "visual_explanation_height",
  BANCA: "board",
  BOARD: "board",
  ORGAO: "organization",
  ORGANIZATION: "organization",
  CARGO: "position",
  POSITION: "position",
  MATERIA: "subject",
  SUBJECT: "subject",
  ASSUNTO: "topic",
  TOPIC: "topic",
  SUBASSUNTO: "subtopic",
  SUBTOPIC: "subtopic",
  ANO: "year",
  YEAR: "year",
  NIVEL: "level",
  LEVEL: "level",
  DIFICULDADE: "difficulty",
  DIFFICULTY: "difficulty",
  TAGS: "tags",
  PROJETO: "projects",
  PROJETOS: "projects",
  PROJECTS: "projects",
  CADERNO: "notebooks",
  CADERNOS: "notebooks",
  NOTEBOOKS: "notebooks",
  URL: "source_url",
  URL_FONTE: "source_url",
  SOURCE_URL: "source_url",
  OBSERVACOES: "notes",
  NOTES: "notes",
  ALTERNATIVES: "alternatives",
  ALTERNATIVAS: "alternatives",
  CATALOG_IDS: "catalog_ids",
};
const normalizeLabel = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
function canonicalField(label: string): string | null {
  const normalized = normalizeLabel(label);
  if (aliases[normalized]) return aliases[normalized];
  const alternative = normalized.match(
    /^(?:(?:ALTERNATIVA|ALTERNATIVE)_)?([A-Z]|[0-9]{1,2}|TRUE|FALSE)$/,
  );
  if (alternative) return `alternative_${alternative[1]}`;
  const explanation = normalized.match(
    /^(?:EXPLICACAO|EXPLANATION)(?:_DA)?(?:_ALTERNATIVA)?_([A-Z]|[0-9]{1,2}|TRUE|FALSE)$/,
  );
  return explanation ? `explanation_${explanation[1]}` : null;
}

function objectFromFields(
  fields: Record<string, string>,
  errors: string[],
  warnings: string[],
): unknown {
  const data: Record<string, unknown> = { general_explanation: "" };
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("alternative_") || key.startsWith("explanation_"))
      continue;
    if (key === "year" || key === "visual_explanation_height") {
      if (value.trim())
        data[key] =
          key === "year" && !/^\d{4}$/.test(value.trim())
            ? value
            : Number(value);
    } else if (["tags", "projects", "notebooks", "catalog_ids"].includes(key)) {
      if (value.trim().startsWith("[")) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          errors.push(`${key}: coleção JSON inválida.`);
        }
      } else
        data[key] = value
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean);
    } else if (key === "alternatives") {
      try {
        data[key] = JSON.parse(value);
      } catch {
        errors.push("alternatives: coleção JSON inválida.");
      }
    } else if (
      value !== "" ||
      [
        "statement",
        "general_explanation",
        "visual_explanation_html",
        "source",
      ].includes(key)
    )
      data[key] = value.trim();
  }
  const alternatives = Object.entries(fields)
    .filter(([key]) => key.startsWith("alternative_"))
    .map(([key, value]) => {
      const alternativeKey = key.slice("alternative_".length);
      return {
        key: alternativeKey,
        text: value.trim(),
        explanation: fields[`explanation_${alternativeKey}`]?.trim() ?? "",
      };
    });
  if (data.alternatives && alternatives.length)
    errors.push(
      "alternatives: não combine coleção JSON com colunas de alternativas.",
    );
  if (!data.alternatives) data.alternatives = alternatives;
  for (const key of Object.keys(fields).filter((key) =>
    key.startsWith("explanation_"),
  )) {
    if (!fields[`alternative_${key.slice("explanation_".length)}`])
      errors.push(`${key}: explicação sem alternativa correspondente.`);
  }
  if (typeof data.type === "string") {
    const type = normalizeLabel(data.type);
    if (["MULTIPLE_CHOICE", "MULTIPLA_ESCOLHA"].includes(type))
      data.type = "multiple_choice";
    else if (["TRUE_FALSE", "CERTO_ERRADO", "CERTO_OU_ERRADO"].includes(type))
      data.type = "true_false";
  }
  if (!data.type && alternatives.length >= 2) {
    data.type =
      alternatives.length === 2 &&
      alternatives.some((a) => a.key === "TRUE") &&
      alternatives.some((a) => a.key === "FALSE")
        ? "true_false"
        : "multiple_choice";
    warnings.push(
      `Tipo inferido pelas alternativas: ${data.type}. Confira a prévia.`,
    );
  }
  return data;
}

function validateRow(
  index: number,
  data: unknown,
  errors: string[] = [],
  warnings: string[] = [],
): ImportPreviewRow {
  const validated = validateQuestion(data);
  const mergedErrors = [...errors, ...validated.errors];
  return {
    index,
    ...(mergedErrors.length ? {} : { question: validated.question }),
    errors: mergedErrors,
    warnings: [...warnings, ...validated.warnings],
  };
}

function parseJson(content: string): ImportPreviewRow[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    return [
      {
        index: 1,
        errors: [
          `JSON inválido: ${error instanceof Error ? error.message : "erro de sintaxe"}`,
        ],
        warnings: [],
      },
    ];
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return [
      {
        index: 1,
        errors: [
          'Use um objeto com schema_version: "1.0" e questions: [...]. Arrays isolados não são aceitos.',
        ],
        warnings: [],
      },
    ];
  const envelope = z
    .strictObject({
      schema_version: z.literal("1.0"),
      questions: z.array(z.unknown()).max(50_000),
    })
    .safeParse(data);
  if (!envelope.success)
    return [{ index: 1, errors: issueMessages(envelope.error), warnings: [] }];
  return envelope.data.questions.map((question, index) =>
    validateRow(index + 1, question),
  );
}

export function getCsvHeaders(content: string): string[] {
  return (
    Papa.parse<Record<string, string>>(content.replace(/^\uFEFF/, ""), {
      header: true,
      skipEmptyLines: "greedy",
      preview: 1,
    }).meta.fields ?? []
  );
}

function parseCsv(
  content: string,
  mapping?: Record<string, string>,
): ImportPreviewRow[] {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headerErrors: string[] = [];
  const renamedHeaders = (
    parsed.meta as Papa.ParseMeta & { renamedHeaders?: Record<string, string> }
  ).renamedHeaders;
  if (Object.keys(renamedHeaders ?? {}).length)
    headerErrors.push("Cabeçalhos CSV duplicados; corrija antes de importar.");
  const rows = parsed.data.map((record, index) => {
    const errors = [
      ...headerErrors,
      ...parsed.errors
        .filter((error) => error.row === index)
        .map((error) => `CSV: ${error.message}`),
    ];
    const warnings: string[] = [],
      fields: Record<string, string> = {};
    for (const [header, value] of Object.entries(record)) {
      const field =
        mapping && Object.prototype.hasOwnProperty.call(mapping, header)
          ? mapping[header]
          : canonicalField(header);
      if (!field || field === "ignore") {
        if (String(value).trim())
          warnings.push(`Coluna "${header}" ignorada; mapeie se necessário.`);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(fields, field))
        errors.push(`Mais de uma coluna foi mapeada para ${field}.`);
      else fields[field] = String(value);
    }
    return validateRow(
      index + 2,
      objectFromFields(fields, errors, warnings),
      errors,
      warnings,
    );
  });
  const globalErrors = parsed.errors
    .filter((error) => error.row === undefined)
    .map((error) => `CSV: ${error.message}`);
  if (globalErrors.length)
    rows.unshift({ index: 1, errors: globalErrors, warnings: [] });
  return rows;
}

function parseText(content: string): ImportPreviewRow[] {
  return content
    .split(/^\s*-{3,}\s*$/m)
    .filter((block) => block.trim())
    .map((block, index) => {
      const fields: Record<string, string> = {},
        errors: string[] = [],
        warnings: string[] = [];
      let activeField: string | null = null;
      for (const line of block.split(/\r?\n/)) {
        const label = line.match(/^\s*([^:\n]{1,60}):\s*(.*)$/);
        const key = label ? canonicalField(label[1]) : null;
        if (key && label) {
          if (Object.prototype.hasOwnProperty.call(fields, key)) {
            errors.push(`Campo repetido: ${label[1].trim()}.`);
            activeField = null;
          } else {
            fields[key] = label[2];
            activeField = key;
          }
        } else if (label && /^[\p{Lu}\d_\s-]+$/u.test(label[1].trim())) {
          errors.push(
            `Rótulo não reconhecido: ${label[1].trim()}. Revise para evitar ambiguidade.`,
          );
          activeField = null;
        } else if (activeField) fields[activeField] += `\n${line}`;
        else if (line.trim())
          errors.push(`Texto fora de um campo: ${line.trim().slice(0, 80)}.`);
      }
      return validateRow(
        index + 1,
        objectFromFields(fields, errors, warnings),
        errors,
        warnings,
      );
    });
}

function parseHtml(content: string): ImportPreviewRow[] {
  const document = new DOMParser().parseFromString(content, "text/html");
  const articles = [...document.querySelectorAll("article[data-question]")];
  if (!articles.length)
    return [
      {
        index: 1,
        errors: [
          "HTML estruturado exige <article data-question>. HTML arbitrário de sites não é interpretado.",
        ],
        warnings: [],
      },
    ];
  return articles.map((article, index) => {
    const errors: string[] = [],
      warnings: string[] = [],
      fields: Record<string, string> = {};
    for (const attribute of [...article.attributes]) {
      if (
        !attribute.name.startsWith("data-") ||
        attribute.name === "data-question"
      )
        continue;
      const key = canonicalField(attribute.name.slice(5));
      if (key) fields[key] = attribute.value;
      else warnings.push(`Atributo ${attribute.name} ignorado.`);
    }
    article.querySelectorAll(":scope > [data-field]").forEach((element) => {
      const key = canonicalField(element.getAttribute("data-field") ?? "");
      if (!key) {
        errors.push(
          `Campo HTML desconhecido: ${element.getAttribute("data-field")}.`,
        );
        return;
      }
      if (Object.prototype.hasOwnProperty.call(fields, key))
        errors.push(`Campo HTML repetido: ${key}.`);
      else
        fields[key] = [
          "statement",
          "general_explanation",
          "notes",
          "visual_explanation_html",
        ].includes(key)
          ? element.innerHTML
          : (element.textContent ?? "");
    });
    article
      .querySelectorAll(":scope > [data-alternative]")
      .forEach((element) => {
        const key = element.getAttribute("data-alternative") ?? "";
        if (Object.prototype.hasOwnProperty.call(fields, `alternative_${key}`))
          errors.push(`Alternativa HTML repetida: ${key}.`);
        const text = element.querySelectorAll(':scope > [data-field="text"]');
        const explanation = element.querySelectorAll(
          ':scope > [data-field="explanation"]',
        );
        if (text.length !== 1 || explanation.length > 1)
          errors.push(
            `Alternativa ${key}: exige um campo text e no máximo um explanation.`,
          );
        fields[`alternative_${key}`] = text[0]?.innerHTML ?? "";
        fields[`explanation_${key}`] = explanation[0]?.innerHTML ?? "";
      });
    if (article.querySelector("article[data-question]"))
      errors.push("Questões HTML não podem ser aninhadas.");
    return validateRow(
      index + 1,
      objectFromFields(fields, errors, warnings),
      errors,
      warnings,
    );
  });
}

export function detectImportFormat(
  content: string,
): Exclude<ImportFormat, "auto"> {
  const value = content.replace(/^\uFEFF/, "").trim();
  if (/^[\[{]/.test(value)) return "json";
  if (
    /^(<!doctype\s+html|<html\b|<article\b)/i.test(value) ||
    /<article\s+[^>]*data-question/i.test(value)
  )
    return "html";
  if (
    /^(?:ID|FONTE|SOURCE|TIPO|TYPE|BANCA|ENUNCIADO|EXTERNAL_ID)\s*:/im.test(
      value,
    )
  )
    return "text";
  return "csv";
}

/** Parsing never writes data. Invalid rows survive in the preview without breaking valid siblings. */
export async function parseImport(
  content: string,
  format: ImportFormat = "auto",
  mapping?: Record<string, string>,
): Promise<ImportPreviewRow[]> {
  if (!content.trim())
    return [{ index: 1, errors: ["O arquivo está vazio."], warnings: [] }];
  if (content.length > 25_000_000)
    return [
      {
        index: 1,
        errors: ["Arquivo maior que 25 MB. Divida o lote em arquivos menores."],
        warnings: [],
      },
    ];
  const clean = content.replace(/^\uFEFF/, "");
  const selected = format === "auto" ? detectImportFormat(clean) : format;
  const rows =
    selected === "json"
      ? parseJson(clean)
      : selected === "csv"
        ? parseCsv(clean, mapping)
        : selected === "text"
          ? parseText(clean)
          : parseHtml(clean);
  if (!rows.length)
    return [
      { index: 1, errors: ["Nenhuma questão encontrada."], warnings: [] },
    ];
  if (rows.length > 50_000)
    return [
      {
        index: 1,
        errors: ["Limite de 50.000 registros por lote."],
        warnings: [],
      },
    ];
  const identities = new Map<string, number>(),
    hashes = new Map<string, number>();
  for (const row of rows) {
    if (!row.question) continue;
    const identity = identityKey(row.question);
    if (identity) {
      if (identities.has(identity))
        row.warnings.push(
          `Duplicata de fonte + ID externo no próprio arquivo, registro ${identities.get(identity)}. A política escolhida será aplicada na confirmação.`,
        );
      else identities.set(identity, row.index);
    }
    const hash = await fingerprint(row.question);
    if (hashes.has(hash))
      row.warnings.push(
        `Possível duplicata de conteúdo do registro ${hashes.get(hash)}. Aviso apenas; confira as questões.`,
      );
    else hashes.set(hash, row.index);
  }
  return rows;
}
