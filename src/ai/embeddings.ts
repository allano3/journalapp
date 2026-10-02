import type { Journal } from "../storage/db";
import { chunkText } from "../domain/chunking";
import { markdownToPlain, textHash } from "../domain/text";
import { embed, ollamaStatus } from "./ollama";
import { changes } from "../state/events";

/**
 * Keeps the local semantic index in step with the journal. Runs only when AI is enabled
 * and Ollama is reachable; otherwise it is inert and keyword search carries the app.
 */

export interface IndexProgress {
  running: boolean;
  total: number;
  done: number;
  error: string | null;
  /** Last successful full pass. */
  lastRunAt: string | null;
}

let progress: IndexProgress = { running: false, total: 0, done: 0, error: null, lastRunAt: null };
const progressListeners = new Set<(p: IndexProgress) => void>();
let scheduled: ReturnType<typeof setTimeout> | null = null;
let runningPromise: Promise<void> | null = null;

function setProgress(p: Partial<IndexProgress>): void {
  progress = { ...progress, ...p };
  for (const l of progressListeners) l(progress);
}

export function indexProgress(): IndexProgress {
  return progress;
}

export function onIndexProgress(l: (p: IndexProgress) => void): () => void {
  progressListeners.add(l);
  return () => {
    progressListeners.delete(l);
  };
}

/** Embed a query string with the configured model. Null when AI is off or Ollama is unreachable. */
export async function embedQuery(j: Journal, text: string): Promise<Float32Array | null> {
  const s = j.settings.get().ai;
  if (!s.enabled) return null;
  try {
    const [v] = await embed(s, [text]);
    return v ?? null;
  } catch {
    return null;
  }
}

interface Pending {
  ownerType: "block" | "conviction";
  ownerId: string;
  text: string;
  hash: string;
}

function collectPending(j: Journal, model: string): { pending: Pending[]; stale: { ownerType: "block" | "conviction"; ownerId: string }[] } {
  const pending: Pending[] = [];
  const stale: { ownerType: "block" | "conviction"; ownerId: string }[] = [];

  const blockHashes = j.embeddings.indexedHashes("block", model);
  const liveBlocks = new Set<string>();
  for (const b of j.db.all<{ id: string; content: string }>("SELECT id, content FROM blocks")) {
    liveBlocks.add(b.id);
    const plain = markdownToPlain(b.content);
    if (plain.length < 20) {
      if (blockHashes[b.id]) stale.push({ ownerType: "block", ownerId: b.id });
      continue;
    }
    const h = textHash(plain);
    if (blockHashes[b.id] !== h) pending.push({ ownerType: "block", ownerId: b.id, text: b.content, hash: h });
  }
  for (const id of Object.keys(blockHashes)) if (!liveBlocks.has(id)) stale.push({ ownerType: "block", ownerId: id });

  const convHashes = j.embeddings.indexedHashes("conviction", model);
  const liveConv = new Set<string>();
  for (const c of j.db.all<{ id: string; statement: string; context: string; reasoning: string; evidence: string; uncertainties: string; change_triggers: string; next_action: string }>(
    "SELECT c.id, v.statement, v.context, v.reasoning, v.evidence, v.uncertainties, v.change_triggers, v.next_action FROM convictions c JOIN conviction_versions v ON v.id = c.current_version_id",
  )) {
    liveConv.add(c.id);
    const text = [c.statement, c.context, c.reasoning, c.evidence, c.uncertainties, c.change_triggers, c.next_action].filter((s) => s.trim().length > 0).join("\n");
    if (text.length < 10) continue;
    const h = textHash(text);
    if (convHashes[c.id] !== h) pending.push({ ownerType: "conviction", ownerId: c.id, text, hash: h });
  }
  for (const id of Object.keys(convHashes)) if (!liveConv.has(id)) stale.push({ ownerType: "conviction", ownerId: id });

  return { pending, stale };
}

/** Bring the index up to date. Safe to call often; concurrent calls share one run. */
export function syncIndex(j: Journal): Promise<void> {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const s = j.settings.get().ai;
    if (!s.enabled) return;
    const status = await ollamaStatus(s);
    if (!status.reachable) {
      setProgress({ running: false, error: `Ollama unreachable at ${s.ollamaUrl}` });
      return;
    }
    const { pending, stale } = collectPending(j, s.embeddingModel);
    for (const st of stale) j.embeddings.remove(st.ownerType, st.ownerId);
    if (pending.length === 0) {
      setProgress({ running: false, total: 0, done: 0, error: null, lastRunAt: new Date().toISOString() });
      if (stale.length > 0) changes.emit("embeddings");
      return;
    }
    setProgress({ running: true, total: pending.length, done: 0, error: null });
    try {
      const BATCH = 8;
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const chunked = batch.map((p) => ({ p, chunks: chunkText(p.text) }));
        const texts = chunked.flatMap((c) => c.chunks.map((ch) => ch.text));
        const vectors = await embed(s, texts);
        let vi = 0;
        for (const c of chunked) {
          const rows = c.chunks.map((ch) => ({ index: ch.index, text: ch.text, vector: vectors[vi++] }));
          j.embeddings.replace(c.p.ownerType, c.p.ownerId, s.embeddingModel, c.p.hash, rows);
        }
        setProgress({ done: Math.min(pending.length, i + BATCH) });
      }
      setProgress({ running: false, error: null, lastRunAt: new Date().toISOString() });
      changes.emit("embeddings");
    } catch (e) {
      setProgress({ running: false, error: e instanceof Error ? e.message : String(e) });
    }
  })().finally(() => {
    runningPromise = null;
  });
  return runningPromise;
}

/** Debounced re-index; called by the app shell on entry/conviction changes. */
export function scheduleIndexSync(j: Journal, delayMs = 4000): void {
  if (!j.settings.get().ai.enabled) return;
  clearTimeout(scheduled ?? undefined);
  scheduled = setTimeout(() => void syncIndex(j), delayMs);
}
