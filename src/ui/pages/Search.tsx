import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { SearchHit } from "../../domain/types";
import { BLOCK_TYPE_LABELS } from "../../domain/template";
import { dedupeByEntry, groupByMonth, groupByTopic } from "../../search/fts";
import { useSettings } from "../../state/hooks";
import { HitList } from "../components/HitList";
import { SearchFilters } from "../search/SearchFilters";
import { activeFilterCount, readSearchState, writeSearchState, type SearchState } from "../search/params";
import { useSearch } from "../search/useSearch";
import "../search/search.css";

/** Example queries from the brief. One is shown as the placeholder; all appear as suggestions. */
const PLACEHOLDERS = ["career", "Times I felt uncertain about changing jobs", "When did I first start questioning…"];

const SUGGESTIONS = [
  "career",
  "Los Angeles",
  "friendship",
  "Times I felt uncertain about changing jobs",
  "What have I written about loneliness?",
  "When did I first start questioning",
  "What did I say about this decision last summer?",
];

/** Rotate the placeholder across visits rather than animating it. */
let placeholderVisits = 0;

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

function convictionPill(h: SearchHit) {
  if (h.kind !== "conviction") return null;
  return (
    <div className="search-hit-pill">
      <span className="pill">{h.blockType === "decision" ? "Decision" : "Conviction"}</span>
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readSearchState(params), [params]);
  const [settings] = useSettings();
  const aiEnabled = settings.ai.enabled;

  const [draft, setDraft] = useState(state.q);
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(state) > 0);
  const [placeholder] = useState(() => PLACEHOLDERS[placeholderVisits++ % PLACEHOLDERS.length]);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPushed = useRef(state.q);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<number | null>(null);

  const commit = (next: SearchState) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    lastPushed.current = next.q;
    setParams(writeSearchState(next), { replace: true });
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const scheduleQuery = (q: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commitRef.current({ ...stateRef.current, q: q.trim() }), 250);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // External navigation (sidebar link, bookmark, back button) updates the draft; our own pushes do not.
  useEffect(() => {
    if (state.q !== lastPushed.current) {
      lastPushed.current = state.q;
      setDraft(state.q);
    }
  }, [state.q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !isEditable(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === "Escape" && (e.target === inputRef.current || !isEditable(e.target))) {
        setDraft("");
        commitRef.current({ ...stateRef.current, q: "" });
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const result = useSearch(state, aiEnabled);
  const deduped = useMemo(() => dedupeByEntry(result.hits), [result.hits]);
  const shown = state.showAll ? result.hits : deduped;
  const groups = useMemo(() => (state.group === "topic" ? groupByTopic(shown, BLOCK_TYPE_LABELS) : groupByMonth(shown)), [shown, state.group]);
  const filterCount = activeFilterCount(state);
  const semanticOn = aiEnabled && state.mode === "semantic";

  const fill = (q: string) => {
    setDraft(q);
    commit({ ...state, q });
    inputRef.current?.focus();
  };

  let status: string | null = null;
  if (state.q) {
    if (result.loading) status = "Searching by meaning…";
    else {
      const n = shown.length;
      const noun = state.showAll ? (n === 1 ? "match" : "matches") : n === 1 ? "result" : "results";
      const by = result.answered === "semantic" ? "by meaning" : "by keyword";
      status = result.fellBack ? `Showing keyword results — local AI unavailable · ${n} ${noun}` : `${n} ${noun} ${by}`;
    }
  }

  return (
    <div className="page search-page">
      <input
        ref={inputRef}
        type="text"
        className="input input-quiet search-input"
        placeholder={placeholder}
        value={draft}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-label="Search your journal"
        onChange={(e) => {
          setDraft(e.target.value);
          scheduleQuery(e.target.value);
        }}
      />

      <div className="search-toolbar">
        <div className="row">
          {aiEnabled && (
            <div className="seg" role="group" aria-label="Search mode">
              <button type="button" aria-pressed={!semanticOn} onClick={() => commit({ ...state, mode: "keyword" })}>
                Keywords
              </button>
              <span className="seg-sep">|</span>
              <button type="button" aria-pressed={semanticOn} onClick={() => commit({ ...state, mode: "semantic" })}>
                Meaning
              </button>
            </div>
          )}
          <button type="button" className="btn btn-quiet btn-sm" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            Filters{filterCount > 0 ? ` · ${filterCount}` : ""}
          </button>
        </div>
        {state.q && result.hits.length > 0 && (
          <div className="row">
            <div className="seg" role="group" aria-label="Group results">
              <button type="button" aria-pressed={state.group === "date"} onClick={() => commit({ ...state, group: "date" })}>
                By month
              </button>
              <span className="seg-sep">|</span>
              <button type="button" aria-pressed={state.group === "topic"} onClick={() => commit({ ...state, group: "topic" })}>
                By section
              </button>
            </div>
            {(result.hits.length > deduped.length || state.showAll) && (
              <label className="filter-check">
                <input type="checkbox" checked={state.showAll} onChange={(e) => commit({ ...state, showAll: e.target.checked })} />
                Show every match
              </label>
            )}
          </div>
        )}
      </div>

      {filtersOpen && <SearchFilters state={state} onChange={commit} />}

      {status && (
        <div className="search-status faint small" aria-live="polite">
          {status}
        </div>
      )}

      {!state.q && (
        <div className="search-suggestions">
          <div className="label">Try asking</div>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="search-suggestion" onClick={() => fill(s)}>
              {s}
            </button>
          ))}
          <div className="faint small search-hint">
            Press <kbd>/</kbd> to search from anywhere on this page. Quoted phrases match exactly.
          </div>
        </div>
      )}

      {state.q && !result.loading && shown.length === 0 && (
        <div className="empty search-empty">
          <div>Nothing matched “{state.q}”.</div>
          <div className="faint small search-empty-hints">
            {aiEnabled && !semanticOn && !result.fellBack ? (
              <>
                Try fewer words, or{" "}
                <button type="button" className="btn-link" onClick={() => commit({ ...state, mode: "semantic" })}>
                  search by meaning
                </button>
                .
              </>
            ) : (
              "Try fewer words or a different phrasing."
            )}
            {filterCount > 0 && (
              <>
                {" "}
                <button type="button" className="btn-link" onClick={() => setFiltersOpen(true)}>
                  Loosen the filters
                </button>
                .
              </>
            )}
          </div>
        </div>
      )}

      {shown.length > 0 &&
        groups.map((g) => (
          <section key={g.key} className="search-group">
            <div className="label search-group-label">
              {g.label}
              <span className="search-group-count">{g.hits.length}</span>
            </div>
            <HitList hits={g.hits} trailing={convictionPill} />
          </section>
        ))}

      {state.q && aiEnabled && !result.loading && (
        <div className="search-ask faint small">
          <Link to={`/ask?q=${encodeURIComponent(state.q)}`}>Ask my journal about this →</Link>
        </div>
      )}
    </div>
  );
}
