import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  History,
  Pause,
  Play,
  Star,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  Attempt,
  Catalog,
  Filters,
  Interval,
  Question,
} from "../domain/types";
import { RichText, RichEditor } from "../components/RichEditor";
import {
  Empty,
  ErrorBox,
  Loading,
  Spinner,
  dateTime,
  duration,
  errorText,
  useLoad,
} from "../components/ui";
import { plainText } from "../domain/content";

export function Study({
  initialQuestion,
  filters,
  catalogs,
  onBack,
  onHistory,
  onSettings,
  onRefresh,
}: {
  initialQuestion?: Question;
  filters: Filters;
  catalogs: Catalog[];
  onBack: () => void;
  onHistory: (id: string) => void;
  onSettings: () => void;
  onRefresh: () => void;
}) {
  const queue = useLoad(
    () =>
      initialQuestion
        ? Promise.resolve({ items: [initialQuestion], total: 1 })
        : api.questions({ ...filters, page: 1, page_size: 50, sort: "due" }),
    [initialQuestion?.id, JSON.stringify(filters)],
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [attempt, setAttempt] = useState<Attempt>();
  const [scheduled, setScheduled] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [reviewVersion, setReviewVersion] = useState(0);
  const question = queue.data?.items[index];
  const policy = useLoad(
    () =>
      question
        ? api.resolvePolicy(question.id, filters)
        : Promise.resolve(null),
    [question?.id, filters.project_id, filters.notebook_id],
  );
  const started = useRef(performance.now());
  const answerRequest = useRef(crypto.randomUUID());
  const scheduleRequest = useRef(crypto.randomUUID());
  const intervalChoice = useRef<string | undefined>(undefined);
  const answerPayload = useRef<{ choice: string; elapsed: number } | undefined>(
    undefined,
  );
  useEffect(() => {
    setSelected("");
    setAttempt(undefined);
    setScheduled(undefined);
    setError("");
    setNotesOpen(false);
    setNotes(question?.notes ?? "");
    setReviewVersion(question?.schedule_version ?? 0);
    started.current = performance.now();
    answerRequest.current = crypto.randomUUID();
    scheduleRequest.current = crypto.randomUUID();
    intervalChoice.current = undefined;
    answerPayload.current = undefined;
  }, [question?.id]);
  const answer = async () => {
    if (!question || !selected || busy || attempt) return;
    setBusy(true);
    setError("");
    try {
      answerPayload.current ??= {
        choice: selected,
        elapsed: Math.min(
          86400000,
          Math.round(performance.now() - started.current),
        ),
      };
      const a = await api.answer(
        question.id,
        answerPayload.current.choice,
        answerPayload.current.elapsed,
        { project_id: filters.project_id, notebook_id: filters.notebook_id },
        answerRequest.current,
      );
      setAttempt(a);
      setReviewVersion(a.schedule_version);
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const schedule = async (interval: Interval) => {
    if (!attempt || busy || scheduled) return;
    setBusy(true);
    setError("");
    if (intervalChoice.current !== interval.id) {
      scheduleRequest.current = crypto.randomUUID();
      intervalChoice.current = interval.id;
    }
    try {
      const event = await api.schedule(
        attempt.id,
        interval.id,
        reviewVersion,
        scheduleRequest.current,
      );
      setScheduled(event.next_review_at ?? "");
      setReviewVersion(event.schedule_version);
      queue.setData(
        (current) =>
          current && {
            ...current,
            items: current.items.map((item) =>
              item.id === event.question_id
                ? {
                    ...item,
                    next_review_at: event.next_review_at,
                    review_status: "active",
                    schedule_version: event.schedule_version,
                  }
                : item,
            ),
          },
      );
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const next = () => {
    if (!scheduled || busy) return;
    setDone((n) => n + 1);
    if (queue.data && index + 1 < queue.data.items.length)
      setIndex((i) => i + 1);
    else setIndex((i) => i + 1);
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest(
          'input,textarea,select,button,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (!question || busy) return;
      const key = e.key.toUpperCase();
      if (
        !attempt &&
        !answerPayload.current &&
        question.alternatives.some((a) => a.key === key)
      ) {
        e.preventDefault();
        setSelected(key);
      } else if (e.key === "Enter") {
        if (attempt && scheduled) {
          e.preventDefault();
          next();
        } else if (!attempt && selected) {
          e.preventDefault();
          void answer();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  });
  const manage = async (
    action: "reschedule" | "suspend" | "activate" | "remove",
  ) => {
    if (!question) return;
    if (
      action === "remove" &&
      !window.confirm(
        "Remover esta questão da repetição? O histórico será preservado.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const nextDate =
        action === "reschedule" ? new Date(manualDate).toISOString() : null;
      const event = await api.manageReview(
        question.id,
        action,
        nextDate,
        reviewVersion,
      );
      queue.setData(
        (current) =>
          current && {
            ...current,
            items: current.items.map((item) =>
              item.id === question.id
                ? {
                    ...item,
                    next_review_at: event.next_review_at,
                    review_status:
                      action === "remove"
                        ? "removed"
                        : action === "suspend"
                          ? "suspended"
                          : "active",
                    schedule_version: event.schedule_version,
                  }
                : item,
            ),
          },
      );
      setReviewVersion(event.schedule_version);
      onRefresh();
      setError("");
      window.alert(
        action === "reschedule"
          ? "Revisão reagendada."
          : "Situação da revisão atualizada.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (queue.loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (queue.error)
    return (
      <div className="page">
        <ErrorBox error={queue.error} retry={queue.reload} />
      </div>
    );
  if (!question)
    return (
      <div className="page">
        <Empty
          title={done ? "Sessão concluída" : "Sua fila está em dia"}
          text={
            done
              ? `Você concluiu ${done} ${done === 1 ? "questão" : "questões"}. Cada escolha de intervalo já está salva.`
              : "Nenhuma questão corresponde aos filtros desta sessão."
          }
          action={
            <button className="button primary" onClick={onBack}>
              Voltar aos estudos
            </button>
          }
        />
      </div>
    );
  const names = (kind: string) =>
    catalogs
      .filter((c) => c.kind === kind && question.catalog_ids?.includes(c.id))
      .map((c) => c.name);
  const board = names("board")[0] ?? question.board;
  const subject = names("subject")[0] ?? question.subject;
  return (
    <div className="page study-page">
      <div className="study-topline">
        <button
          className="text-button"
          onClick={() => {
            if (
              attempt &&
              !scheduled &&
              !window.confirm(
                "A resposta já foi salva, mas a próxima revisão ainda não foi escolhida. Sair?",
              )
            )
              return;
            onBack();
          }}
        >
          <ArrowLeft size={16} />
          Encerrar sessão
        </button>
        <span>
          {index + 1} de {queue.data?.items.length} nesta sessão (até 50)
        </span>
        <span className="study-keyboard">A–E selecionar · Enter confirmar</span>
      </div>
      <div className="study-progress">
        <span
          style={{
            width: `${(index / (queue.data?.items.length ?? 1)) * 100}%`,
          }}
        />
      </div>
      <article className="study-card">
        <div className="question-meta">
          <div>
            <div className="eyebrow">
              {[
                board,
                question.year,
                names("organization")[0] ?? question.organization,
              ]
                .filter(Boolean)
                .join(" · ") || question.source}
            </div>
            <div className="subject-line">
              {subject || "Questão sem matéria"}
              {(names("topic")[0] ?? question.topic) && (
                <span> / {names("topic")[0] ?? question.topic}</span>
              )}
            </div>
          </div>
          <button
            className={`icon-button ${question.favorite ? "favorite" : ""}`}
            title="Favoritar"
            aria-label={question.favorite ? "Remover favorita" : "Favoritar"}
            onClick={async () => {
              try {
                const updated = await api.updateQuestion(question.id, {
                  favorite: !question.favorite,
                });
                queue.setData((data) =>
                  data
                    ? {
                        ...data,
                        items: data.items.map((q) =>
                          q.id === updated.id ? updated : q,
                        ),
                      }
                    : data,
                );
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <Star
              size={21}
              fill={question.favorite ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="question-id">
          QUESTÃO #{question.external_id || question.id.slice(0, 8)}
        </div>
        <RichText html={question.statement} className="statement" />
        <div className="answers" role="radiogroup" aria-label="Sua resposta">
          {question.alternatives.map((a) => {
            const right = attempt && a.key === attempt.correct_answer;
            const wrong =
              attempt && a.key === attempt.answer && !attempt.is_correct;
            return (
              <button
                key={a.key}
                role="radio"
                aria-checked={selected === a.key}
                disabled={!!attempt || busy || !!answerPayload.current}
                className={`answer-option ${selected === a.key ? "chosen" : ""} ${right ? "correct" : ""} ${wrong ? "incorrect" : ""}`}
                onClick={() => setSelected(a.key)}
              >
                <span className="answer-letter">
                  {right ? (
                    <Check size={18} />
                  ) : wrong ? (
                    <XCircle size={18} />
                  ) : (
                    a.key
                  )}
                </span>
                <RichText html={a.text} />
              </button>
            );
          })}
        </div>
        <ErrorBox error={error} />
        {!attempt ? (
          <div className="answer-footer">
            <span className="muted small">
              Selecione uma alternativa para responder.
            </span>
            <button
              className="button primary"
              disabled={!selected || busy}
              onClick={answer}
            >
              {busy ? <Spinner /> : <Check size={18} />}Responder
            </button>
          </div>
        ) : (
          <section className="answer-result">
            <div
              className={`result-heading ${attempt.is_correct ? "correct" : "incorrect"}`}
            >
              {attempt.is_correct ? (
                <CheckCircle2 size={23} />
              ) : (
                <XCircle size={23} />
              )}
              <div>
                <h2>
                  {attempt.is_correct
                    ? "Você acertou. Bom trabalho!"
                    : "Um ponto para revisar."}
                </h2>
                <p>
                  Sua resposta: <strong>{attempt.answer}</strong> · Gabarito:{" "}
                  <strong>{attempt.correct_answer}</strong> ·{" "}
                  {duration(attempt.elapsed_ms)}
                </p>
              </div>
            </div>
            {plainText(question.general_explanation) && (
              <div className="general-explanation">
                <h3>Entenda a resposta</h3>
                <RichText html={question.general_explanation} />
              </div>
            )}
            <div className="explanation-list">
              {question.alternatives.map((a) => (
                <div key={a.key} className="explanation-item">
                  <span
                    className={`explanation-letter ${a.key === attempt.correct_answer ? "right" : ""}`}
                  >
                    {a.key === attempt.correct_answer ? (
                      <Check size={16} />
                    ) : (
                      a.key
                    )}
                  </span>
                  <div>
                    <strong>
                      Alternativa {a.key}
                      {a.key === attempt.correct_answer ? " · Correta" : ""}
                    </strong>
                    {plainText(a.explanation) ? (
                      <RichText html={a.explanation} />
                    ) : (
                      <p className="muted small">
                        Sem explicação cadastrada para esta alternativa.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="review-picker">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">SEU INTERVALO, SUA ESCOLHA</div>
                  <h3>Quando revisar novamente?</h3>
                </div>
                <Clock3 size={23} />
              </div>
              <p className="small muted">
                {policy.data
                  ? `Política: ${policy.data.name} · contagem a partir desta resposta.`
                  : "Defina os intervalos nas configurações para programar a revisão."}
              </p>
              <ErrorBox error={policy.error} retry={policy.reload} />
              {policy.loading ? (
                <Spinner />
              ) : policy.data?.intervals.some((i) => i.active) ? (
                <div className="interval-buttons">
                  {policy.data.intervals
                    .filter((i) => i.active)
                    .sort((a, b) => a.position - b.position)
                    .map((i) => (
                      <button
                        className={`interval-button ${scheduled && intervalChoice.current === i.id ? "selected" : ""}`}
                        key={i.id}
                        disabled={busy || !!scheduled}
                        onClick={() => schedule(i)}
                      >
                        {i.label}
                        <span>
                          {i.value}{" "}
                          {i.unit === "day"
                            ? "dia(s)"
                            : i.unit === "hour"
                              ? "hora(s)"
                              : "minuto(s)"}
                        </span>
                      </button>
                    ))}
                </div>
              ) : (
                <button className="button secondary" onClick={onSettings}>
                  Configurar intervalos
                </button>
              )}
              {scheduled && (
                <div className="schedule-success" role="status">
                  <CheckCircle2 size={17} />
                  Próxima revisão: {dateTime(scheduled)}
                </div>
              )}
            </div>
            <div className="answer-footer">
              <span className="small muted">
                {scheduled
                  ? "Resposta e revisão salvas."
                  : "Escolha um intervalo para continuar."}
              </span>
              <button
                className="button primary"
                disabled={!scheduled || busy}
                onClick={next}
              >
                Próxima questão
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}
      </article>
      <div className="study-secondary">
        <button
          className="text-button"
          onClick={() => setNotesOpen(!notesOpen)}
        >
          Minhas anotações
        </button>
        <button className="text-button" onClick={() => onHistory(question.id)}>
          <History size={16} />
          Histórico desta questão
        </button>
        <details>
          <summary>Gerenciar revisão</summary>
          <div className="manage-review">
            <p className="small muted">
              Agenda atual: {dateTime(question.next_review_at)} ·{" "}
              {question.review_status === "suspended"
                ? "suspensa"
                : question.review_status === "removed"
                  ? "removida"
                  : "ativa"}
            </p>
            <div className="inline-form">
              <input
                aria-label="Data e hora da próxima revisão"
                type="datetime-local"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
              <button
                className="button secondary"
                disabled={!manualDate || busy || (!!attempt && !scheduled)}
                onClick={() => manage("reschedule")}
              >
                Reagendar
              </button>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                disabled={busy || (!!attempt && !scheduled)}
                onClick={() => manage("suspend")}
              >
                <Pause size={15} />
                Suspender
              </button>
              <button
                className="button secondary"
                disabled={busy || (!!attempt && !scheduled)}
                onClick={() => manage("activate")}
              >
                <Play size={15} />
                Reativar / inserir
              </button>
              <button
                className="button danger"
                disabled={busy || (!!attempt && !scheduled)}
                onClick={() => manage("remove")}
              >
                Remover da repetição
              </button>
            </div>
          </div>
        </details>
      </div>
      {notesOpen && (
        <section className="panel form-section">
          <h3>Minhas anotações</h3>
          <RichEditor
            label="Anotações pessoais"
            value={notes}
            onChange={setNotes}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.saveQuestion({ ...question, notes }, question.id);
                setNotesOpen(false);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar anotações
          </button>
        </section>
      )}
    </div>
  );
}
