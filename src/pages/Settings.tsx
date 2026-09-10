import { useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Download,
  GripVertical,
  Moon,
  Pencil,
  Plus,
  Save,
  Sun,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { Catalog, CatalogKind, Interval, Policy } from "../domain/types";
import {
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageTitle,
  Spinner,
  downloadJson,
  errorText,
  kindLabels,
  useLoad,
} from "../components/ui";
type PolicyDraft = Omit<Policy, "id"> & { id?: string };
export function Settings({
  catalogs,
  onRefresh,
  dark,
  onDark,
}: {
  catalogs: Catalog[];
  onRefresh: () => void;
  dark: boolean;
  onDark: () => void;
}) {
  const [tab, setTab] = useState("repetition");
  const [kind, setKind] = useState<CatalogKind>("project");
  const [editCatalog, setEditCatalog] = useState<Partial<Catalog>>();
  const [draft, setDraft] = useState<PolicyDraft>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dragged, setDragged] = useState<number>();
  const [notice, setNotice] = useState("");
  const policies = useLoad(() => api.policies(), []);
  const patch = (p: Partial<PolicyDraft>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));
  const intervalPatch = (index: number, p: Partial<Interval>) =>
    patch({
      intervals: draft!.intervals.map((a, i) =>
        i === index ? { ...a, ...p } : a,
      ),
    });
  const move = (from: number, to: number) => {
    if (!draft || to < 0 || to >= draft.intervals.length) return;
    const next = [...draft.intervals];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch({ intervals: next.map((i, p) => ({ ...i, position: p })) });
  };
  const savePolicy = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      if (!draft.name.trim()) throw new Error("Dê um nome à política.");
      if (draft.scope !== "global" && !draft.target_id)
        throw new Error("Selecione o destino da política.");
      if (
        draft.intervals.some(
          (i) => !i.label.trim() || !Number.isInteger(i.value) || i.value <= 0,
        )
      )
        throw new Error(
          "Cada intervalo precisa de nome e valor inteiro maior que zero.",
        );
      await api.savePolicy({
        ...draft,
        target_id: draft.scope === "global" ? null : draft.target_id,
        intervals: draft.intervals.map((i, p) => ({ ...i, position: p })),
      });
      setDraft(undefined);
      policies.reload();
      setNotice(
        "Política salva. Revisões anteriores mantiveram seus intervalos.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveCatalog = async () => {
    if (!editCatalog) return;
    setBusy(true);
    setError("");
    try {
      if (!editCatalog.name?.trim()) throw new Error("Informe um nome.");
      await api.saveCatalog({
        ...editCatalog,
        kind: editCatalog.kind ?? kind,
        name: editCatalog.name.trim(),
      });
      setEditCatalog(undefined);
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const catalogAction = async (
    c: Catalog,
    action: "archive" | "delete" | "up" | "down",
  ) => {
    if (
      action === "delete" &&
      !window.confirm(
        `Excluir “${c.name}”? Somente itens sem vínculos podem ser excluídos. Para manter os vínculos, use Arquivar.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (action === "delete") await api.deleteCatalog(c.id);
      else if (action === "archive")
        await api.archiveCatalog(c.id, !c.archived);
      else {
        const list = catalogs
          .filter((i) => i.kind === kind && (showArchived || !i.archived))
          .sort((a, b) => a.position - b.position);
        const index = list.findIndex((i) => i.id === c.id);
        const destination = index + (action === "up" ? -1 : 1);
        if (index >= 0 && destination >= 0 && destination < list.length) {
          list.splice(destination, 0, ...list.splice(index, 1));
          for (const [position, item] of list.entries()) {
            if (item.position !== position)
              await api.saveCatalog({ ...item, position });
          }
        }
      }
      onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <PageTitle
        eyebrow="DO SEU JEITO"
        title="Configurações"
        description="Uma estrutura simples para o seu ritmo de estudo."
      />
      <div className="settings-tabs tab-row">
        <button
          className={tab === "repetition" ? "active" : ""}
          onClick={() => setTab("repetition")}
        >
          Repetição espaçada
        </button>
        <button
          className={tab === "catalogs" ? "active" : ""}
          onClick={() => setTab("catalogs")}
        >
          Organização
        </button>
        <button
          className={tab === "backup" ? "active" : ""}
          onClick={() => setTab("backup")}
        >
          Backup e preferências
        </button>
      </div>
      <ErrorBox error={error} />
      {notice && (
        <div className="success-box" role="status">
          {notice}
        </div>
      )}
      {tab === "repetition" && (
        <>
          <section className="policy-intro">
            <div>
              <div className="eyebrow">INTERVALOS MANUAIS</div>
              <h2>Você escolhe quando voltar.</h2>
              <p>
                Cada botão soma seu intervalo à data e hora da resposta. A
                configuração mais específica prevalece.
              </p>
              <div className="inheritance">
                <span>Global</span>
                <b>→</b>
                <span>Projeto</span>
                <b>→</b>
                <span>Caderno</span>
                <b>→</b>
                <span>Questão</span>
              </div>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setDraft({
                  scope: "global",
                  target_id: null,
                  name: "",
                  intervals: [],
                });
              }}
            >
              <Plus size={17} />
              Criar política
            </button>
          </section>
          {policies.loading ? (
            <Loading />
          ) : policies.error ? (
            <ErrorBox error={policies.error} retry={policies.reload} />
          ) : !policies.data?.length ? (
            <Empty
              title="Defina seus primeiros intervalos"
              text="Crie uma política global e adicione os botões que deseja ver após cada resposta."
            />
          ) : (
            <div className="policies-list">
              {policies.data.map((p) => (
                <section className="panel policy-card" key={p.id}>
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">
                        {
                          {
                            global: "PADRÃO GLOBAL",
                            project: "PROJETO",
                            notebook: "CADERNO",
                            question: "QUESTÃO",
                          }[p.scope]
                        }
                      </div>
                      <h3>{p.name}</h3>
                      {p.target_id && (
                        <p className="small muted">
                          {catalogs.find((c) => c.id === p.target_id)?.name ??
                            p.target_id}
                        </p>
                      )}
                    </div>
                    <div className="button-row">
                      <button
                        className="icon-button"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => {
                          setError("");
                          setDraft(structuredClone(p));
                        }}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir política ${p.name}`}
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Excluir a política “${p.name}”? A herança será usada nas próximas respostas; revisões agendadas serão preservadas.`,
                            )
                          )
                            return;
                          setBusy(true);
                          try {
                            await api.deletePolicy(p.id);
                            policies.reload();
                          } catch (e) {
                            setError(errorText(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="policy-intervals">
                    {p.intervals
                      .sort((a, b) => a.position - b.position)
                      .map((i) => (
                        <span key={i.id} className={i.active ? "" : "inactive"}>
                          {i.label}
                          <small>
                            {i.value}{" "}
                            {i.unit === "day"
                              ? "dia(s)"
                              : i.unit === "hour"
                                ? "hora(s)"
                                : "minuto(s)"}
                            {!i.active ? " · inativo" : ""}
                          </small>
                        </span>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          <p className="small muted policy-footnote">
            Editar ou excluir botões não altera agendamentos passados. O
            histórico guarda o intervalo escolhido naquele momento.
          </p>
        </>
      )}
      {tab === "catalogs" && (
        <div className="catalog-layout">
          <nav className="catalog-nav" aria-label="Tipos de classificação">
            {Object.entries(kindLabels).map(([k, label]) => (
              <button
                key={k}
                className={kind === k ? "active" : ""}
                onClick={() => setKind(k as CatalogKind)}
              >
                {label}
                <span>
                  {catalogs.filter((c) => c.kind === k && !c.archived).length}
                </span>
              </button>
            ))}
          </nav>
          <section className="panel form-section">
            <div className="section-heading">
              <h2>{kindLabels[kind]}</h2>
              <button
                className="button primary"
                onClick={() => {
                  setError("");
                  setEditCatalog({
                    kind,
                    name: "",
                    parent_id: null,
                    position: catalogs.filter((c) => c.kind === kind).length,
                    archived: false,
                  });
                }}
              >
                <Plus size={17} />
                Adicionar
              </button>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Mostrar arquivados
            </label>
            <div className="catalog-list">
              {catalogs
                .filter((c) => c.kind === kind && (showArchived || !c.archived))
                .sort((a, b) => a.position - b.position)
                .map((c, i, all) => (
                  <div
                    className={`catalog-row ${c.archived ? "archived" : ""}`}
                    key={c.id}
                  >
                    <div>
                      <strong>{c.name}</strong>
                      {c.parent_id && (
                        <span className="small muted">
                          {catalogs.find((p) => p.id === c.parent_id)?.name}
                        </span>
                      )}
                      {c.archived && <span className="badge">Arquivado</span>}
                    </div>
                    <div className="button-row">
                      <button
                        className="icon-button"
                        title="Mover para cima"
                        aria-label={`Mover ${c.name} para cima`}
                        disabled={busy || i === 0}
                        onClick={() => catalogAction(c, "up")}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        title="Mover para baixo"
                        aria-label={`Mover ${c.name} para baixo`}
                        disabled={busy || i === all.length - 1}
                        onClick={() => catalogAction(c, "down")}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        title="Editar"
                        aria-label={`Editar ${c.name}`}
                        onClick={() => {
                          setError("");
                          setEditCatalog({ ...c });
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        title={c.archived ? "Reativar" : "Arquivar"}
                        aria-label={`${c.archived ? "Reativar" : "Arquivar"} ${c.name}`}
                        disabled={busy}
                        onClick={() => catalogAction(c, "archive")}
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        title="Excluir"
                        aria-label={`Excluir ${c.name}`}
                        disabled={busy}
                        onClick={() => catalogAction(c, "delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            {!catalogs.some(
              (c) => c.kind === kind && (showArchived || !c.archived),
            ) && (
              <Empty
                title={`Seus ${kindLabels[kind].toLowerCase()} começam aqui`}
                text="Adicione um item para classificar suas questões e filtrar seus estudos."
              />
            )}
          </section>
        </div>
      )}
      {tab === "backup" && (
        <div className="settings-cards">
          <section className="panel form-section">
            <Download size={26} />
            <h2>Seus dados continuam seus.</h2>
            <p className="muted">
              Exporte questões, classificações, políticas, tentativas e revisões
              em JSON. Guarde uma cópia em um local de sua confiança.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  downloadJson(
                    await api.exportData(),
                    `estudoslp-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  );
                  setNotice(
                    "Exportação concluída. Confira o arquivo nos downloads do navegador.",
                  );
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner /> : <Download size={17} />}Exportar todos os
              dados
            </button>
          </section>
          <section className="panel form-section">
            {dark ? <Moon size={26} /> : <Sun size={26} />}
            <h2>Aparência</h2>
            <p className="muted">
              Escolha o conforto de leitura deste dispositivo.
            </p>
            <button className="button secondary" onClick={onDark}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}Usar tema{" "}
              {dark ? "claro" : "escuro"}
            </button>
          </section>
        </div>
      )}
      {editCatalog && (
        <Modal
          title={
            editCatalog.id ? "Editar classificação" : "Adicionar classificação"
          }
          onClose={() => setEditCatalog(undefined)}
        >
          <div className="form-section">
            <ErrorBox error={error} />
            <label>
              Nome
              <input
                autoFocus
                value={editCatalog.name ?? ""}
                onChange={(e) =>
                  setEditCatalog({ ...editCatalog, name: e.target.value })
                }
              />
            </label>
            <label>
              Vinculado a (opcional)
              <select
                value={editCatalog.parent_id ?? ""}
                onChange={(e) =>
                  setEditCatalog({
                    ...editCatalog,
                    parent_id: e.target.value || null,
                  })
                }
              >
                <option value="">Sem vínculo</option>
                {catalogs
                  .filter(
                    (c) =>
                      c.id !== editCatalog.id &&
                      !c.archived &&
                      c.kind ===
                        (
                          {
                            notebook: "project",
                            topic: "subject",
                            subtopic: "topic",
                          } as Record<string, string>
                        )[editCatalog.kind ?? kind],
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {kindLabels[c.kind]} · {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="form-footer">
              <button
                className="button secondary"
                onClick={() => setEditCatalog(undefined)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={busy || !editCatalog.name?.trim()}
                onClick={saveCatalog}
              >
                {busy ? <Spinner /> : <Save size={17} />}Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {draft && (
        <Modal
          wide
          title={draft.id ? "Editar política" : "Criar política de repetição"}
          onClose={() => setDraft(undefined)}
        >
          <div className="form-section">
            <ErrorBox error={error} />
            <div className="form-grid">
              <label>
                Nome da política
                <input
                  value={draft.name}
                  autoFocus
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label>
                Aplicar em
                <select
                  value={draft.scope}
                  onChange={(e) =>
                    patch({
                      scope: e.target.value as Policy["scope"],
                      target_id: null,
                    })
                  }
                >
                  <option value="global">Global (padrão)</option>
                  <option value="project">Projeto</option>
                  <option value="notebook">Caderno</option>
                  <option value="question">Questão específica</option>
                </select>
              </label>
            </div>
            {draft.scope === "question" ? (
              <label>
                ID interno da questão
                <input
                  value={draft.target_id ?? ""}
                  onChange={(e) => patch({ target_id: e.target.value })}
                  placeholder="UUID exibido na edição da questão"
                />
              </label>
            ) : (
              draft.scope !== "global" && (
                <label>
                  {draft.scope === "project" ? "Projeto" : "Caderno"}
                  <select
                    value={draft.target_id ?? ""}
                    onChange={(e) =>
                      patch({ target_id: e.target.value || null })
                    }
                  >
                    <option value="">Selecione</option>
                    {catalogs
                      .filter((c) => c.kind === draft.scope && !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )
            )}
            <h3>Botões de intervalo</h3>
            <p className="small muted">
              Arraste para reorganizar ou use as setas. O primeiro botão aparece
              à esquerda na revisão.
            </p>
            <div className="interval-edit-list">
              {draft.intervals.map((item, i) => (
                <div
                  className="interval-edit-row"
                  key={item.id}
                  draggable
                  onDragStart={() => setDragged(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragged !== undefined) move(dragged, i);
                    setDragged(undefined);
                  }}
                >
                  <GripVertical size={17} className="drag-handle" />
                  <label>
                    <span>Nome</span>
                    <input
                      value={item.label}
                      onChange={(e) =>
                        intervalPatch(i, { label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Valor</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={item.value}
                      onChange={(e) =>
                        intervalPatch(i, { value: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Unidade</span>
                    <select
                      value={item.unit}
                      onChange={(e) =>
                        intervalPatch(i, {
                          unit: e.target.value as Interval["unit"],
                        })
                      }
                    >
                      <option value="minute">Minutos</option>
                      <option value="hour">Horas</option>
                      <option value="day">Dias</option>
                    </select>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) =>
                        intervalPatch(i, { active: e.target.checked })
                      }
                    />
                    Ativo
                  </label>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label={`Mover ${item.label} para cima`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Mover ${item.label} para baixo`}
                      disabled={i === draft.intervals.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="icon-button danger-text"
                      aria-label={`Excluir intervalo ${item.label}`}
                      onClick={() =>
                        patch({
                          intervals: draft.intervals.filter((_, j) => i !== j),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="button secondary"
              onClick={() =>
                patch({
                  intervals: [
                    ...draft.intervals,
                    {
                      id: crypto.randomUUID(),
                      label: "Novo intervalo",
                      value: 1,
                      unit: "day",
                      position: draft.intervals.length,
                      active: true,
                    },
                  ],
                })
              }
            >
              <Plus size={17} />
              Adicionar botão
            </button>
            <div className="form-footer">
              <span className="small muted">
                Agendamentos anteriores serão preservados.
              </span>
              <button
                className="button primary"
                disabled={busy}
                onClick={savePolicy}
              >
                {busy ? <Spinner /> : <Save size={17} />}Salvar política
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
