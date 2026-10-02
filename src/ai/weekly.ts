import type { Journal } from "../storage/db";
import type { ISODate } from "../domain/types";
import type { ConvictionListItem } from "../storage/repos/convictions";
import { addDays, fromISODate } from "../domain/dates";
import { truncate } from "../domain/text";
import { chat, type ChatMessage } from "./ollama";
import { SYSTEM_PROMPT, WEEKLY_REVIEW_QUESTIONS, contextBlock, type Passage } from "./prompts";

const CONTEXT_BUDGET = 12_000;

/** Monday..Sunday calendar dates of a week plus the UTC timestamps that bound them (for repos keyed on timestamps). */
export function weekRange(weekStart: ISODate): { from: ISODate; to: ISODate; fromTs: string; toTs: string } {
  const to = addDays(weekStart, 6);
  return {
    from: weekStart,
    to,
    fromTs: fromISODate(weekStart).toISOString(),
    toTs: new Date(fromISODate(addDays(to, 1)).getTime() - 1).toISOString(),
  };
}

/**
 * Every entry of the week as one passage each, oldest first, with the full plain
 * text capped so the whole week fits in roughly `CONTEXT_BUDGET` characters.
 */
export function weekPassages(j: Journal, weekStart: ISODate): Passage[] {
  const { from, to } = weekRange(weekStart);
  const entries = j.entries.list({ from, to }).reverse();
  if (entries.length === 0) return [];
  const perEntry = Math.max(800, Math.floor(CONTEXT_BUDGET / entries.length));
  const passages: Passage[] = [];
  let used = 0;
  for (const e of entries) {
    if (used >= CONTEXT_BUDGET - 200) break;
    const text = truncate(j.entries.plainText(e.id), Math.min(perEntry, CONTEXT_BUDGET - used));
    if (text.length === 0) continue;
    used += text.length;
    passages.push({
      date: e.entryDate,
      entryId: e.id,
      convictionId: null,
      blockId: null,
      blockType: null,
      title: e.title || (e.kind === "note" ? "Quick note" : "Daily entry"),
      text,
    });
  }
  return passages;
}

/** Convictions as passages so the draft's citations can point at them too. */
export function convictionPassages(items: ConvictionListItem[]): Passage[] {
  return items.map((c) => ({
    date: c.changedAt.slice(0, 10),
    entryId: null,
    convictionId: c.id,
    blockId: null,
    blockType: c.kind === "decision" ? "decision" : "conviction",
    title: truncate(c.statement, 120),
    text: `${c.statement} (status: ${c.status})`,
  }));
}

export interface WeeklyDraft {
  draft: string;
  model: string;
  sources: Passage[];
  stopped: boolean;
}

/**
 * Ask the local model for a draft weekly review built from the week's entries and
 * conviction activity. Streams through `onToken`; stores the result as the review's
 * separate AI draft. Resolves null when the week holds nothing to draft from.
 */
export async function draftWeeklyReview(
  j: Journal,
  weekStart: ISODate,
  onToken?: (delta: string, soFar: string) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<WeeklyDraft | null> {
  const settings = j.settings.get().ai;
  const { from, to, fromTs, toTs } = weekRange(weekStart);
  const created = j.convictions.createdBetween(fromTs, toTs);
  const changed = j.convictions.changedBetween(fromTs, toTs).filter((c) => !created.some((x) => x.id === c.id));
  const entries = weekPassages(j, weekStart);
  if (entries.length === 0 && created.length === 0 && changed.length === 0) return null;
  const sources = [...entries, ...convictionPassages(created), ...convictionPassages(changed)];

  const parts: string[] = [`Everything I wrote in the week of ${from} to ${to}, oldest first:`, contextBlock(entries) || "(no entries this week)"];
  if (created.length > 0) parts.push(`Convictions and decisions I recorded this week:\n${created.map((c) => `- [${c.createdAt.slice(0, 10)}] ${c.kind}: ${c.statement}`).join("\n")}`);
  if (changed.length > 0) parts.push(`Convictions I revised this week:\n${changed.map((c) => `- [${c.changedAt.slice(0, 10)}] ${c.kind}: ${c.statement} (now ${c.status})`).join("\n")}`);
  parts.push(
    [
      "Prepare a draft weekly review for me to edit. Organise it around these questions, skipping any the writing does not speak to:",
      WEEKLY_REVIEW_QUESTIONS.map((q) => `- ${q}`).join("\n"),
      "Use the heading `## <question>` for each question you address, then one short paragraph in the 'You wrote…' voice with dates cited as [YYYY-MM-DD]. Where a decision or conviction was revised, describe both versions without judging and ask what changed. Under 400 words. Markdown only, no preamble.",
    ].join("\n"),
  );
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: parts.join("\n\n") },
  ];

  let soFar = "";
  let stopped = false;
  try {
    soFar = await chat(settings, messages, {
      signal: opts.signal,
      temperature: 0.3,
      onToken: (delta, full) => {
        soFar = full;
        onToken?.(delta, full);
      },
    });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
    stopped = true;
  }
  const draft = soFar.trim();
  if (draft.length > 0) j.reviews.saveAiDraft(weekStart, draft, settings.chatModel);
  return { draft, model: settings.chatModel, sources, stopped };
}
