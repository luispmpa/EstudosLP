import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  fingerprint,
  identityKey,
  plainText,
  sanitizeHtml,
  searchableText,
} from "../src/domain/content";
import type { QuestionInput } from "../src/domain/types";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});
const question: QuestionInput = {
  source: "Exemplo",
  external_id: "007",
  type: "multiple_choice",
  statement: "<p>Ação pública</p>",
  alternatives: [
    { key: "A", text: "Orçamento", explanation: "Restos a pagar" },
    { key: "B", text: "Controle", explanation: "Fiscalização" },
  ],
  correct_answer: "A",
  general_explanation: "Explicação geral",
  notes: "<b>Nota pessoal</b>",
  subject: "AFO",
  tags: ["Revisar"],
};

describe("fronteira de conteúdo rico", () => {
  it("preserva formatação e restringe estilo e links", () => {
    const clean = sanitizeHtml(
      '<p style="text-align:center;position:fixed;color:#c00"><strong>Ação</strong> <mark>pública</mark><a href="https://example.com" onclick="alert(1)">Fonte</a></p>',
    );
    expect(clean).toContain("<strong>Ação</strong>");
    expect(clean).toContain("<mark>pública</mark>");
    expect(clean).toContain("text-align: center");
    expect(clean).toContain('href="https://example.com"');
    expect(clean).not.toMatch(/onclick|position/);
  });
  it("remove scripts, eventos, protocolos perigosos e árvores SVG/MathML", () => {
    const clean = sanitizeHtml(
      '<script>secret()</script><img src=x onerror=alert(1)><svg><a href="javascript:alert(1)">x</a></svg><math><mtext>math</mtext></math><a href="jav&#x61;script:alert(1)" onmouseover=x>Texto</a><span style="background-image:url(javascript:alert(1))">fim</span>',
    );
    expect(clean).not.toMatch(
      /script|onerror|onmouseover|svg|math|background-image|secret\(/i,
    );
    expect(clean).toContain("Texto");
  });
  it("extrai texto pesquisável com espaços entre blocos e decodifica entidades", () => {
    expect(
      plainText(
        "<p>restos&nbsp;a</p><p>pagar &amp; liquidar</p><ul><li>ação</li><li>educação</li></ul>",
      ),
    ).toBe("restos a pagar & liquidar ação educação");
    const search = searchableText(question);
    for (const term of [
      "007",
      "Ação pública",
      "Orçamento",
      "Restos a pagar",
      "Fiscalização",
      "Explicação geral",
      "Nota pessoal",
      "Revisar",
    ])
      expect(search).toContain(term);
  });
  it("é idempotente para HTML já sanitizado", () => {
    const first = sanitizeHtml(
      '<p style="color:red"><a href="https://example.com">Link</a><strong>Teste</strong></p>',
    );
    expect(sanitizeHtml(first)).toBe(first);
  });
});

describe("identidade e possíveis duplicatas", () => {
  it("mantém fontes diferentes separadas e usa ID textual sem perder zeros", () => {
    expect(identityKey({ source: " Fonte ", external_id: " 007 " })).toBe(
      identityKey({ source: "fonte", external_id: "007" }),
    );
    expect(identityKey({ source: "Fonte", external_id: "007" })).not.toBe(
      identityKey({ source: "Outra", external_id: "007" }),
    );
    expect(identityKey({ source: "Fonte", external_id: "007" })).not.toBe(
      identityKey({ source: "Fonte", external_id: "7" }),
    );
    expect(identityKey({ source: "Fonte" })).toBeNull();
  });
  it("hash ignora apresentação e metadados, mas distingue conteúdo das alternativas", async () => {
    const hash = await fingerprint(question);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await fingerprint({
        ...question,
        statement: "  AÇÃO   pública ",
        alternatives: [...question.alternatives].reverse(),
      }),
    ).toBe(hash);
    expect(
      await fingerprint({
        ...question,
        alternatives: question.alternatives.map((a) => ({
          ...a,
          text: a.text + " novo",
        })),
      }),
    ).not.toBe(hash);
  });
});
