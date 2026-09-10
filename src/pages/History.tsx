import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Columns3 } from "lucide-react";
import { api } from "../lib/api";
import type { Catalog, HistoryFilters, Question } from "../domain/types";
import { plainText } from "../domain/content";
import { FiltersBar } from "../components/FiltersBar";
import {
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  Pagination,
  dateTime,
  duration,
  errorText,
  useLoad,
} from "../components/ui";
export function HistoryPage({
  catalogs,
  questionId,
  onQuestion,
  refresh,
}: {
  catalogs: Catalog[];
  questionId?: string;
  onQuestion: (q: Question) => void;
  refresh: number;
}) {
  const [filters, setFilters] = useState<HistoryFilters>({
    question_id: questionId,
    page: 1,
    page_size: 20,
    days: 30,
  });
  const [columns, setColumns] = useState([
    "context",
    "answer",
    "time",
    "interval",
    "next",
  ]);
  const [showColumns, setShowColumns] = useState(false);
  const [error, setError] = useState("");
  const history = useLoad(
    () => api.history(filters),
    [JSON.stringify(filters), refresh],
  );
  const names = (id?: string | null) =>
    catalogs.find((c) => c.id === id)?.name ?? "—";
  return (
    <div className="page">
      <PageTitle
        eyebrow="UM REGISTRO DE CADA PASSO"
        title={questionId ? "Histórico da questão" : "Seu histórico de estudo"}
        description="Respostas e intervalos preservados, mesmo quando suas configurações mudam."
      />
      <div className="history-toolbar">
        <div className="segmented">
          {[
            { label: "Hoje", days: 1 },
            { label: "7 dias", days: 7 },
            { label: "30 dias", days: 30 },
            { label: "90 dias", days: 90 },
            { label: "Tudo", days: undefined },
          ].map((p) => (
            <button
              key={p.label}
              className={filters.days === p.days ? "active" : ""}
              onClick={() => setFilters({ ...filters, days: p.days, page: 1 })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Resultado"
          value={
            filters.correct === undefined ? "all" : String(filters.correct)
          }
          onChange={(e) =>
            setFilters({
              ...filters,
              correct:
                e.target.value === "all"
                  ? undefined
                  : e.target.value === "true",
              page: 1,
            })
          }
        >
          <option value="all">Acertos e erros</option>
          <option value="true">Somente acertos</option>
          <option value="false">Somente erros</option>
        </select>
        <button
          className="button secondary"
          onClick={() => setShowColumns(!showColumns)}
        >
          <Columns3 size={17} />
          Colunas
        </button>
      </div>
      {showColumns && (
        <div className="column-picker">
          {[
            { key: "context", name: "Projeto / caderno" },
            { key: "answer", name: "Resposta e gabarito" },
            { key: "time", name: "Tempo" },
            { key: "interval", name: "Intervalo" },
            { key: "next", name: "Próxima revisão" },
          ].map((c) => (
            <label className="check-label" key={c.key}>
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                onChange={(e) =>
                  setColumns(
                    e.target.checked
                      ? [...columns, c.key]
                      : columns.filter((k) => k !== c.key),
                  )
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <FiltersBar
        filters={filters}
        onChange={(f) => setFilters({ ...filters, ...f })}
        catalogs={catalogs}
      />
      <ErrorBox error={error || history.error} retry={history.reload} />
      <section className="panel history-table">
        {history.loading ? (
          <Loading />
        ) : history.data?.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button
                        className="table-sort"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            ascending: !filters.ascending,
                            page: 1,
                          })
                        }
                      >
                        Data
                        {filters.ascending ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )}
                      </button>
                    </th>
                    <th>Questão</th>
                    {columns.includes("context") && <th>Projeto / Caderno</th>}
                    {columns.includes("answer") && <th>Resposta / Gabarito</th>}
                    <th>Resultado</th>
                    {columns.includes("time") && <th>Tempo</th>}
                    {columns.includes("interval") && (
                      <th>Intervalo escolhido</th>
                    )}
                    {columns.includes("next") && <th>Próxima revisão</th>}
                    <th>
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((a) => {
                    const questionAvailable = Boolean(a.question_id);
                    const openQuestion = async () => {
                      if (!a.question_id) return;
                      try {
                        onQuestion(await api.question(a.question_id));
                      } catch (e) {
                        setError(errorText(e));
                      }
                    };
                    return (
                    <tr key={a.id}>
                      <td className="nowrap">{dateTime(a.answered_at)}</td>
                      <td>
                        <button
                          className="history-question"
                          disabled={!questionAvailable}
                          title={questionAvailable ? undefined : "Questão excluída"}
                          onClick={openQuestion}
                        >
                          {plainText(a.statement_snapshot)}
                        </button>
                        <span className="small muted">
                          {a.question_id
                            ? `#${a.question_id.slice(0, 8)}`
                            : "Questão excluída"}
                        </span>
                      </td>
                      {columns.includes("context") && (
                        <td>
                          {names(a.context.project_id)}
                          <br />
                          <span className="small muted">
                            {names(a.context.notebook_id)}
                          </span>
                        </td>
                      )}
                      {columns.includes("answer") && (
                        <td>
                          {a.answer} / {a.correct_answer}
                        </td>
                      )}
                      <td>
                        <span
                          className={`badge ${a.is_correct ? "green" : "red"}`}
                        >
                          {a.is_correct ? "Acerto" : "Erro"}
                        </span>
                      </td>
                      {columns.includes("time") && (
                        <td className="nowrap">{duration(a.elapsed_ms)}</td>
                      )}
                      {columns.includes("interval") && (
                        <td>
                          {a.interval_snapshot?.label ?? "Não escolhido"}
                          {a.interval_snapshot && (
                            <span className="small muted block">
                              {a.interval_snapshot.value}{" "}
                              {a.interval_snapshot.unit === "day"
                                ? "dia(s)"
                                : a.interval_snapshot.unit === "hour"
                                  ? "hora(s)"
                                  : "minuto(s)"}
                            </span>
                          )}
                        </td>
                      )}
                      {columns.includes("next") && (
                        <td className="nowrap">{dateTime(a.next_review_at)}</td>
                      )}
                      <td>
                        <button
                          className="icon-button"
                          aria-label={questionAvailable ? "Abrir questão" : "Questão excluída"}
                          disabled={!questionAvailable}
                          onClick={openQuestion}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={filters.page ?? 1}
              total={history.data.total}
              onChange={(page) => setFilters({ ...filters, page })}
            />
          </>
        ) : (
          <Empty
            title="Sua trajetória começa com a primeira resposta"
            text="Cada tentativa aparecerá aqui, com o resultado e o intervalo que você escolheu."
          />
        )}
      </section>
    </div>
  );
}
