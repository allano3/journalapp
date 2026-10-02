import type { Journal } from "../storage/db";
import type { AiArtifact, ConvictionKind } from "../domain/types";
import { BLOCK_TYPE_LABELS } from "../domain/template";
import { markdownToPlain, truncate } from "../domain/text";
import { changes } from "../state/events";
import { chat, type ChatMessage } from "./ollama";
import { SYSTEM_PROMPT } from "./prompts";

/** Payload stored as JSON in a `suggestion` artifact's content. */
export interface ConvictionSuggestion {
  statement: string;
  kind: ConvictionKind;
  quote: string;
  blockId: string | null;
}

const EXTRACT_INSTRUCTIONS = `Read the journal entry below. List up to 3 passages where the writer records a decision they have made or a conviction (a belief they state and seem to want to remember). Include only what the writer actually states; do not infer motives or invent positions. If there is nothing of the kind, respond with [].

Respond with JSON only — an array of objects with exactly these keys:
- "statement": one plain sentence in the writer's own voice, first person
- "kind": "decision" or "conviction"
- "quote": the exact sentence or sentences copied from the entry that the statement comes from`;

/** Parse the first JSON array in the model's reply, tolerating prose around it. */
export function parseSuggestions(raw: string): Omit<ConvictionSuggestion, "blockId">[] {
  const m = /\[[\s\S]*\]/.exec(raw);
  if (!m) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Omit<ConvictionSuggestion, "blockId">[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const statement = typeof r.statement === "string" ? r.statement.trim() : "";
    if (statement.length === 0) continue;
    out.push({
      statement: truncate(statement, 400),
      kind: r.kind === "decision" ? "decision" : "conviction",
      quote: typeof r.quote === "string" ? truncate(r.quote.trim(), 600) : "",
    });
    if (out.length === 3) break;
  }
  return out;
}

export function readSuggestion(a: AiArtifact): ConvictionSuggestion | null {
  try {
    const r = JSON.parse(a.content) as Partial<ConvictionSuggestion>;
    if (typeof r.statement !== "string") return null;
    return { statement: r.statement, kind: r.kind === "decision" ? "decision" : "conviction", quote: r.quote ?? "", blockId: r.blockId ?? null };
  } catch {
    return null;
  }
}

/**
 * Ask the model for candidate convictions/decisions in an entry. Replaces earlier
 * pending suggestions for the entry; dismissed ones stay dismissed and are not
 * re-proposed. Returns the stored pending artifacts.
 */
export async function suggestConvictions(j: Journal, entryId: string): Promise<AiArtifact[]> {
  const settings = j.settings.get().ai;
  const entry = j.entries.get(entryId);
  if (!entry) return [];
  const blocks = entry.blocks.map((b) => ({ id: b.id, type: b.type, plain: markdownToPlain(b.content) })).filter((b) => b.plain.length > 0);
  if (blocks.length === 0) return [];

  const body = blocks.map((b) => `[${BLOCK_TYPE_LABELS[b.type]}]\n${b.plain}`).join("\n\n");
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${EXTRACT_INSTRUCTIONS}\n\nJournal entry of ${entry.entryDate}:\n\n${truncate(body, 12_000)}` },
  ];
  const raw = await chat(settings, messages, { temperature: 0.1 });
  const found = parseSuggestions(raw);

  const dismissed = j.artifacts
    .forOwner("entry", entryId, "suggestion")
    .filter((a) => a.state === "dismissed")
    .map((a) => readSuggestion(a)?.statement.trim().toLowerCase() ?? "");

  j.db.run("DELETE FROM ai_artifacts WHERE owner_type = 'entry' AND owner_id = ? AND kind = 'suggestion' AND state = 'pending'", [entryId]);
  const stored: AiArtifact[] = [];
  for (const s of found) {
    if (dismissed.includes(s.statement.trim().toLowerCase())) continue;
    const needle = s.quote.slice(0, 40).toLowerCase();
    const block = needle.length > 0 ? blocks.find((b) => b.plain.toLowerCase().includes(needle)) : undefined;
    const payload: ConvictionSuggestion = { ...s, blockId: block?.id ?? blocks[0].id };
    stored.push(j.artifacts.add({ kind: "suggestion", ownerType: "entry", ownerId: entryId, model: settings.chatModel, content: JSON.stringify(payload) }));
  }
  if (stored.length === 0) changes.emit("ai");
  return stored;
}
