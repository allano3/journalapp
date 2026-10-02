import type { SearchHit } from "../../domain/types";
import { truncate } from "../../domain/text";
import { citationTargets, type Passage } from "../../ai/prompts";

const DATE_RE = /\[(\d{4}-\d{2}-\d{2})\]|(?<![\w/>\[#-])(\d{4}-\d{2}-\d{2})(?![\w\]/-])/g;

/**
 * Turn `[YYYY-MM-DD]` citations (and bare ISO dates) in model output into links to
 * the cited entry. The replacement happens on the markdown string, before rendering,
 * so the anchors survive `MarkdownView`. A date that maps to several records links
 * the first and appends the rest as small numbered links; a date that maps to
 * nothing stays as text, marked so it is visibly unresolved.
 */
export function linkCitations(markdown: string, sources: Pick<Passage, "date" | "entryId" | "convictionId">[]): string {
  const targets = citationTargets(sources);
  return markdown.replace(DATE_RE, (_m, bracketed: string | undefined, bare: string | undefined) => {
    const date = bracketed ?? bare ?? "";
    const hrefs = targets[date];
    if (!hrefs) return `<span class="cite cite-unresolved">${date}</span>`;
    const first = `<a class="cite" href="#${hrefs[0]}">${date}</a>`;
    const more = hrefs
      .slice(1)
      .map((h, i) => `<a class="cite cite-more" href="#${h}" title="Another record from this date">${i + 2}</a>`)
      .join("");
    return first + more;
  });
}

/** Sources as `HitList` rows so answers show the exact passages they drew on. */
export function passagesToHits(passages: Passage[]): SearchHit[] {
  return passages.map((p) => ({
    kind: p.convictionId ? "conviction" : "block",
    id: p.convictionId ?? p.entryId ?? "",
    entryId: p.entryId,
    blockId: p.blockId,
    blockType: p.blockType,
    date: p.date,
    title: p.title,
    snippet: truncate(p.text.replace(/\s+/g, " "), 240),
    score: 0,
    tags: [],
    favorite: false,
  }));
}
