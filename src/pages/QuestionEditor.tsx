import { useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import type {
  Alternative,
  Catalog,
  Question,
  QuestionInput,
} from "../domain/types";
import { api } from "../lib/api";
import { RichEditor } from "../components/RichEditor";
import { VisualExplanation } from "../components/VisualExplanation";
import {
  ErrorBox,
  PageTitle,
  Spinner,
  errorText,
  kindLabels,
} from "../components/ui";
import { questionDraft } from "../domain/editor";
import { validateQuestion } from "../domain/import";

const fresh = (): QuestionInput => ({
  source: "manual",
  external_id: null,
  type: "multiple_choice",
  statement: "",
  alternatives: ["A", "B", "C", "D", "E"].map((key) => ({
    key,
    text: "",
    explanation: "",
  })),
  correct_answer: "",
  general_explanation: "",
  notes: "",
  catalog_ids: [],
});
export function QuestionEditor({
  question,
  catalogs,
  onBack,
  onSaved,
}: {
  question?: Question;
  catalogs: Catalog[];
  onBack: () => void;
  onSaved: (q: Question) => void;
}) {
  const [form, setForm] = useState<QuestionInput>(
    question ? questionDraft(question) : fresh(),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [visualOpen, setVisualOpen] = useState(
    Boolean(question?.visual_explanation_html),
  );
  const patch = (value: Partial<QuestionInput>) => {
    setForm((f) => ({ ...f, ...value }));
    setDirty(true);
  };
  const alt = (index: number, value: Partial<Alternative>) =>
    patch({
      alternatives: form.alternatives.map((a, i) =>
        i === index ? { ...a, ...value } : a,
      ),
    });
  const back = () => {
    if (
      !dirty ||
      window.confirm("Descartar as alterações que ainda não foram salvas?")
    )
      onBack();
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = validateQuestion({
        ...form,
        external_id: form.external_id?.trim() || null,
      });
      if (result.errors.length) throw new Error(result.errors.join(" · "));
      const saved = await api.saveQuestion(result.question!, question?.id);
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page editor-page">
      <button className="text-button back-link" onClick={back}>
        <ArrowLeft size={17} />
        Voltar ao banco
      </button>
      <PageTitle
        eyebrow="BANCO DE QUESTÕES"
        title={question ? "Editar questão" : "Uma nova questão"}
        description="Organize o conteúdo agora. Encontre com facilidade depois."
        actions={
          <button className="button primary" disabled={busy} onClick={save}>
            {busy ? <Spinner /> : <Save size={17} />}Salvar questão
          </button>
        }
      />
      <ErrorBox error={error} />
      <div className="editor-layout">
        <div className="editor-main">
          <section className="panel form-section">
            <h2>Conteúdo da questão</h2>
            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(e) => {
                    const tf = e.target.value === "true_false";
                    if (
                      window.confirm(
                        "A mudança de tipo redefine as alternativas. Continuar?",
                      )
                    )
                      patch({
                        type: tf ? "true_false" : "multiple_choice",
                        correct_answer: "",
                        alternatives: tf
                          ? [
                              {
                                key: "TRUE",
                                text: "<p>Certo</p>",
                                explanation: "",
                              },
                              {
                                key: "FALSE",
                                text: "<p>Errado</p>",
                                explanation: "",
                              },
                            ]
                          : fresh().alternatives,
                      });
                  }}
                >
                  <option value="multiple_choice">Múltipla escolha</option>
                  <option value="true_false">Certo ou Errado</option>
                </select>
              </label>
              <label>
                ID externo
                <input
                  value={form.external_id ?? ""}
                  onChange={(e) => patch({ external_id: e.target.value })}
                  placeholder="Opcional, ex.: 123456"
                />
              </label>
            </div>
            <label className="field-label">
              Enunciado <span>*</span>
            </label>
            <RichEditor
              label="Enunciado"
              value={form.statement}
              onChange={(v) => patch({ statement: v })}
            />
            <div className="section-heading">
              <h3>Alternativas</h3>
              <span className="muted">Marque o gabarito</span>
            </div>
            {form.alternatives.map((a, i) => (
              <div className="alternative-editor" key={a.key}>
                <div className="alternative-editor-head">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correct_answer === a.key}
                      onChange={() => patch({ correct_answer: a.key })}
                    />
                    <span className="letter">{a.key}</span>
                    {form.correct_answer === a.key
                      ? "Gabarito correto"
                      : "Alternativa"}
                  </label>
                  {form.type === "multiple_choice" &&
                    form.alternatives.length > 2 && (
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir alternativa ${a.key}`}
                        onClick={() =>
                          patch({
                            alternatives: form.alternatives.filter(
                              (_, j) => j !== i,
                            ),
                            correct_answer:
                              form.correct_answer === a.key
                                ? ""
                                : form.correct_answer,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                </div>
                <RichEditor
                  compact
                  label={`Alternativa ${a.key}`}
                  value={a.text}
                  onChange={(v) => alt(i, { text: v })}
                />
                <details>
                  <summary>Explicação da alternativa {a.key}</summary>
                  <RichEditor
                    compact
                    label={`Explicação ${a.key}`}
                    value={a.explanation}
                    onChange={(v) => alt(i, { explanation: v })}
                  />
                </details>
              </div>
            ))}
            {form.type === "multiple_choice" &&
              form.alternatives.length < 26 && (
                <button
                  className="button secondary"
                  onClick={() => {
                    const key = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                      .split("")
                      .find(
                        (k) => !form.alternatives.some((a) => a.key === k),
                      )!;
                    patch({
                      alternatives: [
                        ...form.alternatives,
                        { key, text: "", explanation: "" },
                      ],
                    });
                  }}
                >
                  <Plus size={16} />
                  Adicionar alternativa
                </button>
              )}
          </section>
          <section className="panel form-section">
            <h2>Compreensão e anotações</h2>
            <label className="field-label">Explicação geral</label>
            <RichEditor
              label="Explicação geral"
              value={form.general_explanation}
              onChange={(v) => patch({ general_explanation: v })}
            />
            <label className="field-label">Minhas observações</label>
            <RichEditor
              label="Minhas observações"
              value={form.notes ?? ""}
              onChange={(v) => patch({ notes: v })}
            />
          </section>
          <section className="panel form-section">
            <details
              className="visual-html-editor"
              open={visualOpen}
              onToggle={(event) => setVisualOpen(event.currentTarget.open)}
            >
              <summary>
                <span>
                  <strong>HTML visual do verso</strong>
                  <small>
                    Cole um layout completo de gabarito para aparecer após a
                    resposta.
                  </small>
                </span>
                <span className="visual-html-optional">Opcional</span>
              </summary>
              <p className="small muted visual-html-note">
                Aceita HTML e CSS autocontidos. O material abre em uma moldura
                isolada: scripts, imagens, formulários, incorporações e
                recursos externos não são permitidos.
              </p>
              <label className="field-label" htmlFor="visual-explanation-html">
                Código HTML do gabarito
              </label>
              <textarea
                id="visual-explanation-html"
                className="visual-html-input"
                spellCheck={false}
                value={form.visual_explanation_html ?? ""}
                onChange={(e) =>
                  patch({ visual_explanation_html: e.target.value })
                }
                placeholder={'<section style="...">…</section>'}
              />
              <label className="visual-html-height" htmlFor="visual-explanation-height">
                Altura da visualização
                <input
                  id="visual-explanation-height"
                  type="number"
                  min="240"
                  max="2000"
                  step="10"
                  value={form.visual_explanation_height ?? 720}
                  onChange={(e) =>
                    patch({
                      visual_explanation_height: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
                <span>px</span>
              </label>
              <VisualExplanation
                html={form.visual_explanation_html}
                height={form.visual_explanation_height}
                title="Prévia do HTML visual"
              />
            </details>
          </section>
        </div>
        <aside className="editor-aside">
          <section className="panel form-section">
            <h2>Identificação</h2>
            <label>
              Fonte <span>*</span>
              <input
                value={form.source}
                onChange={(e) => patch({ source: e.target.value })}
                placeholder="manual, QConcursos…"
              />
            </label>
            <label>
              Ano
              <input
                type="number"
                min="1900"
                max="2200"
                value={form.year ?? ""}
                onChange={(e) =>
                  patch({
                    year: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <label>
              Nível
              <input
                value={form.level ?? ""}
                onChange={(e) => patch({ level: e.target.value })}
                placeholder="Ex.: superior"
              />
            </label>
            <label>
              Dificuldade
              <select
                value={form.difficulty ?? ""}
                onChange={(e) => patch({ difficulty: e.target.value })}
              >
                <option value="">Não informada</option>
                <option>Fácil</option>
                <option>Média</option>
                <option>Difícil</option>
              </select>
            </label>
            <label>
              URL da fonte
              <input
                type="url"
                value={form.source_url ?? ""}
                onChange={(e) => patch({ source_url: e.target.value })}
                placeholder="https://"
              />
            </label>
            {question && (
              <p className="small muted">ID interno: {question.id}</p>
            )}
          </section>
          <section className="panel form-section">
            <h2>Organização</h2>
            <p className="small muted">
              Selecione uma ou mais classificações. Crie novas em Configurações.
            </p>
            {Object.entries(kindLabels).map(([kind, label]) => {
              const list = catalogs.filter(
                (c) => c.kind === kind && !c.archived,
              );
              return (
                <details
                  key={kind}
                  className="catalog-select"
                  open={["project", "notebook", "subject"].includes(kind)}
                >
                  <summary>
                    {label}
                    <span>
                      {list.filter((c) => form.catalog_ids?.includes(c.id))
                        .length || ""}
                    </span>
                  </summary>
                  {list.length ? (
                    list.map((c) => (
                      <label className="check-label" key={c.id}>
                        <input
                          type="checkbox"
                          checked={form.catalog_ids?.includes(c.id) ?? false}
                          onChange={(e) =>
                            patch({
                              catalog_ids: e.target.checked
                                ? [...(form.catalog_ids ?? []), c.id]
                                : (form.catalog_ids ?? []).filter(
                                    (id) => id !== c.id,
                                  ),
                            })
                          }
                        />
                        {c.name}
                      </label>
                    ))
                  ) : (
                    <p className="small muted">Nenhum cadastro.</p>
                  )}
                </details>
              );
            })}
          </section>
        </aside>
      </div>
      <div className="mobile-save">
        <button className="button primary" disabled={busy} onClick={save}>
          {busy ? <Spinner /> : <Save size={17} />}Salvar questão
        </button>
      </div>
    </div>
  );
}
