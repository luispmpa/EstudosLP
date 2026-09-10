import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import type { Catalog, Filters } from "../domain/types";
import { kindLabels } from "./ui";
export function FiltersBar({
  filters,
  onChange,
  catalogs,
  search = true,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  catalogs: Catalog[];
  search?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const patch = (p: Partial<Filters>) =>
    onChange({ ...filters, ...p, page: 1 });
  return (
    <div className="filters-panel">
      {search && (
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            patch({ query: String(d.get("query") ?? "") });
          }}
        >
          <div className="search-field">
            <Search size={18} />
            <input
              name="query"
              key={filters.query}
              defaultValue={filters.query}
              placeholder="Pesquisar enunciado, alternativas, explicações ou ID…"
              aria-label="Pesquisar questões"
            />
          </div>
          <button className="button secondary" type="submit">
            Buscar
          </button>
          <button
            className={`button secondary ${expanded ? "selected" : ""}`}
            type="button"
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={17} />
            <span>Filtros</span>
            {(filters.catalog_ids?.length ?? 0) > 0 && (
              <span className="count-dot">{filters.catalog_ids?.length}</span>
            )}
          </button>
        </form>
      )}
      <div className="quick-filters">
        <select
          aria-label="Projeto"
          value={filters.project_id ?? ""}
          onChange={(e) => patch({ project_id: e.target.value || undefined })}
        >
          <option value="">Todos os projetos</option>
          {catalogs
            .filter((c) => c.kind === "project" && !c.archived)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Caderno"
          value={filters.notebook_id ?? ""}
          onChange={(e) => patch({ notebook_id: e.target.value || undefined })}
        >
          <option value="">Todos os cadernos</option>
          {catalogs
            .filter((c) => c.kind === "notebook" && !c.archived)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Situação da questão"
          value={filters.mode ?? "all"}
          onChange={(e) => patch({ mode: e.target.value as Filters["mode"] })}
        >
          <option value="all">Todas as questões</option>
          <option value="due">Revisões vencidas</option>
          <option value="new">Nunca respondidas</option>
          <option value="errors">Já errei</option>
          <option value="recurring">Erro recorrente</option>
          <option value="recovered">Acertei depois de errar</option>
        </select>
        <label className="check-label">
          <input
            type="checkbox"
            checked={filters.favorite ?? false}
            onChange={(e) => patch({ favorite: e.target.checked || undefined })}
          />
          Favoritas
        </label>
      </div>
      {(expanded || !search) && (
        <div className="advanced-filters">
          <div className="form-grid">
            <label>
              Ano a partir de
              <input
                type="number"
                value={filters.year_min ?? ""}
                onChange={(e) =>
                  patch({
                    year_min: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label>
              Ano até
              <input
                type="number"
                value={filters.year_max ?? ""}
                onChange={(e) =>
                  patch({
                    year_max: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
          </div>
          <label>
            Classificações combinadas
            <select
              aria-label="Adicionar classificação ao filtro"
              value=""
              onChange={(e) => {
                if (e.target.value)
                  patch({
                    catalog_ids: [
                      ...new Set([
                        ...(filters.catalog_ids ?? []),
                        e.target.value,
                      ]),
                    ],
                  });
              }}
            >
              <option value="">Adicionar matéria, assunto, tag, banca…</option>
              {Object.entries(kindLabels)
                .filter(([kind]) => !["project", "notebook"].includes(kind))
                .map(([kind, label]) => (
                  <optgroup label={label} key={kind}>
                    {catalogs
                      .filter((c) => c.kind === kind && !c.archived)
                      .map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <div className="chips">
            {filters.catalog_ids?.map((id) => (
              <button
                className="chip"
                key={id}
                onClick={() =>
                  patch({
                    catalog_ids: filters.catalog_ids?.filter((i) => i !== id),
                  })
                }
              >
                {catalogs.find((c) => c.id === id)?.name ?? id}
                <X size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
