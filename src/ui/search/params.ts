import type { BlockType, ISODate, SearchFilters } from "../../domain/types";
import { addMonths, todayISO } from "../../domain/dates";

export type SearchMode = "keyword" | "semantic";
export type SearchGrouping = "date" | "topic";
export type ConvictionScope = "include" | "only" | "exclude";

/** Everything about a search lives in the URL so a search can be bookmarked or shared. */
export interface SearchState {
  q: string;
  mode: SearchMode;
  group: SearchGrouping;
  /** Show every matching block instead of one hit per entry. */
  showAll: boolean;
  from: ISODate | "";
  to: ISODate | "";
  types: BlockType[];
  tags: string[];
  favorites: boolean;
  convictions: ConvictionScope;
}

/** Entry sections offered as filters. Convictions have their own scope control. */
export const FILTER_BLOCK_TYPES: readonly BlockType[] = ["freewrite", "reflection", "sleep", "gratitude", "reading", "prayer", "action", "generic"];

export const DEFAULT_SEARCH_STATE: SearchState = {
  q: "",
  mode: "keyword",
  group: "date",
  showAll: false,
  from: "",
  to: "",
  types: [],
  tags: [],
  favorites: false,
  convictions: "include",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readList(v: string | null): string[] {
  if (!v) return [];
  const seen = new Set<string>();
  for (const part of v.split(",")) {
    const t = part.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

export function readSearchState(params: URLSearchParams): SearchState {
  const mode = params.get("mode");
  const group = params.get("group");
  const conv = params.get("conv");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const types = readList(params.get("types")).filter((t): t is BlockType => (FILTER_BLOCK_TYPES as readonly string[]).includes(t));
  return {
    q: (params.get("q") ?? "").trim(),
    mode: mode === "semantic" ? "semantic" : "keyword",
    group: group === "topic" ? "topic" : "date",
    showAll: params.get("all") === "1",
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    types,
    tags: readList(params.get("tags")),
    favorites: params.get("fav") === "1",
    convictions: conv === "only" || conv === "exclude" ? conv : "include",
  };
}

/** Serialise only what differs from the defaults so URLs stay short. */
export function writeSearchState(s: SearchState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.mode !== "keyword") p.set("mode", s.mode);
  if (s.group !== "date") p.set("group", s.group);
  if (s.showAll) p.set("all", "1");
  if (s.from) p.set("from", s.from);
  if (s.to) p.set("to", s.to);
  if (s.types.length > 0) p.set("types", s.types.join(","));
  if (s.tags.length > 0) p.set("tags", s.tags.join(","));
  if (s.favorites) p.set("fav", "1");
  if (s.convictions !== "include") p.set("conv", s.convictions);
  return p;
}

/** Number of filter dimensions in use, shown on the "Filters" toggle. */
export function activeFilterCount(s: SearchState): number {
  let n = 0;
  if (s.from || s.to) n++;
  if (s.types.length > 0) n++;
  if (s.tags.length > 0) n++;
  if (s.favorites) n++;
  if (s.convictions !== "include") n++;
  return n;
}

export function clearFilters(s: SearchState): SearchState {
  return { ...s, from: "", to: "", types: [], tags: [], favorites: false, convictions: "include" };
}

/**
 * Filters passed to `keywordSearch`/`semanticSearch`. The "only convictions" scope is
 * not expressible there (both flags set means neither table is queried), so callers
 * request convictions alongside entries and drop the block hits afterwards.
 */
export function toFilters(s: SearchState): SearchFilters {
  const f: SearchFilters = {};
  if (s.from) f.from = s.from;
  if (s.to) f.to = s.to;
  if (s.types.length > 0) f.blockTypes = s.types;
  if (s.tags.length > 0) f.tags = s.tags;
  if (s.favorites) f.favoritesOnly = true;
  if (s.convictions === "exclude") f.entriesOnly = true;
  else f.includeConvictions = true;
  return f;
}

export interface DatePreset {
  key: string;
  label: string;
  from: ISODate | "";
}

export function datePresets(today: ISODate = todayISO()): DatePreset[] {
  return [
    { key: "month", label: "Past month", from: addMonths(today, -1) },
    { key: "year", label: "Past year", from: addMonths(today, -12) },
    { key: "all", label: "All time", from: "" },
  ];
}
