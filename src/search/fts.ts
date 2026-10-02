import type { Journal } from "../storage/db";
import type { BlockType, ISODate, SearchFilters, SearchGroup, SearchHit } from "../domain/types";
import { formatMonthYear, monthKey } from "../domain/dates";
import { markdownToPlain, truncate } from "../domain/text";

/**
 * Turn free text into an FTS5 MATCH expression. Quoted phrases stay phrases; other
 * words become prefix terms joined by implicit AND. Characters FTS5 treats as syntax
 * are stripped so a stray quote never throws.
 */
export function toMatchQuery(raw: string, mode: "and" | "or" = "and"): string {
  const phrases: string[] = [];
  const rest = raw.replace(/"([^"]+)"/g, (_, p: string) => {
    phrases.push(`"${p.replace(/"/g, "")}"`);
    return " ";
  });
  const words = rest
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, ""))
    .filter((w) => w.length > 0)
    .map((w) => `"${w}"*`);
  const terms = [...phrases, ...words];
  if (terms.length === 0) return "";
  return terms.join(mode === "and" ? " " : " OR ");
}

export const MARK_OPEN = "\u0001";
export const MARK_CLOSE = "\u0002";

function cleanSnippet(s: string): string {
  return markdownToPlain(s).replace(/\s+/g, " ").trim();
}

export interface KeywordSearchOptions extends SearchFilters {
  limit?: number;
  /** "and" (default) requires all words; "or" ranks any-match, used for related lookups. */
  mode?: "and" | "or";
}

/** Keyword search over blocks (and optionally convictions). Hits are ranked by bm25. */
export function keywordSearch(j: Journal, query: string, opts: KeywordSearchOptions = {}): SearchHit[] {
  const match = toMatchQuery(query, opts.mode ?? "and");
  if (match.length === 0) return [];
  const limit = opts.limit ?? 200;
  const hits: SearchHit[] = [];

  if (!opts.includeConvictions || !opts.entriesOnly) {
    const where: string[] = ["blocks_fts MATCH ?"];
    const params: (string | number)[] = [match];
    if (opts.from) {
      where.push("e.entry_date >= ?");
      params.push(opts.from);
    }
    if (opts.to) {
      where.push("e.entry_date <= ?");
      params.push(opts.to);
    }
    if (opts.blockTypes && opts.blockTypes.length > 0) {
      where.push(`b.type IN (${opts.blockTypes.map(() => "?").join(",")})`);
      params.push(...opts.blockTypes);
    }
    if (opts.favoritesOnly) where.push("e.favorite = 1");
    if (opts.tags && opts.tags.length > 0) {
      where.push(
        `e.id IN (SELECT et.entry_id FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name IN (${opts.tags.map(() => "?").join(",")}))`,
      );
      params.push(...opts.tags);
    }
    params.push(limit);
    const rows = j.db.all<{
      entry_id: string;
      block_id: string;
      type: string;
      entry_date: string;
      title: string;
      kind: string;
      favorite: number;
      snippet: string;
      score: number;
      content: string;
    }>(
      `SELECT b.entry_id, b.id AS block_id, b.type, e.entry_date, e.title, e.kind, e.favorite,
              snippet(blocks_fts, 0, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 24) AS snippet,
              bm25(blocks_fts) AS score, b.content
       FROM blocks_fts JOIN blocks b ON b.id = blocks_fts.block_id JOIN entries e ON e.id = b.entry_id
       WHERE ${where.join(" AND ")}
       ORDER BY score LIMIT ?`,
      params,
    );
    for (const r of rows) {
      hits.push({
        kind: "block",
        id: r.entry_id,
        entryId: r.entry_id,
        blockId: r.block_id,
        blockType: r.type as BlockType,
        date: r.entry_date,
        title: r.title || (r.kind === "note" ? "Quick note" : ""),
        snippet: cleanSnippet(r.snippet) || truncate(cleanSnippet(r.content), 200),
        score: -r.score,
        tags: [],
        favorite: r.favorite === 1,
      });
    }
  }

  if (opts.includeConvictions && !opts.entriesOnly) {
    const where: string[] = ["convictions_fts MATCH ?", "c.current_version_id = v.id"];
    const params: (string | number)[] = [match];
    if (opts.from) {
      where.push("substr(c.created_at, 1, 10) >= ?");
      params.push(opts.from);
    }
    if (opts.to) {
      where.push("substr(c.created_at, 1, 10) <= ?");
      params.push(opts.to);
    }
    params.push(limit);
    const rows = j.db.all<{ conviction_id: string; created_at: string; statement: string; snippet: string; score: number; kind: string }>(
      `SELECT c.id AS conviction_id, c.created_at, c.kind, v.statement,
              snippet(convictions_fts, 0, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 24) AS snippet, bm25(convictions_fts) AS score
       FROM convictions_fts JOIN conviction_versions v ON v.id = convictions_fts.version_id JOIN convictions c ON c.id = v.conviction_id
       WHERE ${where.join(" AND ")}
       ORDER BY score LIMIT ?`,
      params,
    );
    for (const r of rows) {
      hits.push({
        kind: "conviction",
        id: r.conviction_id,
        entryId: null,
        blockId: null,
        blockType: r.kind === "decision" ? "decision" : "conviction",
        date: r.created_at.slice(0, 10),
        title: truncate(r.statement, 120),
        snippet: cleanSnippet(r.snippet),
        score: -r.score,
        tags: [],
        favorite: false,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

/** Group hits by month (newest first), preserving rank order within each month. */
export function groupByMonth(hits: SearchHit[]): SearchGroup[] {
  const groups: Record<string, SearchGroup> = {};
  for (const h of hits) {
    const key = monthKey(h.date);
    (groups[key] ??= { key, label: formatMonthYear(h.date), hits: [] }).hits.push(h);
  }
  return Object.values(groups).sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** Group hits by the section/type they came from. */
export function groupByTopic(hits: SearchHit[], labels: Record<string, string>): SearchGroup[] {
  const groups: Record<string, SearchGroup> = {};
  for (const h of hits) {
    const key = h.blockType ?? "generic";
    (groups[key] ??= { key, label: labels[key] ?? key, hits: [] }).hits.push(h);
  }
  return Object.values(groups).sort((a, b) => b.hits.length - a.hits.length);
}

/** Collapse block-level hits so each entry appears once (best-ranked block wins). */
export function dedupeByEntry(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const k = h.kind === "block" ? `e:${h.entryId}` : `c:${h.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export interface DateRangePreset {
  label: string;
  from?: ISODate;
  to?: ISODate;
}
