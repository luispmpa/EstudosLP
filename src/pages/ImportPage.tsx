import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileJson,
  FileUp,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import { parseImport, getCsvHeaders } from "../domain/import";
import type {
  DuplicatePolicy,
  ImportResult,
  QuestionInput,
} from "../domain/types";
import { plainText } from "../domain/content";
import {
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  Pagination,
  Spinner,
  dateTime,
  errorText,
  useLoad,
} from "../components/ui";
type PreviewRow = Awaited<ReturnType<typeof parseImport>>[number];
type Duplicate = Awaited<ReturnType<typeof api.duplicates>>[number];
const fields = [
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
  "board",
  "organization",
  "position",
  "subject",
  "topic",
  "subtopic",
  "tags",
  "projects",
  "notebooks",
  ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "TRUE", "FALSE"].flatMap((k) => [
    `alternative_${k}`,
    `explanation_${k}`,
  ]),
];
export function ImportPage({ onImported }: { onImported: () => void }) {
  const [step, setStep] = useState(1);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("conteudo-colado");
  const [format, setFormat] = useState<
    "auto" | "json" | "csv" | "text" | "html"
  >("auto");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [policy, setPolicy] = useState<DuplicatePolicy>("skip");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"all" | "errors" | "duplicates">("all");
  const [diff, setDiff] = useState<Duplicate>();
  const [requestId, setRequestId] = useState(crypto.randomUUID());
  const logs = useLoad(() => api.imports(), []);
  const headers = format === "csv" ? getCsvHeaders(content) : [];
  const valid = rows.filter(
    (r): r is PreviewRow & { question: QuestionInput } =>
      !!r.question && !r.errors.length,
  );
  const invalid = rows.filter((r) => r.errors.length);
  const exact = duplicates.filter((d) => d.exact).length;
  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      const parsed = await parseImport(content, format, mapping);
      setRows(parsed);
      const questions = parsed
        .filter((r) => r.question && !r.errors.length)
        .map((r) => r.question!);
      if (questions.length > 1000)
        throw new Error(
          "Este lote tem mais de 1.000 registros válidos. Divida o arquivo para manter a validação e a gravação consistentes.",
        );
      const matches = questions.length ? await api.duplicates(questions) : [];
      setDuplicates(matches);
      setStep(2);
      setPage(1);
      setView("all");
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    setBusy(true);
    setError("");
    try {
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(content),
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const r = await api.importQuestions(
        valid.map((r) => r.question),
        fileName,
        hash,
        policy,
        requestId,
      );
      setResult(r);
      setStep(3);
      logs.reload();
      onImported();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const displayed = rows.filter((r) =>
    view === "errors"
      ? r.errors.length
      : view === "duplicates"
        ? duplicates.some((d) => valid[d.index - 1]?.index === r.index)
        : true,
  );
  return (
    <div className="page">
      <PageTitle
        eyebrow="SEU CONTEÚDO, BEM ORGANIZADO"
        title="Importar questões"
        description="Revise os dados e as possíveis duplicatas antes de salvar."
      />
      <div className="import-steps">
        {["Conteúdo", "Validar e conferir", "Resultado"].map((s, i) => (
          <div
            className={
              step === i + 1 ? "active" : step > i + 1 ? "complete" : ""
            }
            key={s}
          >
            <span>{step > i + 1 ? <CheckCircle2 size={17} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <ErrorBox error={error} />
      {step === 1 && (
        <div className="import-layout">
          <section className="panel form-section">
            <h2>Adicione seu lote</h2>
            <label className="upload-zone">
              <FileUp size={30} />
              <strong>Selecionar um arquivo</strong>
              <span>JSON, CSV, TXT ou HTML · até 20 MB</span>
              <input
                type="file"
                accept=".json,.csv,.txt,.html,.htm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 20 * 1024 * 1024) {
                    setError(
                      "O limite por arquivo é 20 MB. Divida o lote em arquivos menores.",
                    );
                    return;
                  }
                  setContent(await file.text());
                  setFileName(file.name);
                  setMapping({});
                  setFormat(file.name.endsWith(".csv") ? "csv" : "auto");
                  setError("");
                }}
              />
            </label>
            <label>
              Ou cole o conteúdo
              <textarea
                className="import-input"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setMapping({});
                }}
                placeholder={
                  '{\n  "schema_version": "1.0",\n  "questions": [\n    { "source": "meu-acervo", "external_id": "123456", "type": "multiple_choice", "statement": "Enunciado…", "alternatives": [{"key":"A","text":"Primeira","explanation":""},{"key":"B","text":"Segunda","explanation":""}], "correct_answer":"A", "general_explanation":"" }\n  ]\n}'
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Formato
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="auto">Detectar automaticamente</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="text">Texto estruturado</option>
                  <option value="html">HTML estruturado</option>
                </select>
              </label>
              <label>
                Nome do lote
                <input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </label>
            </div>
            {headers.length > 0 && (
              <section className="mapping">
                <h3>Mapeamento das colunas</h3>
                <p className="small muted">
                  Os nomes canônicos são reconhecidos automaticamente. Ajuste
                  quando necessário.
                </p>
                {headers.map((header) => (
                  <label className="mapping-row" key={header}>
                    <span>{header}</span>
                    <ArrowRight size={15} />
                    <select
                      value={mapping[header] ?? ""}
                      onChange={(e) => {
                        const next = { ...mapping };
                        if (e.target.value) next[header] = e.target.value;
                        else delete next[header];
                        setMapping(next);
                      }}
                    >
                      <option value="">Reconhecer automaticamente</option>
                      <option value="ignore">Ignorar coluna</option>
                      {fields.map((f) => (
                        <option value={f} key={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </section>
            )}
            <div className="form-footer">
              <span className="small muted">
                Nenhum dado será salvo nesta etapa.
              </span>
              <button
                className="button primary"
                disabled={!content.trim() || !fileName.trim() || busy}
                onClick={preview}
              >
                {busy ? <Spinner /> : <ArrowRight size={17} />}Validar lote
              </button>
            </div>
          </section>
          <aside className="import-help">
            <div className="eyebrow">GUIA DE IMPORTAÇÃO</div>
            <h2>Do arquivo ao seu próximo estudo.</h2>
            <p>
              Use o par <code>source + external_id</code> para identificar cada
              questão de forma estável.
            </p>
            <div className="help-point">
              <FileJson size={20} />
              <div>
                <strong>Formato canônico</strong>
                <p>
                  Alternativas em uma coleção, cada uma com chave, texto e
                  explicação. Gabarito igual à chave da alternativa.
                </p>
              </div>
            </div>
            <div className="help-point">
              <AlertTriangle size={20} />
              <div>
                <strong>Sem adivinhações</strong>
                <p>
                  Registros ambíguos aparecem com erro. Você importa apenas os
                  válidos e corrige os demais.
                </p>
              </div>
            </div>
            <p className="small">
              Certo/Errado usa chaves <code>TRUE</code> e <code>FALSE</code>.
              Baixe um exemplo completo para começar:
              {["json", "csv", "txt", "html"].map((ext) => (
                <a
                  key={ext}
                  className="text-button"
                  href={`/examples/valid.${ext}`}
                  download
                >
                  {ext.toUpperCase()}
                </a>
              ))}
              <br />
              Até 1.000 registros válidos por confirmação.
            </p>
          </aside>
        </div>
      )}
      {step === 2 && (
        <>
          <div className="import-summary">
            <div>
              <strong>{rows.length}</strong>
              <span>registros encontrados</span>
            </div>
            <div>
              <strong>{valid.length}</strong>
              <span>válidos</span>
            </div>
            <div>
              <strong>{exact}</strong>
              <span>duplicatas por identidade</span>
            </div>
            <div>
              <strong>{invalid.length}</strong>
              <span>com erro</span>
            </div>
          </div>
          <section className="panel form-section">
            <div className="section-heading">
              <h2>Confira antes de importar</h2>
              <button
                className="text-button"
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
              >
                <ArrowLeft size={16} />
                Corrigir conteúdo
              </button>
            </div>
            <div className="tab-row">
              {(
                [
                  ["all", "Todos"],
                  ["errors", `Erros (${invalid.length})`],
                  ["duplicates", `Duplicatas (${duplicates.length})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => {
                    setView(v);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Registro</th>
                    <th>Questão</th>
                    <th>Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.slice((page - 1) * 20, page * 20).map((row) => {
                    const duplicate = duplicates.find(
                      (d) => valid[d.index - 1]?.index === row.index,
                    );
                    return (
                      <tr key={row.index}>
                        <td>#{row.index}</td>
                        <td>
                          <strong>
                            {row.question?.external_id || "Sem ID externo"}
                          </strong>
                          <div className="table-excerpt">
                            {plainText(
                              row.question?.statement ?? "Conteúdo inválido",
                            )}
                          </div>
                        </td>
                        <td>
                          {row.errors.map((e) => (
                            <div className="danger-text small" key={e}>
                              {e}
                            </div>
                          ))}
                          {row.warnings.map((w) => (
                            <div className="warning-text small" key={w}>
                              {w}
                            </div>
                          ))}
                          {duplicate ? (
                            <div>
                              <span className="badge amber">
                                {duplicate.exact
                                  ? "Já existente"
                                  : "Possível semelhança"}
                              </span>
                              {duplicate.question_id && (
                                <button
                                  className="text-button"
                                  onClick={async () => {
                                    try {
                                      setDiff({
                                        ...duplicate,
                                        existing: await api.question(
                                          duplicate.question_id,
                                        ),
                                      });
                                    } catch (e) {
                                      setError(errorText(e));
                                    }
                                  }}
                                >
                                  Ver diferenças
                                </button>
                              )}
                            </div>
                          ) : (
                            !row.errors.length && (
                              <span className="badge green">Válido</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={displayed.length}
              onChange={setPage}
            />
            {diff && (
              <section className="diff-panel">
                <div className="section-heading">
                  <h3>Comparação de conteúdo</h3>
                  <button
                    className="text-button"
                    onClick={() => setDiff(undefined)}
                  >
                    Fechar
                  </button>
                </div>
                <div className="diff-columns">
                  <div>
                    <strong>Questão salva</strong>
                    <pre>{JSON.stringify(diff.existing, null, 2)}</pre>
                  </div>
                  <div>
                    <strong>Questão do lote</strong>
                    <pre>
                      {JSON.stringify(valid[diff.index - 1]?.question, null, 2)}
                    </pre>
                  </div>
                </div>
              </section>
            )}
            <div className="import-confirm">
              <label>
                Quando a identidade já existir
                <select
                  value={policy}
                  onChange={(e) => {
                    setPolicy(e.target.value as DuplicatePolicy);
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  <option value="skip">Ignorar questão existente</option>
                  <option value="update">
                    Atualizar conteúdo da questão existente
                  </option>
                  <option value="cancel">Cancelar se houver duplicatas</option>
                </select>
              </label>
              <p className="small muted">
                {policy === "update"
                  ? "Questões existentes terão seu conteúdo atualizado. Tentativas e revisões anteriores serão preservadas."
                  : "Semelhança de texto gera um aviso. Questões diferentes não são bloqueadas só por semelhança."}
                {invalid.length > 0 &&
                  ` ${invalid.length} registro(s) inválido(s) ficarão fora do lote enviado.`}
              </p>
              <button
                className="button primary"
                disabled={
                  busy || !valid.length || (policy === "cancel" && exact > 0)
                }
                onClick={commit}
              >
                {busy ? <Spinner /> : <Upload size={17} />}Confirmar importação
                de {valid.length} registros válidos
              </button>
            </div>
          </section>
        </>
      )}
      {step === 3 && result && (
        <section className="panel">
          <Empty
            title="Importação concluída"
            text={`${result.report.inserted} inseridas · ${result.report.updated} atualizadas · ${result.report.skipped} ignoradas · ${result.report.errors} erros no processamento.`}
            action={
              <button
                className="button primary"
                onClick={() => {
                  setStep(1);
                  setContent("");
                  setRows([]);
                  setResult(undefined);
                  setError("");
                }}
              >
                Importar outro lote
              </button>
            }
          />
          {result.items
            .filter((i) => i.status === "error")
            .map((i) => (
              <p className="error-box" key={i.index}>
                Registro {i.index}: {i.error}
              </p>
            ))}
        </section>
      )}
      <section className="panel import-history">
        <div className="section-heading">
          <h2>Histórico de importações</h2>
          <span className="muted small">Lotes registrados na sua conta</span>
        </div>
        {logs.loading ? (
          <Loading />
        ) : logs.error ? (
          <ErrorBox error={logs.error} retry={logs.reload} />
        ) : logs.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Data</th>
                  <th>Recebidas</th>
                  <th>Inseridas</th>
                  <th>Atualizadas</th>
                  <th>Ignoradas</th>
                  <th>Erros</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.map((log) => (
                  <tr key={log.id}>
                    <td>{log.file_name}</td>
                    <td>{dateTime(log.created_at)}</td>
                    <td>{log.received}</td>
                    <td>{log.inserted}</td>
                    <td>{log.updated}</td>
                    <td>{log.skipped}</td>
                    <td>{log.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Seus lotes aparecerão aqui depois da primeira importação.
          </p>
        )}
      </section>
    </div>
  );
}
