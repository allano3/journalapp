import type { Journal } from "../storage/db";
import type { ISODate, SearchHit } from "../domain/types";
import { addDays, addMonths, todayISO, weekStart } from "../domain/dates";
import { keyTerms, markdownToPlain, truncate } from "../domain/text";
import { keywordSearch } from "../search/fts";
import { semanticSearch } from "../search/semantic";
import { chat, type ChatMessage } from "./ollama";
import { NO_MATCH_ANSWER, SYSTEM_PROMPT, contextBlock, type Passage } from "./prompts";

const PASSAGE_MAX = 1500;

/** Full plain text of the hit's block (or its conviction), as a passage the model and the user both see. */
export function passageFromHit(j: Journal, h: SearchHit): Passage | null {
  if (h.kind === "conviction") {
    const c = j.convictions.get(h.id);
    if (!c) return null;
    const v = c.current;
    const text = [v.statement, v.reasoning].filter((s) => s.trim().length > 0).join("\n");
    return {
      date: h.date,
      entryId: null,
      convictionId: c.id,
      blockId: null,
      blockType: c.kind === "decision" ? "decision" : "conviction",
      title: truncate(v.statement, 120),
      text: truncate(text, PASSAGE_MAX),
    };
  }
  if (!h.entryId) return null;
  const block = h.blockId ? j.entries.getBlock(h.blockId) : null;
  const text = block ? markdownToPlain(block.content) : j.entries.plainText(h.entryId);
  if (text.length === 0) return null;
  return {
    date: h.date,
    entryId: h.entryId,
    convictionId: null,
    blockId: block?.id ?? null,
    blockType: block?.type ?? h.blockType,
    title: h.title,
    text: truncate(text, PASSAGE_MAX),
  };
}

export interface RetrieveOptions {
  limit?: number;
  from?: ISODate;
  to?: ISODate;
}

/**
 * Passages relevant to a question: the semantic index when Ollama can embed the
 * question, otherwise a keyword OR-query over its significant terms. One passage per
 * entry or conviction, oldest first so the model can narrate change over time.
 */
export async function retrieveContext(j: Journal, question: string, opts: RetrieveOptions = {}): Promise<Passage[]> {
  const limit = opts.limit ?? 14;
  const filters = { from: opts.from, to: opts.to, includeConvictions: true as const };
  let hits = await semanticSearch(j, question, { ...filters, limit: limit * 3, minScore: 0.3 });
  if (!hits || hits.length === 0) {
    const terms = keyTerms(question, 10);
    hits = terms.length > 0 ? keywordSearch(j, terms.join(" "), { ...filters, mode: "or", limit: limit * 3 }) : [];
  }
  const seen = new Set<string>();
  const passages: Passage[] = [];
  for (const h of hits) {
    const key = h.kind === "conviction" ? `c:${h.id}` : `e:${h.entryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = passageFromHit(j, h);
    if (!p) continue;
    passages.push(p);
    if (passages.length >= limit) break;
  }
  passages.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return passages;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, few: 3, several: 3,
};

/** Season → [first month, last month] (northern hemisphere; winter wraps the year). */
const SEASONS: Record<string, [number, number]> = { spring: [3, 5], summer: [6, 8], autumn: [9, 11], fall: [9, 11], winter: [12, 2] };

/**
 * A date window implied by phrases such as "past six months", "last year",
 * "this month", "last summer". Returns an empty object when nothing matches.
 */
export function detectDateScope(question: string, today: ISODate = todayISO()): { from?: ISODate; to?: ISODate } {
  const q = question.toLowerCase();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  const span = /\b(?:(?:past|last|previous)\s+(?:(\d+)|(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?: of)?|few|several))\s+|past\s+)(day|week|month|year)s?\b/.exec(q);
  if (span) {
    const n = span[1] ? Number(span[1]) : span[2] ? (NUMBER_WORDS[span[2].replace(" of", "")] ?? 1) : 1;
    const unit = span[3];
    const from = unit === "day" ? addDays(today, -n) : unit === "week" ? addDays(today, -7 * n) : unit === "month" ? addMonths(today, -n) : addMonths(today, -12 * n);
    return { from };
  }

  const season = /\b(?:last|this|past)\s+(spring|summer|autumn|fall|winter)\b/.exec(q);
  if (season) {
    const [m1, m2] = SEASONS[season[1]];
    // Most recent occurrence that has already begun.
    let y = year;
    if (m1 > month) y -= 1;
    const from = `${y}-${String(m1).padStart(2, "0")}-01`;
    const endYear = m2 < m1 ? y + 1 : y;
    const to = addDays(addMonths(`${endYear}-${String(m2).padStart(2, "0")}-01`, 1), -1);
    return { from, to };
  }

  if (/\blast year\b/.test(q)) return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  if (/\bthis year\b/.test(q)) return { from: `${year}-01-01` };
  if (/\blast month\b/.test(q)) {
    const first = addMonths(`${today.slice(0, 7)}-01`, -1);
    return { from: first, to: addDays(`${today.slice(0, 7)}-01`, -1) };
  }
  if (/\bthis month\b/.test(q)) return { from: `${today.slice(0, 7)}-01` };
  if (/\blast week\b/.test(q)) {
    const ws = weekStart(today);
    return { from: addDays(ws, -7), to: addDays(ws, -1) };
  }
  if (/\bthis week\b/.test(q)) return { from: weekStart(today) };
  if (/\b(?:recently|lately)\b/.test(q)) return { from: addMonths(today, -3) };
  return {};
}

export interface AskResult {
  answer: string;
  sources: Passage[];
  model: string;
  /** True when the stream was aborted; `answer` holds what had arrived. */
  stopped: boolean;
}

/**
 * Ask a question of the journal. Retrieves passages (reported through `onSources`
 * as soon as they are known), streams the model's answer through `onToken` and
 * resolves with the full text plus the passages it saw. `history` carries earlier
 * turns (question/answer pairs) for follow-ups.
 */
export async function askJournal(
  j: Journal,
  question: string,
  history: ChatMessage[],
  onToken?: (delta: string, soFar: string) => void,
  opts: { signal?: AbortSignal; onSources?: (sources: Passage[]) => void } = {},
): Promise<AskResult> {
  const settings = j.settings.get().ai;
  const scope = detectDateScope(question);
  const sources = await retrieveContext(j, question, { ...scope });
  opts.onSources?.(sources);
  if (sources.length === 0 && history.length === 0) {
    onToken?.(NO_MATCH_ANSWER, NO_MATCH_ANSWER);
    return { answer: NO_MATCH_ANSWER, sources, model: settings.chatModel, stopped: false };
  }

  const scopeNote = scope.from ? `\n\n(Only entries from ${scope.from}${scope.to ? ` to ${scope.to}` : " onwards"} were searched.)` : "";
  const excerpts = sources.length > 0 ? `Excerpts from my journal, oldest first:\n\n${contextBlock(sources)}` : "No new excerpts matched this question; answer from the conversation so far if you can, otherwise say you could not find anything.";
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-8),
    { role: "user", content: `${excerpts}${scopeNote}\n\nQuestion: ${question}` },
  ];

  let soFar = "";
  try {
    const answer = await chat(settings, messages, {
      signal: opts.signal,
      temperature: 0.2,
      onToken: (delta, full) => {
        soFar = full;
        onToken?.(delta, full);
      },
    });
    return { answer, sources, model: settings.chatModel, stopped: false };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { answer: soFar, sources, model: settings.chatModel, stopped: true };
    throw e;
  }
}
