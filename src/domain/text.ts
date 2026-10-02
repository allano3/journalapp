/** Strip markdown syntax to plain text for previews, FTS display and embeddings. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** First non-empty line, stripped, for use as an implicit title. */
export function firstLine(md: string): string {
  const line = md.split("\n").find((l) => l.trim().length > 0) ?? "";
  return markdownToPlain(line);
}

const STOPWORDS: Record<string, true> = Object.fromEntries(
  (
    "a an the and or but if then else when while of to in on at by for with about as into like through after over between out against during without before under around among " +
    "i me my mine myself we us our you your he him his she her it its they them their this that these those am is are was were be been being have has had having do does did doing " +
    "will would shall should can could may might must not no nor so than too very just also still yet again more most some any all each every both few other such only own same " +
    "what which who whom whose where why how there here now today yesterday tomorrow thing things something anything really think thought feel felt want wanted know knew get got go went " +
    "one two three four five six seven eight nine ten first second last next much many way time day days week weeks month months year years because though although even ever never always maybe perhaps"
  )
    .split(" ")
    .map((w) => [w, true] as const),
);

/**
 * Significant terms from a passage, most frequent first. Used to build keyword
 * queries that find related entries when no embedding model is available.
 */
export function keyTerms(text: string, limit = 8): string[] {
  const counts: Record<string, number> = {};
  for (const raw of markdownToPlain(text).toLowerCase().split(/[^a-z0-9'’-]+/)) {
    const w = raw.replace(/^['’-]+|['’-]+$/g, "");
    if (w.length < 4 || STOPWORDS[w] || /^\d+$/.test(w)) continue;
    counts[w] = (counts[w] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([w]) => w);
}

/** FNV-1a 32-bit hash as hex; used to detect changed text for re-embedding. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
