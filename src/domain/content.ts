import DOMPurify from "dompurify";
import type { QuestionInput } from "./types";

const allowedTags = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "mark",
  "span",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "pre",
  "code",
  "a",
  "hr",
  "sub",
  "sup",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];
const safeColor =
  /^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\))$/i;

/** A conservative rich-text boundary; images, embeds and executable markup are unsupported. */
export function sanitizeHtml(html: string): string {
  if (!/[<&]/.test(html)) return html;
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ["href", "title", "style", "colspan", "rowspan", "start"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_TAGS: [
      "script",
      "style",
      "svg",
      "math",
      "iframe",
      "object",
      "embed",
      "form",
    ],
  });
  const document = new DOMParser().parseFromString(clean, "text/html");
  document.body.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.style;
    const preserved: string[] = [];
    for (const property of [
      "color",
      "background-color",
      "text-align",
      "margin-left",
    ]) {
      const value = style.getPropertyValue(property).trim();
      if (
        (["color", "background-color"].includes(property) &&
          safeColor.test(value)) ||
        (property === "text-align" &&
          /^(left|right|center|justify)$/.test(value)) ||
        (property === "margin-left" &&
          /^([0-9]|[1-9][0-9])(?:\.\d+)?(px|em|rem)$/.test(value))
      ) {
        preserved.push(`${property}: ${value}`);
      }
    }
    element.removeAttribute("style");
    if (preserved.length) element.setAttribute("style", preserved.join("; "));
  });
  document.body.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    const href = link.getAttribute("href")?.trim() ?? "";
    if (!/^(https?:\/\/|mailto:|#)/i.test(href)) link.removeAttribute("href");
    else link.setAttribute("rel", "noopener noreferrer");
  });
  return document.body.innerHTML;
}

/** Preserve spaces between adjacent blocks and decode entities for text search. */
export function plainText(html: string): string {
  if (!/[<&]/.test(html))
    return html.normalize("NFKC").replace(/\s+/g, " ").trim();
  const document = new DOMParser().parseFromString(
    sanitizeHtml(html),
    "text/html",
  );
  document.body
    .querySelectorAll(
      "br, p, div, li, h1, h2, h3, h4, blockquote, pre, tr, td, th, hr",
    )
    .forEach((element) => {
      element.insertAdjacentText("beforebegin", " ");
      element.insertAdjacentText("afterend", " ");
    });
  return (document.body.textContent ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchableText(question: QuestionInput): string {
  return [
    question.external_id ?? "",
    question.source,
    plainText(question.statement),
    ...question.alternatives.flatMap((alternative) => [
      alternative.key,
      plainText(alternative.text),
      plainText(alternative.explanation),
    ]),
    plainText(question.general_explanation),
    plainText(question.visual_explanation_html ?? ""),
    plainText(question.notes ?? ""),
    question.board,
    question.organization,
    question.position,
    question.subject,
    question.topic,
    question.subtopic,
    question.year?.toString(),
    ...(question.tags ?? []),
    ...(question.projects ?? []),
    ...(question.notebooks ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function identityKey(
  question: Pick<QuestionInput, "source" | "external_id">,
): string | null {
  const externalId = question.external_id?.trim();
  return externalId
    ? JSON.stringify([question.source.trim().toLowerCase(), externalId])
    : null;
}

export async function fingerprint(
  question: Pick<QuestionInput, "type" | "statement" | "alternatives">,
): Promise<string> {
  const normalized = (value: string) => plainText(value).toLowerCase();
  const content = JSON.stringify([
    question.type,
    normalized(question.statement),
    [...question.alternatives]
      .sort((a, b) => a.key.localeCompare(b.key, "en"))
      .map((a) => [a.key, normalized(a.text)]),
  ]);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
