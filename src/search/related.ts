import type { Journal } from "../storage/db";
import type { Conviction, ISODate, SearchHit } from "../domain/types";
import { keyTerms } from "../domain/text";
import { addDays } from "../domain/dates";
import { dedupeByEntry, keywordSearch } from "./fts";
import { semanticSearch } from "./semantic";

export interface RelatedOptions {
  /** Only entries strictly after this date (used for "later entries" on a conviction). */
  after?: ISODate;
  /** Only entries strictly before this date. */
  before?: ISODate;
  excludeEntryId?: string;
  limit?: number;
}

/**
 * Entries related to a passage of text. Uses the semantic index when available and
 * falls back to a keyword OR-query built from the passage's significant terms.
 * Returns one hit per entry, best match first, with `method` reported for the UI.
 */
export async function relatedEntries(j: Journal, text: string, opts: RelatedOptions = {}): Promise<{ hits: SearchHit[]; method: "semantic" | "keyword" }> {
  const limit = opts.limit ?? 8;
  const filters = { from: opts.after ? addDays(opts.after, 1) : undefined, to: opts.before ? addDays(opts.before, -1) : undefined, entriesOnly: true as const };
  const semantic = text.trim().length > 0 ? await semanticSearch(j, text, { ...filters, limit: limit * 3, minScore: 0.4 }) : null;
  if (semantic) {
    return { hits: dedupeByEntry(semantic).filter((h) => h.entryId !== opts.excludeEntryId).slice(0, limit), method: "semantic" };
  }
  const terms = keyTerms(text, 10);
  if (terms.length === 0) return { hits: [], method: "keyword" };
  const hits = keywordSearch(j, terms.join(" "), { ...filters, mode: "or", limit: limit * 4 });
  return { hits: dedupeByEntry(hits).filter((h) => h.entryId !== opts.excludeEntryId).slice(0, limit), method: "keyword" };
}

/** Later journal entries that touch the subject of a conviction, oldest first (so the evolution reads chronologically). */
export async function laterEntriesForConviction(j: Journal, c: Conviction, limit = 12): Promise<{ hits: SearchHit[]; method: "semantic" | "keyword" }> {
  const v = c.current;
  const passage = [v.statement, v.context, v.reasoning, v.nextAction].filter((s) => s.trim().length > 0).join("\n");
  const since = c.createdAt.slice(0, 10);
  const { hits, method } = await relatedEntries(j, passage, { after: since, excludeEntryId: c.sourceEntryId ?? undefined, limit });
  const linked = c.linkedEntryIds.filter((id) => !hits.some((h) => h.entryId === id));
  for (const id of linked) {
    const s = j.entries.summary(id);
    if (!s) continue;
    hits.push({
      kind: "block",
      id: s.id,
      entryId: s.id,
      blockId: null,
      blockType: null,
      date: s.entryDate,
      title: s.title,
      snippet: s.preview,
      score: 1,
      tags: s.tags,
      favorite: s.favorite,
    });
  }
  hits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { hits, method };
}

/**
 * Active convictions whose subject overlaps the given text — used by the editor's
 * contextual sidebar to show "you previously wrote something about this".
 */
export async function convictionsRelatedToText(j: Journal, text: string, limit = 4): Promise<SearchHit[]> {
  if (text.trim().length < 40) return [];
  const semantic = await semanticSearch(j, text, { includeConvictions: true, limit: limit * 3, minScore: 0.45 });
  const hits = semantic
    ? semantic.filter((h) => h.kind === "conviction")
    : keywordSearch(j, keyTerms(text, 10).join(" "), { includeConvictions: true, mode: "or", limit: 50 }).filter((h) => h.kind === "conviction");
  return hits.slice(0, limit);
}
