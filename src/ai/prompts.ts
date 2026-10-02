import type { BlockType, ISODate } from "../domain/types";
import { BLOCK_TYPE_LABELS } from "../domain/template";

/**
 * Prompts and context formatting shared by every AI feature. The assistant is a
 * librarian for the writer's own words: it quotes, dates and asks; it never judges,
 * diagnoses or advises as an authority.
 */

/** One retrieved piece of the journal handed to the model and shown to the user as a source. */
export interface Passage {
  date: ISODate;
  entryId: string | null;
  convictionId: string | null;
  blockId: string | null;
  blockType: BlockType | null;
  title: string;
  /** Plain text of the whole block (or the conviction's current statement + reasoning). */
  text: string;
}

export const SYSTEM_PROMPT = `You are a quiet librarian and reflection assistant for one person's private journal. The excerpts you receive are that person's own words, and you are speaking to the person who wrote them.

How to answer:
- Work only from the excerpts you are given. If they do not contain the answer, say so plainly ("I could not find anything in these entries about…") rather than guessing.
- Speak about the writing, not the writer: "You wrote…", "In these three entries…", "A recurring theme appears to be…", "You may want to revisit…".
- Cite the date of every excerpt you draw on, written exactly as [YYYY-MM-DD]. Use only dates that appear in the excerpts. Several dates can sit side by side: [2026-03-04] [2026-03-11].
- Never claim to know motives, unstated feelings, or anything resembling a psychological diagnosis. You are not a therapist and not an authority; do not give advice.
- If the excerpts show the writer's thinking changed over time, describe both positions with their dates without judging either and never say they were wrong. Then ask: "You previously wrote something different about this — what changed?"
- Be brief and plain. Short paragraphs; a list only when listing several entries. No headings unless asked, no emoji, no praise, no wellness language.`;

export const ASK_EXAMPLES: readonly string[] = [
  "What was I thinking about moving last year?",
  "How has my thinking about this relationship changed?",
  "What major decisions did I make during the past six months?",
  "What issues do I repeatedly say are important but never seem to resolve?",
  "What was happening in my life the last few times I slept badly?",
  "What themes have appeared repeatedly this month?",
  "What convictions have I recorded about this issue?",
  "What have I changed my mind about recently?",
  "Summarize what I learned from the chapters I read this month.",
];

export const WEEKLY_REVIEW_QUESTIONS: readonly string[] = [
  "What kept appearing in my thoughts?",
  "What gave me energy?",
  "What drained me?",
  "What did I learn?",
  "What decisions did I make?",
  "Which decisions remain unresolved?",
  "Did I contradict or revise any previous conviction?",
  "Is there something I said mattered but took no action on?",
  "What prayers or recurring concerns appeared?",
  "What do I want to carry into next week?",
];

/** `### [YYYY-MM-DD] (<section label>)` followed by the passage text. */
export function formatPassage(p: Passage): string {
  const label = p.convictionId ? (p.blockType === "decision" ? "Decision" : "Conviction") : p.blockType ? BLOCK_TYPE_LABELS[p.blockType] : p.title || "Entry";
  const title = p.title && p.title !== label ? ` — ${p.title}` : "";
  return `### [${p.date}] (${label}${title})\n${p.text}`;
}

/** The excerpt block handed to the model: passages in the order given, separated by blank lines. */
export function contextBlock(passages: Passage[]): string {
  return passages.map(formatPassage).join("\n\n");
}

/** Date → hash-router targets, deduped, entries before convictions, otherwise in passage order. */
export function citationTargets(passages: Pick<Passage, "date" | "entryId" | "convictionId">[]): Record<ISODate, string[]> {
  const out: Record<ISODate, string[]> = {};
  for (const p of passages) {
    const href = p.entryId ? `/entry/${p.entryId}` : p.convictionId ? `/convictions/${p.convictionId}` : null;
    if (!href) continue;
    const list = out[p.date] ?? (out[p.date] = []);
    if (list.includes(href)) continue;
    if (p.entryId) {
      const firstConviction = list.findIndex((h) => h.startsWith("/convictions/"));
      list.splice(firstConviction === -1 ? list.length : firstConviction, 0, href);
    } else {
      list.push(href);
    }
  }
  return out;
}

/** Text the model receives when the question matched nothing. */
export const NO_MATCH_ANSWER = "I could not find anything in your journal that speaks to this. You could try different words, or a wider span of time.";
