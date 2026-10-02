import type { Journal } from "../storage/db";
import type { BlockType, SearchFilters, SearchHit } from "../domain/types";
import { cosine } from "../domain/similarity";
import { truncate } from "../domain/text";
import { embedQuery } from "../ai/embeddings";

/**
 * Semantic search over the local embedding index. Requires Ollama; callers fall back
 * to keyword search when `embedQuery` returns null (AI disabled or unreachable).
 */
export async function semanticSearch(j: Journal, query: string, opts: SearchFilters & { limit?: number; minScore?: number } = {}): Promise<SearchHit[] | null> {
  const settings = j.settings.get();
  if (!settings.ai.enabled) return null;
  const qv = await embedQuery(j, query);
  if (!qv) return null;
  const limit = opts.limit ?? 60;
  const minScore = opts.minScore ?? 0.35;

  const scored: { ownerType: "block" | "conviction"; ownerId: string; score: number; text: string }[] = [];
  const best: Record<string, number> = {};
  for (const e of j.embeddings.all(settings.ai.embeddingModel)) {
    const s = cosine(qv, e.vector);
    if (s < minScore) continue;
    const k = `${e.ownerType}:${e.ownerId}`;
    if (best[k] !== undefined && best[k] >= s) continue;
    best[k] = s;
    scored.push({ ownerType: e.ownerType, ownerId: e.ownerId, score: s, text: e.text });
  }
  const deduped = scored.filter((s) => best[`${s.ownerType}:${s.ownerId}`] === s.score).sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  for (const s of deduped) {
    if (hits.length >= limit) break;
    if (s.ownerType === "block") {
      const r = j.db.get<{ entry_id: string; type: string; entry_date: string; title: string; kind: string; favorite: number }>(
        "SELECT b.entry_id, b.type, e.entry_date, e.title, e.kind, e.favorite FROM blocks b JOIN entries e ON e.id = b.entry_id WHERE b.id = ?",
        [s.ownerId],
      );
      if (!r) continue;
      if (opts.from && r.entry_date < opts.from) continue;
      if (opts.to && r.entry_date > opts.to) continue;
      if (opts.blockTypes && opts.blockTypes.length > 0 && !opts.blockTypes.includes(r.type as BlockType)) continue;
      if (opts.favoritesOnly && r.favorite !== 1) continue;
      if (opts.tags && opts.tags.length > 0) {
        const n = j.db.get<{ n: number }>(
          `SELECT COUNT(*) n FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = ? AND t.name IN (${opts.tags.map(() => "?").join(",")})`,
          [r.entry_id, ...opts.tags],
        );
        if (!n || n.n === 0) continue;
      }
      hits.push({
        kind: "block",
        id: r.entry_id,
        entryId: r.entry_id,
        blockId: s.ownerId,
        blockType: r.type as BlockType,
        date: r.entry_date,
        title: r.title || (r.kind === "note" ? "Quick note" : ""),
        snippet: truncate(s.text.replace(/\s+/g, " "), 240),
        score: s.score,
        tags: [],
        favorite: r.favorite === 1,
      });
    } else {
      if (opts.entriesOnly || !opts.includeConvictions) continue;
      const r = j.db.get<{ id: string; created_at: string; kind: string; statement: string }>(
        "SELECT c.id, c.created_at, c.kind, v.statement FROM convictions c JOIN conviction_versions v ON v.id = c.current_version_id WHERE c.id = ?",
        [s.ownerId],
      );
      if (!r) continue;
      const d = r.created_at.slice(0, 10);
      if (opts.from && d < opts.from) continue;
      if (opts.to && d > opts.to) continue;
      hits.push({
        kind: "conviction",
        id: r.id,
        entryId: null,
        blockId: null,
        blockType: r.kind === "decision" ? "decision" : "conviction",
        date: d,
        title: truncate(r.statement, 120),
        snippet: truncate(s.text.replace(/\s+/g, " "), 240),
        score: s.score,
        tags: [],
        favorite: false,
      });
    }
  }
  return hits;
}
