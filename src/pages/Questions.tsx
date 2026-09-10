import { useState } from "react";
import { ArrowRight, Pencil, Plus, Star, Upload, Archive } from "lucide-react";
import { api } from "../lib/api";
import type { Catalog, Filters, Question } from "../domain/types";
import { FiltersBar } from "../components/FiltersBar";
import {
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  Pagination,
  dateTime,
  errorText,
  useLoad,
} from "../components/ui";
import { plainText } from "../domain/content";
export function QuestionsPage({
  catalogs,
  onEdit,
  onStudy,
  onImport,
  initialMode = "all",
  refresh,
}: {
  catalogs: Catalog[];
  onEdit: (q?: Question) => void;
  onStudy: (f: Filters, q?: Question) => void;
  onImport: () => void;
  initialMode?: Filters["mode"];
  refresh: number;
}) {
  const [filters, setFilters] = useState<Filters>({
    mode: initialMode,
    page: 1,
    page_size: 20,
    sort: "newest",
  });
  const [error, setError] = useState("");
  const questions = useLoad(
    () => api.questions(filters),
    [JSON.stringify(filters), refresh],
  );
  const errors = ["errors", "recurring", "recovered"].includes(
    initialMode ?? "",
  );
  const reviews = initialMode === "due";
  const title = errors
    ? "Cada erro, uma oportunidade."
    : reviews
      ? "Revisões no seu ritmo."
      : "Seu banco de questões";
  return (
    <div className="page">
      <PageTitle
        eyebrow={
          errors
            ? "REVISÃO DIRECIONADA"
            : reviews
              ? "MEMÓRIA EM CONSTRUÇÃO"
              : "SEU ACERVO DE ESTUDO"
        }
        title={title}
        description={
          errors
            ? "Identifique padrões, compreenda as respostas e tente novamente."
            : reviews
              ? "Escolha o que revisar. Seus intervalos determinam quando as questões voltam."
              : "Encontre, organize e transforme conteúdo em conhecimento."
        }
        actions={
          <>
            <button className="button secondary" onClick={onImport}>
              <Upload size={17} />
              Importar
            </button>
            <button className="button primary" onClick={() => onEdit()}>
              <Plus size={17} />
              Nova questão
            </button>
          </>
        }
      />
      <FiltersBar filters={filters} onChange={setFilters} catalogs={catalogs} />
      <div className="results-toolbar">
        <span>
          <strong>
            {questions.data?.total.toLocaleString("pt-BR") ?? "—"}
          </strong>{" "}
          questões encontradas
        </span>
        <div>
          <select
            aria-label="Ordenar questões"
            value={filters.sort}
            onChange={(e) =>
              setFilters({
                ...filters,
                sort: e.target.value as Filters["sort"],
                page: 1,
              })
            }
          >
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="due">Próxima revisão</option>
          </select>
          <button
            className="button primary"
            disabled={!questions.data?.total}
            onClick={() => onStudy(filters)}
          >
            Estudar seleção
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      <ErrorBox error={error || questions.error} retry={questions.reload} />
      {questions.loading ? (
        <Loading />
      ) : !questions.data?.items.length ? (
        <section className="panel">
          <Empty
            title="Um espaço para o seu conhecimento"
            text="Nenhuma questão corresponde a esta busca. Ajuste os filtros ou adicione questões ao acervo."
            action={
              <button className="button secondary" onClick={onImport}>
                <Upload size={16} />
                Importar questões
              </button>
            }
          />
        </section>
      ) : (
        <div className="question-list">
          {questions.data.items.map((q) => {
            const classifications = catalogs.filter((c) =>
              q.catalog_ids?.includes(c.id),
            );
            return (
              <article className="panel question-list-item" key={q.id}>
                <div className="question-list-meta">
                  <span className="eyebrow">
                    {[
                      classifications.find((c) => c.kind === "board")?.name ??
                        q.board,
                      q.year,
                      q.source,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="question-list-id">
                    #{q.external_id || q.id.slice(0, 8)}
                  </span>
                </div>
                <button
                  className="question-open"
                  onClick={() => onStudy(filters, q)}
                >
                  <h3>{plainText(q.statement)}</h3>
                </button>
                <div className="chips">
                  {classifications
                    .filter((c) =>
                      ["subject", "topic", "notebook"].includes(c.kind),
                    )
                    .slice(0, 4)
                    .map((c) => (
                      <span className="chip subtle" key={c.id}>
                        {c.name}
                      </span>
                    ))}
                  {q.error_count > 0 && (
                    <span className="badge amber">
                      {q.error_count} {q.error_count === 1 ? "erro" : "erros"}
                    </span>
                  )}
                  {q.last_correct === true && q.error_count > 0 && (
                    <span className="badge green">Acertou na última</span>
                  )}
                </div>
                <div className="question-list-footer">
                  <span className="small muted">
                    {q.attempt_count
                      ? `${q.attempt_count} respostas · `
                      : "Ainda não respondida · "}
                    {q.next_review_at
                      ? `Revisão ${dateTime(q.next_review_at)}`
                      : "Sem revisão agendada"}
                  </span>
                  <div className="button-row">
                    <button
                      className={`icon-button ${q.favorite ? "favorite" : ""}`}
                      aria-label={
                        q.favorite ? "Remover favorita" : "Favoritar questão"
                      }
                      onClick={async () => {
                        try {
                          await api.updateQuestion(q.id, {
                            favorite: !q.favorite,
                          });
                          questions.reload();
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      <Star
                        size={17}
                        fill={q.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Editar questão"
                      onClick={() => onEdit(q)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Arquivar questão"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Arquivar esta questão? Seu histórico será preservado.",
                          )
                        )
                          return;
                        try {
                          await api.updateQuestion(q.id, {
                            status: "archived",
                          });
                          questions.reload();
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      <Archive size={17} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => onStudy(filters, q)}
                    >
                      Resolver
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          <Pagination
            page={filters.page ?? 1}
            total={questions.data.total}
            onChange={(page) => setFilters({ ...filters, page })}
          />
        </div>
      )}
    </div>
  );
}
