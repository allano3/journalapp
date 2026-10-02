import type { Journal } from "../storage/db";
import type { AiArtifact } from "../domain/types";
import { laterEntriesForConviction } from "../search/related";
import { passageFromHit } from "./ask";
import { chat, type ChatMessage } from "./ollama";
import { SYSTEM_PROMPT, contextBlock, type Passage } from "./prompts";

/** Shape stored as JSON in a `comparison` artifact's content, so citations resolve on reload. */
export interface Comparison {
  text: string;
  sources: Pick<Passage, "date" | "entryId" | "convictionId" | "blockId" | "blockType" | "title">[];
}

export function readComparison(a: AiArtifact): Comparison {
  try {
    const r = JSON.parse(a.content) as Partial<Comparison>;
    if (typeof r.text === "string") return { text: r.text, sources: Array.isArray(r.sources) ? r.sources : [] };
  } catch {
    // older or malformed content: show it as plain text
  }
  return { text: a.content, sources: [] };
}

/**
 * Describe how later writing relates to a conviction over time. Streams through
 * `onToken`; replaces any earlier comparison. Resolves null when nothing written
 * after the conviction touches its subject.
 */
export async function compareConviction(j: Journal, convictionId: string, onToken?: (delta: string, soFar: string) => void): Promise<AiArtifact | null> {
  const settings = j.settings.get().ai;
  const c = j.convictions.get(convictionId);
  if (!c) return null;
  const { hits } = await laterEntriesForConviction(j, c, 12);
  const later: Passage[] = [];
  for (const h of hits) {
    const p = passageFromHit(j, h);
    if (p) later.push(p);
  }
  if (later.length === 0) return null;

  const versions = c.versions
    .map((v) => {
      const lines = [`Version ${v.versionNo} (${v.createdAt.slice(0, 10)}, status: ${v.status}): ${v.statement}`];
      if (v.reasoning.trim()) lines.push(`Reasoning: ${v.reasoning.trim()}`);
      if (v.changeNote.trim()) lines.push(`Why it changed: ${v.changeNote.trim()}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `A ${c.kind} I recorded on ${c.createdAt.slice(0, 10)}, with every version I have written of it:`,
        versions,
        "Journal entries I wrote afterwards that touch the same subject, oldest first:",
        contextBlock(later),
        `Describe, in two or three short paragraphs, how my later writing relates to this ${c.kind} over time: where it holds, where it is tested, where it seems to shift. Cite every entry you draw on as [YYYY-MM-DD]. Do not judge either position and never say I was wrong. If the later writing diverges from the ${c.kind}, end with exactly this question: "You previously wrote something different about this — what changed?" If it does not diverge, do not ask it.`,
      ].join("\n\n"),
    },
  ];
  const text = (await chat(settings, messages, { temperature: 0.2, onToken })).trim();
  if (text.length === 0) return null;
  const payload: Comparison = {
    text,
    sources: later.map((p) => ({ date: p.date, entryId: p.entryId, convictionId: p.convictionId, blockId: p.blockId, blockType: p.blockType, title: p.title })),
  };
  return j.artifacts.replace({ kind: "comparison", ownerType: "conviction", ownerId: convictionId, model: settings.chatModel, content: JSON.stringify(payload) });
}
