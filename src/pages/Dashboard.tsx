import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flame,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import type { Catalog, Filters } from "../domain/types";
import {
  ErrorBox,
  Loading,
  PageTitle,
  duration,
  useLoad,
} from "../components/ui";
export function DashboardPage({
  catalogs,
  onStudy,
  onQuestions,
  onImport,
  refresh,
}: {
  catalogs: Catalog[];
  onStudy: (f: Filters) => void;
  onQuestions: () => void;
  onImport: () => void;
  refresh: number;
}) {
  const [filters, setFilters] = useState<Filters>({ days: 7 });
  const stats = useLoad(
    () => api.dashboard(filters),
    [JSON.stringify(filters), refresh],
  );
  const data = stats.data;
  const accuracy = data?.today.answered
    ? Math.round((data.today.correct / data.today.answered) * 100)
    : 0;
  const peak = Math.max(1, ...(data?.daily.map((d) => d.answered) ?? []));
  const due = data?.due ?? 0;
  return (
    <div className="page dashboard">
      <PageTitle
        eyebrow="UM PASSO DE CADA VEZ"
        title="Seu estudo, em perspectiva."
        description={new Date().toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        actions={
          <>
            <select
              aria-label="Filtrar dashboard por projeto"
              value={filters.project_id ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  project_id: e.target.value || undefined,
                })
              }
            >
              <option value="">Todos os projetos</option>
              {catalogs
                .filter((c) => c.kind === "project" && !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Filtrar dashboard por caderno"
              value={filters.notebook_id ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  notebook_id: e.target.value || undefined,
                })
              }
            >
              <option value="">Todos os cadernos</option>
              {catalogs
                .filter((c) => c.kind === "notebook" && !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </>
        }
      />
      <div className="quick-filters">
        <select
          aria-label="Período do dashboard"
          value={filters.days}
          onChange={(e) =>
            setFilters({ ...filters, days: Number(e.target.value) })
          }
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        {(["subject", "board"] as const).map((kind) => (
          <select
            key={kind}
            aria-label={
              kind === "subject" ? "Matéria do dashboard" : "Banca do dashboard"
            }
            value={
              filters.catalog_ids?.find((id) =>
                catalogs.some((c) => c.id === id && c.kind === kind),
              ) ?? ""
            }
            onChange={(e) =>
              setFilters({
                ...filters,
                catalog_ids: [
                  ...(filters.catalog_ids ?? []).filter(
                    (id) =>
                      !catalogs.some((c) => c.id === id && c.kind === kind),
                  ),
                  ...(e.target.value ? [e.target.value] : []),
                ],
              })
            }
          >
            <option value="">
              {kind === "subject" ? "Todas as matérias" : "Todas as bancas"}
            </option>
            {catalogs
              .filter((c) => c.kind === kind && !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        ))}
      </div>
      <ErrorBox error={stats.error} retry={stats.reload} />
      {stats.loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <section className="focus-banner">
              <div>
                <div className="eyebrow">SEU PRÓXIMO PASSO</div>
                <h2>
                  {due
                    ? `${due.toLocaleString("pt-BR")} ${due === 1 ? "questão espera" : "questões esperam"} por você.`
                    : data.total_questions
                      ? "Sua revisão está em dia."
                      : "Toda conquista começa com uma questão."}
                </h2>
                <p>
                  {due
                    ? "Revisar no momento certo ajuda a transformar estudo em memória."
                    : data.total_questions
                      ? "Aproveite para explorar novas questões e continuar aprendendo."
                      : "Organize seu acervo e comece a construir uma rotina de estudo."}
                </p>
                <button
                  className="button light"
                  onClick={() =>
                    data.total_questions
                      ? onStudy({ ...filters, mode: due ? "due" : "new" })
                      : onImport()
                  }
                >
                  {data.total_questions
                    ? due
                      ? "Começar revisão"
                      : "Estudar novas questões"
                    : "Importar minhas questões"}
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="focus-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <div className="focus-number">
                  {due ? (
                    <>
                      <strong>{due}</strong>
                      <span>para revisar</span>
                    </>
                  ) : (
                    <Layers size={54} strokeWidth={1} />
                  )}
                </div>
              </div>
            </section>
            <div className="section-heading today-heading">
              <h2>O seu dia até agora</h2>
              <span className="muted small">Atualizado com suas respostas</span>
            </div>
            <section className="metric-grid">
              <div className="metric">
                <div>
                  <Layers size={18} />
                  <span>Respondidas</span>
                </div>
                <strong>{data.today.answered}</strong>
                <small>
                  {data.today.correct} acertos · {data.today.incorrect} erros
                </small>
              </div>
              <div className="metric">
                <div>
                  <Target size={18} />
                  <span>Aproveitamento</span>
                </div>
                <strong>
                  {accuracy}
                  <span>%</span>
                </strong>
                <small>
                  {data.today.answered
                    ? "das questões respondidas hoje"
                    : "Responda para acompanhar"}
                </small>
              </div>
              <div className="metric">
                <div>
                  <Clock3 size={18} />
                  <span>Tempo de estudo</span>
                </div>
                <strong className="time-metric">
                  {duration(data.today.elapsed_ms)}
                </strong>
                <small>tempo decorrido até responder</small>
              </div>
              <div className="metric">
                <div>
                  <CheckCircle2 size={18} />
                  <span>Revisões feitas</span>
                </div>
                <strong>{data.today.reviewed}</strong>
                <small>{data.overdue} atrasadas no momento</small>
              </div>
            </section>
            <div className="dashboard-grid">
              <section className="panel chart-panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">CONSTÂNCIA CONTA</div>
                    <h2>Seu ritmo de estudo</h2>
                  </div>
                  <span className="badge">
                    Últimos {data.daily.length || 7} dias
                  </span>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />
                    Respondidas
                  </span>
                  <span>
                    <i />
                    Acertos
                  </span>
                </div>
                <div
                  className="activity-chart"
                  role="img"
                  aria-label={`Questões respondidas por dia: ${data.daily.map((d) => `${d.date}: ${d.answered} respondidas, ${d.correct} acertos`).join("; ")}`}
                >
                  {data.daily.slice(-30).map((d) => (
                    <div
                      className="chart-column"
                      key={d.date}
                      title={`${d.date}: ${d.answered} respondidas · ${d.correct} acertos`}
                    >
                      <div className="bar-space">
                        <div
                          className="bar-total"
                          style={{
                            height: `${Math.max(1, (d.answered / peak) * 100)}%`,
                          }}
                        >
                          <div
                            className="bar-correct"
                            style={{
                              height: `${d.answered ? (d.correct / d.answered) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span>
                        {new Date(`${d.date}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                          { day: "2-digit", month: "2-digit" },
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {!data.daily.some((d) => d.answered) && (
                  <p className="chart-empty">
                    Sua primeira resposta dá início a esta história.
                  </p>
                )}
              </section>
              <section className="panel weak-panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">REVISÃO COM PROPÓSITO</div>
                    <h2>Onde colocar atenção</h2>
                  </div>
                  <TrendingUp size={20} />
                </div>
                {data.weak_subjects.length ? (
                  data.weak_subjects.slice(0, 5).map((s) => (
                    <div className="weak-row" key={s.name}>
                      <div>
                        <strong>{s.name}</strong>
                        <span>{s.answered} respostas</span>
                      </div>
                      <b>
                        {Math.round(
                          (s.correct / Math.max(1, s.answered)) * 100,
                        )}
                        %
                      </b>
                      <div className="performance-track">
                        <span
                          style={{
                            width: `${(s.correct / Math.max(1, s.answered)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="quiet-empty">
                    <Target size={30} />
                    <p>
                      Depois de algumas respostas, você verá aqui as matérias
                      que merecem mais atenção.
                    </p>
                  </div>
                )}
                <button
                  className="text-button"
                  onClick={() => onStudy({ ...filters, mode: "errors" })}
                >
                  Revisar meus erros
                  <ArrowRight size={16} />
                </button>
              </section>
            </div>
            <div className="dashboard-bottom">
              <section className="panel forecast-panel">
                <div className="section-heading">
                  <h2>Próximas revisões</h2>
                  <span className="small muted">Agendadas por você</span>
                </div>
                <div className="forecast-list">
                  {data.forecast.slice(0, 7).map((d) => (
                    <div key={d.date}>
                      <span>
                        {new Date(`${d.date}T12:00:00`).toLocaleDateString(
                          "pt-BR",
                          { weekday: "short", day: "numeric" },
                        )}
                      </span>
                      <strong>{d.count}</strong>
                    </div>
                  ))}
                </div>
                {!data.forecast.length && (
                  <p className="muted">
                    Escolha um intervalo após responder para começar a programar
                    revisões.
                  </p>
                )}
              </section>
              <button className="bank-link" onClick={onQuestions}>
                <Flame size={24} />
                <span>
                  <strong>
                    {data.total_questions.toLocaleString("pt-BR")} questões no
                    seu acervo
                  </strong>
                  <small>
                    {data.new_questions.toLocaleString("pt-BR")} ainda para
                    descobrir
                  </small>
                </span>
                <ArrowRight size={21} />
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}
