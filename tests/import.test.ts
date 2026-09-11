import { webcrypto } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  detectImportFormat,
  getCsvHeaders,
  importJsonSchema,
  parseImport,
  validateQuestion,
} from "../src/domain/import";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
const question = {
  external_id: "123",
  source: "Exemplo",
  type: "multiple_choice",
  statement: "<p>Qual é a opção correta?</p>",
  alternatives: [
    { key: "A", text: "Ação", explanation: "Correta." },
    { key: "B", text: "Educação", explanation: "Incorreta." },
  ],
  correct_answer: "A",
  general_explanation: "Comentário geral.",
};
const payload = (...questions: unknown[]) =>
  JSON.stringify({ schema_version: "1.0", questions });
const fixture = (name: string) =>
  readFileSync(resolve("public/examples", name), "utf8");

describe("contrato JSON v1.0", () => {
  it("aceita múltipla escolha com número variável de alternativas e chave exata", async () => {
    const rows = await parseImport(
      payload(question, {
        ...question,
        external_id: "124",
        alternatives: [
          { key: "sim", text: "Sim", explanation: "" },
          { key: "nao", text: "Não", explanation: "" },
          { key: "outro", text: "Outro", explanation: "" },
        ],
        correct_answer: "nao",
      }),
    );
    expect(rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(rows[1].question?.alternatives).toHaveLength(3);
    expect(
      validateQuestion({ ...question, correct_answer: "a" }).errors.join(),
    ).toContain("gabarito");
  });
  it("não perde registros válidos de um lote parcialmente inválido", async () => {
    const rows = await parseImport(
      payload(
        question,
        { ...question, source: "", correct_answer: "Z" },
        { ...question, external_id: "125" },
      ),
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.question)).toHaveLength(2);
    expect(rows[1].index).toBe(2);
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });
  it("exige versão, coleção, campos conhecidos e IDs textuais", async () => {
    for (const content of [
      "[{}]",
      "{}",
      '{"schema_version":"2.0","questions":[]}',
      "{",
      payload({ ...question, external_id: 123 }),
      payload({ ...question, surprise: "x" }),
    ]) {
      expect(
        (await parseImport(content, "json"))[0].errors.length,
      ).toBeGreaterThan(0);
    }
  });
  it("rejeita chave duplicada, gabarito numérico, HTML sem texto e URL insegura", () => {
    for (const invalid of [
      {
        ...question,
        alternatives: [question.alternatives[0], question.alternatives[0]],
      },
      { ...question, correct_answer: 0 },
      { ...question, statement: "<script>alert(1)</script>" },
      { ...question, source_url: "javascript:alert(1)" },
    ])
      expect(validateQuestion(invalid).errors.length).toBeGreaterThan(0);
  });
  it("Certo/Errado aceita somente chaves TRUE/FALSE e gabarito string canônico", async () => {
    const tf = {
      ...question,
      type: "true_false",
      alternatives: [
        { key: "TRUE", text: "Certo", explanation: "Certo." },
        { key: "FALSE", text: "Errado", explanation: "Não." },
      ],
      correct_answer: "TRUE",
    };
    expect((await parseImport(payload(tf)))[0].question?.correct_answer).toBe(
      "TRUE",
    );
    for (const answer of [true, false, "C", "E", "Certo", "true", 1])
      expect(
        validateQuestion({ ...tf, correct_answer: answer }).errors.length,
      ).toBeGreaterThan(0);
    expect(
      validateQuestion({
        ...tf,
        alternatives: [tf.alternatives[0], tf.alternatives[0]],
      }).errors.length,
    ).toBeGreaterThan(0);
  });
  it("identifica duplicata no lote, mantém possível duplicata apenas como aviso", async () => {
    const rows = await parseImport(
      payload(
        question,
        question,
        { ...question, source: "Outra fonte" },
        { ...question, external_id: null },
      ),
    );
    expect(rows.every((row) => row.question)).toBe(true);
    expect(rows[1].warnings.join()).toContain("fonte + ID externo");
    expect(rows[2].warnings.join()).not.toContain("fonte + ID externo");
    expect(rows[3].warnings.join()).toContain("Possível duplicata");
  });
  it("permite conferir mais de 1.000 registros; o limite de confirmação é uma fronteira separada", async () => {
    const rows = await parseImport(
      payload(
        ...Array.from({ length: 1001 }, (_, index) => ({
          ...question,
          external_id: `LOTE-${index}`,
          statement: `Questão ${index}`,
        })),
      ),
    );
    expect(rows).toHaveLength(1001);
    expect(rows.filter((row) => row.errors.length === 0)).toHaveLength(1001);
    expect(rows.at(-1)?.index).toBe(1001);
  });
  it("publica JSON Schema gerado da mesma estrutura do validador, sem drift", () => {
    if (process.env.UPDATE_IMPORT_SCHEMA === "1") {
      mkdirSync(resolve("schemas"), { recursive: true });
      writeFileSync(
        resolve("schemas/import-v1.schema.json"),
        `${JSON.stringify(importJsonSchema(), null, 2)}\n`,
        "utf8",
      );
    }
    expect(
      JSON.parse(
        readFileSync(resolve("schemas/import-v1.schema.json"), "utf8"),
      ),
    ).toEqual(importJsonSchema());
  });
});

describe("texto, CSV e HTML estruturados", () => {
  it("tolera acentos nos rótulos, espaços, quebra de linha e separa registros", async () => {
    const text =
      " ID : 007\n Fonte: Manual\n Matéria : Administração Pública\n Ano: 2025\n ENUNCIADO:\nPrimeira linha.\nSegunda linha.\n A : Uma ação\nB:\nOutra ação\nGABARITO:\nB\n Explicação A: incorreta\nEXPLICAÇÃO B: correta\nEXPLICAÇÃO GERAL: discussão\n---\nID: 008\nFONTE: Manual\nENUNCIADO: incompleta";
    const rows = await parseImport(text, "text");
    expect(rows).toHaveLength(2);
    expect(rows[0].question?.subject).toBe("Administração Pública");
    expect(rows[0].question?.statement).toContain("Segunda linha.");
    expect(rows[0].question?.correct_answer).toBe("B");
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });
  it("não adivinha gabarito nem sobrescreve campos repetidos", async () => {
    const rows = await parseImport(
      "FONTE: Manual\nENUNCIADO: Teste\nA: Um\nB: Dois\nGABARITO: A\nGABARITO: B",
      "text",
    );
    expect(rows[0].errors.join()).toContain("repetido");
    expect(rows[0].question).toBeUndefined();
    expect(
      (
        await parseImport(
          "FONTE: Manual\nENUNCIADO: Teste\nA: Um\nB: Dois",
          "text",
        )
      )[0].errors.join(),
    ).toContain("correct_answer");
  });
  it("mapeia CSV delimitado por ponto e vírgula com aspas e linhas internas", async () => {
    const csv =
      'codigo;origem;pergunta;opcao1;opcao2;resposta;comentario\n007;Manual;"Ação; com\nquebra";Um;Dois;B;Ótimo';
    expect(getCsvHeaders(csv)).toEqual([
      "codigo",
      "origem",
      "pergunta",
      "opcao1",
      "opcao2",
      "resposta",
      "comentario",
    ]);
    const rows = await parseImport(csv, "csv", {
      codigo: "external_id",
      origem: "source",
      pergunta: "statement",
      opcao1: "alternative_A",
      opcao2: "alternative_B",
      resposta: "correct_answer",
      comentario: "general_explanation",
    });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].index).toBe(2);
    expect(rows[0].question?.external_id).toBe("007");
    expect(rows[0].question?.statement).toContain("quebra");
  });
  it("rejeita conflito de mapeamento CSV e cabeçalhos repetidos", async () => {
    expect(
      (
        await parseImport(
          "source,source,statement,A,B,correct_answer\nX,Y,Q,1,2,A",
          "csv",
        )
      )[0].errors.join(),
    ).toContain("duplicados");
    expect(
      (
        await parseImport("x,y\n1,2", "csv", { x: "source", y: "source" })
      )[0].errors.join(),
    ).toContain("Mais de uma coluna");
  });
  it("HTML segue estrutura explícita e sanitiza conteúdo", async () => {
    const rows = await parseImport(
      '<article data-question data-source="Manual" data-type="multiple_choice" data-correct-answer="B"><div data-field="statement"><p><strong>Ação</strong><script>alert(1)</script></p></div><div data-alternative="A"><div data-field="text">Primeira</div></div><div data-alternative="B"><div data-field="text">Segunda</div><div data-field="explanation">Porque sim.</div></div><div data-field="general_explanation">Geral.</div></article>',
      "html",
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].question?.statement).toBe("<p><strong>Ação</strong></p>");
    expect(rows[0].question?.alternatives[1].explanation).toBe("Porque sim.");
    expect(
      (
        await parseImport("<p>Texto arbitrário de site</p>", "html")
      )[0].errors.join(),
    ).toContain("HTML estruturado");
  });
  it("preserva o HTML visual estruturado para o verso e bloqueia conteúdo ativo", async () => {
    const visual =
      '<style>body{background:#fff}h1{color:#17365d}</style><section><h1>Gabarito visual</h1><p>Texto pesquisável.</p></section>';
    const rows = await parseImport(
      `<article data-question data-source="Manual" data-type="multiple_choice" data-correct-answer="A"><div data-field="statement">Enunciado</div><div data-alternative="A"><div data-field="text">Primeira</div></div><div data-alternative="B"><div data-field="text">Segunda</div></div><div data-field="general_explanation"></div><div data-field="visual_explanation_html">${visual}</div><div data-field="visual_explanation_height">640</div></article>`,
      "html",
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].question?.visual_explanation_html).toBe(visual);
    expect(rows[0].question?.visual_explanation_height).toBe(640);
    expect(
      validateQuestion({
        ...question,
        visual_explanation_html: "<script>alert(1)</script>",
      }).errors.join(),
    ).toContain("autocontidos");
  });
  it("detecta formatos e mantém vazio como erro legível", async () => {
    expect(detectImportFormat(payload(question))).toBe("json");
    expect(detectImportFormat("ID: 123\nFONTE: X")).toBe("text");
    expect(
      detectImportFormat("source,statement,A,B,correct_answer\nX,Q,1,2,A"),
    ).toBe("csv");
    expect(detectImportFormat("<article data-question></article>")).toBe(
      "html",
    );
    expect((await parseImport(" "))[0].errors).toEqual([
      "O arquivo está vazio.",
    ]);
  });
  it("os exemplos públicos exercitam lote válido e parcialmente inválido", async () => {
    for (const name of ["valid.json", "valid.csv", "valid.txt", "valid.html"])
      expect(
        (await parseImport(fixture(name))).every(
          (row) => row.errors.length === 0,
        ),
      ).toBe(true);
    const rows = await parseImport(fixture("invalid.json"));
    expect(rows.some((row) => row.question)).toBe(true);
    expect(rows.some((row) => row.errors.length)).toBe(true);
  });
});
