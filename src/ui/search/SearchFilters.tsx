import type { BlockType } from "../../domain/types";
import { BLOCK_TYPE_LABELS } from "../../domain/template";
import { todayISO } from "../../domain/dates";
import { useQuery } from "../../state/hooks";
import type { ConvictionScope, SearchState } from "./params";
import { FILTER_BLOCK_TYPES, activeFilterCount, clearFilters, datePresets } from "./params";

const CONVICTION_SCOPES: { key: ConvictionScope; label: string }[] = [
  { key: "include", label: "Include" },
  { key: "only", label: "Only" },
  { key: "exclude", label: "Exclude" },
];

export function SearchFilters({ state, onChange }: { state: SearchState; onChange: (next: SearchState) => void }) {
  const tags = useQuery((j) => j.entries.allTags(), [], ["entries"]);
  const today = todayISO();
  const presets = datePresets(today);
  const activePreset = presets.find((p) => p.from === state.from && (p.from === "" ? state.to === "" : state.to === "" || state.to === today));

  const toggleType = (t: BlockType) => {
    const types = state.types.includes(t) ? state.types.filter((x) => x !== t) : [...state.types, t];
    onChange({ ...state, types });
  };
  const toggleTag = (name: string) => {
    const next = state.tags.includes(name) ? state.tags.filter((x) => x !== name) : [...state.tags, name];
    onChange({ ...state, tags: next });
  };

  return (
    <div className="search-filters" role="group" aria-label="Search filters">
      <div className="filter-row">
        <div className="label">Dates</div>
        <div className="filter-options">
          <label className="filter-date-field">
            <span className="faint small">from</span>
            <input type="date" className="input input-quiet filter-date" value={state.from} max={state.to || undefined} onChange={(e) => onChange({ ...state, from: e.target.value })} />
          </label>
          <label className="filter-date-field">
            <span className="faint small">to</span>
            <input type="date" className="input input-quiet filter-date" value={state.to} min={state.from || undefined} onChange={(e) => onChange({ ...state, to: e.target.value })} />
          </label>
          <div className="seg" role="group" aria-label="Date presets">
            {presets.map((p) => (
              <button key={p.key} type="button" aria-pressed={activePreset?.key === p.key} onClick={() => onChange({ ...state, from: p.from, to: "" })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="filter-row">
        <div className="label">Sections</div>
        <div className="filter-options">
          {FILTER_BLOCK_TYPES.map((t) => (
            <label key={t} className="filter-check">
              <input type="checkbox" checked={state.types.includes(t)} onChange={() => toggleType(t)} />
              {BLOCK_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <div className="label">Tags</div>
        <div className="filter-options">
          {tags.length === 0 && <span className="faint small">No tags yet.</span>}
          {tags.map((t) => (
            <button key={t.name} type="button" className={`pill pill-toggle${state.tags.includes(t.name) ? " pill-accent" : ""}`} aria-pressed={state.tags.includes(t.name)} onClick={() => toggleTag(t.name)}>
              {t.name}
              <span className="pill-count">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <div className="label">Convictions</div>
        <div className="filter-options">
          <div className="seg" role="group" aria-label="Conviction scope">
            {CONVICTION_SCOPES.map((s) => (
              <button key={s.key} type="button" aria-pressed={state.convictions === s.key} onClick={() => onChange({ ...state, convictions: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
          <label className="filter-check">
            <input type="checkbox" checked={state.favorites} onChange={(e) => onChange({ ...state, favorites: e.target.checked })} />
            Favorites only
          </label>
        </div>
      </div>

      {activeFilterCount(state) > 0 && (
        <div className="filter-row">
          <div />
          <div>
            <button type="button" className="btn-link small" onClick={() => onChange(clearFilters(state))}>
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
