import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { EntryKind } from "../../domain/types";
import { useQuery } from "../../state/hooks";
import { EntryList } from "./EntryList";

const PAGE = 50;

type KindFilter = "all" | EntryKind | "favorites";

const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "note", label: "Notes" },
  { key: "favorites", label: "Favorites" },
];

function readKindFilter(params: URLSearchParams): KindFilter {
  if (params.get("fav") === "1") return "favorites";
  const kind = params.get("kind");
  return kind === "daily" || kind === "note" ? kind : "all";
}

/**
 * Every entry, newest first, grouped by month. Filters live in the query string
 * (`kind=daily|note`, `fav=1`, `tag=<name>`) so a filtered view can be bookmarked
 * and survives navigating into an entry and back.
 */
export function Timeline() {
  const [params, setParams] = useSearchParams();
  const kindFilter = readKindFilter(params);
  const tag = params.get("tag") ?? "";
  // Pagination resets whenever the filters change; keyed state avoids a stale first render.
  const filterKey = `${kindFilter}|${tag}`;
  const [paging, setPaging] = useState({ key: filterKey, pages: 1 });
  const pages = paging.key === filterKey ? paging.pages : 1;

  const tags = useQuery((j) => j.entries.allTags(), [], ["entries"]);
  const limit = PAGE * pages;
  const rows = useQuery(
    (j) =>
      j.entries.list({
        kind: kindFilter === "daily" || kindFilter === "note" ? kindFilter : undefined,
        favoritesOnly: kindFilter === "favorites",
        tag: tag || undefined,
        limit: limit + 1,
        offset: 0,
      }),
    [kindFilter, tag, limit],
    ["entries"],
  );
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;

  const setFilter = (next: KindFilter) => {
    const p = new URLSearchParams(params);
    p.delete("kind");
    p.delete("fav");
    if (next === "favorites") p.set("fav", "1");
    else if (next !== "all") p.set("kind", next);
    setParams(p, { replace: true });
  };
  const setTag = (next: string) => {
    const p = new URLSearchParams(params);
    if (next) p.set("tag", next);
    else p.delete("tag");
    setParams(p, { replace: true });
  };

  const filtered = kindFilter !== "all" || tag !== "";
  const emptyText = filtered ? "No entries match these filters." : "No entries yet. Your writing will appear here.";

  return (
    <section aria-label="Timeline">
      <div className="journal-filters">
        {KIND_FILTERS.map((f) => (
          <button key={f.key} type="button" className="btn btn-quiet btn-sm" aria-pressed={kindFilter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        {tags.length > 0 && (
          <select className="select" aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.count})
              </option>
            ))}
          </select>
        )}
      </div>
      <EntryList entries={entries} byMonth emptyText={emptyText} />
      {hasMore && (
        <div className="journal-more">
          <button type="button" className="btn btn-quiet" onClick={() => setPaging({ key: filterKey, pages: pages + 1 })}>
            Show more
          </button>
        </div>
      )}
    </section>
  );
}
