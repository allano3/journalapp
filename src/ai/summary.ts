import type { Journal } from "../storage/db";
import type { AiArtifact } from "../domain/types";
import { BLOCK_TYPE_LABELS } from "../domain/template";
import { markdownToPlain, truncate } from "../domain/text";
import { chat, type ChatMessage } from "./ollama";
import { SYSTEM_PROMPT } from "./prompts";

/**
 * A three-to-four sentence restatement of one entry, in the "You wrote…" voice.
 * Streams through `onToken`; replaces any earlier summary of the entry. Resolves
 * null when the entry has no text to summarize.
 */
export async function summarizeEntry(j: Journal, entryId: string, onToken?: (delta: string, soFar: string) => void): Promise<AiArtifact | null> {
  const settings = j.settings.get().ai;
  const entry = j.entries.get(entryId);
  if (!entry) return null;
  const body = entry.blocks
    .map((b) => ({ label: BLOCK_TYPE_LABELS[b.type], plain: markdownToPlain(b.content) }))
    .filter((b) => b.plain.length > 0)
    .map((b) => `[${b.label}]\n${b.plain}`)
    .join("\n\n");
  if (body.length === 0) return null;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Summarize the journal entry below in three or four sentences, addressed to me and beginning with "You wrote". Restate only what is on the page: no interpretation of motives, no advice, no praise. Plain prose, no headings, no lists, no citations needed.\n\nJournal entry of ${entry.entryDate}:\n\n${truncate(body, 12_000)}`,
    },
  ];
  const text = (await chat(settings, messages, { temperature: 0.2, onToken })).trim();
  if (text.length === 0) return null;
  return j.artifacts.replace({ kind: "summary", ownerType: "entry", ownerId: entryId, model: settings.chatModel, content: text });
}
