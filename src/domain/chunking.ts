import { markdownToPlain } from "./text";

export interface Chunk {
  index: number;
  text: string;
}

/**
 * Split a block into chunks suitable for embedding. Short blocks stay whole.
 * Long blocks are split on headings / blank-line paragraph boundaries, then merged
 * forward until a chunk approaches `target` characters. A paragraph longer than
 * `hardMax` is split on sentence boundaries.
 */
export function chunkText(md: string, target = 1200, hardMax = 2000): Chunk[] {
  const plain = markdownToPlain(md);
  if (plain.length === 0) return [];
  if (plain.length <= hardMax) return [{ index: 0, text: plain }];

  const paragraphs = md
    .split(/\n(?=#{1,6}\s)|\n\s*\n/)
    .map((p) => markdownToPlain(p))
    .filter((p) => p.length > 0)
    .flatMap((p) => (p.length > hardMax ? splitSentences(p, hardMax) : [p]));

  const chunks: Chunk[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length > 0 && buf.length + p.length + 1 > target) {
      chunks.push({ index: chunks.length, text: buf });
      buf = p;
    } else {
      buf = buf.length === 0 ? p : `${buf}\n${p}`;
    }
  }
  if (buf.length > 0) chunks.push({ index: chunks.length, text: buf });
  return chunks;
}

function splitSentences(text: string, max: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (buf.length > 0 && buf.length + s.length + 1 > max) {
      out.push(buf);
      buf = s;
    } else {
      buf = buf.length === 0 ? s : `${buf} ${s}`;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}
