import { strToU8, zipSync, type Zippable } from "fflate";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Journal } from "../storage/db";
import { isTauri } from "../storage/blobstore.tauri";
import type { Block, Conviction, ConvictionLink, ConvictionVersion, Entry, Settings, WeeklyReview } from "../domain/types";
import { BLOCK_TYPE_LABELS } from "../domain/template";
import { formatMedium, nowIso, toISODate } from "../domain/dates";

/**
 * Plain, durable exports. Nothing here is encrypted; the Markdown layout is meant to be
 * readable decades from now with no software beyond a text editor.
 */

export interface JournalExport {
  format: "journal-export";
  version: 1;
  exportedAt: string;
  entries: Entry[];
  convictions: (Conviction & { links: ConvictionLink[] })[];
  reviews: WeeklyReview[];
  settings: Omit<Settings, "lock">;
}

const VERSION_FIELD_LABELS: Record<
  keyof Pick<ConvictionVersion, "context" | "reasoning" | "evidence" | "uncertainties" | "changeTriggers" | "costOfIgnoring" | "nextAction">,
  string
> = {
  context: "Context",
  reasoning: "Reasoning",
  evidence: "Evidence",
  uncertainties: "Uncertainties",
  changeTriggers: "What would change my mind",
  costOfIgnoring: "Cost of ignoring",
  nextAction: "Next action",
};

function yamlString(s: string): string {
  return JSON.stringify(s);
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

/** Reserve a path in the archive, appending -2, -3… on collision. */
function uniquePath(taken: Record<string, true>, base: string, ext: string): string {
  let path = base + ext;
  for (let n = 2; taken[path]; n++) path = `${base}-${n}${ext}`;
  taken[path] = true;
  return path;
}

function sectionLabel(block: Block, settings: Settings): string {
  const key = block.metadata.section;
  if (typeof key === "string") {
    const section = settings.template.find((s) => s.key === key);
    if (section) return section.label;
  }
  return BLOCK_TYPE_LABELS[block.type] ?? block.type;
}

function blockMarkdown(block: Block, settings: Settings): string {
  const m = block.metadata;
  const lines: string[] = [`## ${sectionLabel(block, settings)}`, ""];
  const meta: string[] = [];
  if (typeof m.sleepQuality === "number") meta.push(`Sleep quality: ${m.sleepQuality}/5`);
  if (typeof m.sleepHours === "number") meta.push(`Hours slept: ${m.sleepHours}`);
  if (typeof m.source === "string" && m.source.length > 0) meta.push(`Source: ${m.source}`);
  if (typeof m.reference === "string" && m.reference.length > 0) meta.push(`Reference: ${m.reference}`);
  if (typeof m.done === "boolean") meta.push(`Done: ${m.done ? "yes" : "no"}`);
  if (Array.isArray(m.prayerItems) && m.prayerItems.length > 0) {
    meta.push("Items:");
    for (const item of m.prayerItems) meta.push(`- ${item.text} — ${item.status.replace(/_/g, " ")}`);
  }
  if (meta.length > 0) lines.push(...meta, "");
  if (block.content.trim().length > 0) lines.push(block.content.trimEnd(), "");
  return lines.join("\n");
}

function entryMarkdown(entry: Entry, settings: Settings): string {
  const head = [
    "---",
    `id: ${entry.id}`,
    `date: ${entry.entryDate}`,
    `kind: ${entry.kind}`,
    `title: ${yamlString(entry.title)}`,
    `tags: [${entry.tags.map(yamlString).join(", ")}]`,
    `favorite: ${entry.favorite}`,
    `created: ${entry.createdAt}`,
    `updated: ${entry.updatedAt}`,
    "---",
    "",
    `# ${entry.title.length > 0 ? entry.title : formatMedium(entry.entryDate)}`,
    "",
  ];
  const body = entry.blocks
    .filter((b) => b.content.trim().length > 0 || Object.keys(b.metadata).some((k) => k !== "section"))
    .map((b) => blockMarkdown(b, settings));
  return head.join("\n") + "\n" + body.join("\n");
}

function versionMarkdown(v: ConvictionVersion, total: number): string {
  const lines: string[] = [`## Version ${v.versionNo} of ${total} — ${v.createdAt}`, ""];
  lines.push(`- Status: ${v.status.replace(/_/g, " ")}`);
  lines.push(`- Confidence: ${v.confidence === null ? "not set" : `${v.confidence}/5`}`);
  lines.push(`- Review date: ${v.reviewDate ?? "none"}`);
  lines.push("", "### Statement", "", v.statement.trim(), "");
  for (const [field, label] of Object.entries(VERSION_FIELD_LABELS) as [keyof typeof VERSION_FIELD_LABELS, string][]) {
    const text = v[field];
    if (text.trim().length > 0) lines.push(`### ${label}`, "", text.trim(), "");
  }
  if (v.ifThen && (v.ifThen.condition.length > 0 || v.ifThen.action.length > 0)) {
    lines.push("### If / then", "", `If ${v.ifThen.condition.trim()}, I will ${v.ifThen.action.trim()}`, "");
  }
  if (v.changeNote.trim().length > 0) lines.push("### What changed since the previous version", "", v.changeNote.trim(), "");
  return lines.join("\n");
}

function convictionMarkdown(c: Conviction, links: ConvictionLink[], entryDates: Record<string, string>): string {
  const source = c.sourceEntryId ? `${entryDates[c.sourceEntryId] ?? "unknown date"} (entry ${c.sourceEntryId})` : "none";
  const head = [
    "---",
    `id: ${c.id}`,
    `kind: ${c.kind}`,
    `created: ${c.createdAt}`,
    `updated: ${c.updatedAt}`,
    `status: ${c.current.status}`,
    `versions: ${c.versions.length}`,
    `source_entry: ${yamlString(source)}`,
    `source_block: ${c.sourceBlockId ?? "none"}`,
    "---",
    "",
    `# ${c.current.statement.trim()}`,
    "",
    `This ${c.kind} has ${c.versions.length} version${c.versions.length === 1 ? "" : "s"}. Versions are never edited; each change appends a new one. The latest version is the current one.`,
    "",
  ];
  const versions = c.versions.map((v) => versionMarkdown(v, c.versions.length));
  const linkLines: string[] = [];
  if (links.length > 0) {
    linkLines.push("## Later entries linked by the writer", "");
    for (const l of links) {
      const date = entryDates[l.entryId] ?? "unknown date";
      linkLines.push(`- ${date} (entry ${l.entryId})${l.note.length > 0 ? ` — ${l.note}` : ""}`);
    }
    linkLines.push("");
  }
  return head.join("\n") + "\n" + versions.join("\n") + (linkLines.length > 0 ? "\n" + linkLines.join("\n") : "");
}

function reviewMarkdown(r: WeeklyReview): string {
  const lines = [
    "---",
    `id: ${r.id}`,
    `week_start: ${r.weekStart}`,
    `created: ${r.createdAt}`,
    `updated: ${r.updatedAt}`,
    "---",
    "",
    `# Week of ${formatMedium(r.weekStart)}`,
    "",
    r.content.trimEnd(),
    "",
  ];
  if (r.aiDraft !== null) {
    lines.push(
      "",
      `## Draft by local AI (${r.aiDraftModel ?? "unknown model"}, ${r.aiDraftCreatedAt ?? "unknown date"})`,
      "",
      "The following was generated by a local language model and is not the writer's own words.",
      "",
      r.aiDraft.trimEnd(),
      "",
    );
  }
  return lines.join("\n");
}

const README = `# Journal export

Plain Markdown with YAML front matter. Everything here is the writer's own text except
where a heading says "Draft by local AI". Nothing is encrypted.

Layout:

- entries/YYYY/YYYY-MM-DD.md — the daily entry for that date. Each template section is a
  "## Heading" followed by any structured details (sleep quality, reading source, prayer
  item states, whether an action was done) and then the text as written.
- entries/YYYY/YYYY-MM-DD-note-N.md — quick notes written that day, in order.
- convictions/YYYY-MM-DD-slug.md — one file per conviction or decision, named by the day
  it was recorded. Every version is included in order; the last one is current. Each
  version lists status, confidence, review date, statement, context, reasoning,
  evidence, uncertainties, what would change the writer's mind, cost of ignoring, next
  action, an if/then commitment, and the writer's note on what changed. Empty fields are
  omitted. "source_entry" in the front matter points at the entry it came from.
- reviews/YYYY-MM-DD.md — weekly reviews, named by the Monday of the week.

Ids in front matter are the app's internal identifiers, kept so files can be
cross-referenced (a conviction's source entry, linked later entries). Timestamps are UTC;
"date" fields are the calendar day the writer was on.
`;

export function exportMarkdownZip(j: Journal): Uint8Array {
  const settings = j.settings.get();
  const files: Zippable = { "README.md": strToU8(README) };
  const taken: Record<string, true> = {};
  const entryDates: Record<string, string> = {};

  const summaries = j.entries.list().reverse(); // oldest first so note numbering follows writing order
  const noteCounters: Record<string, number> = {};
  for (const s of summaries) {
    const entry = j.entries.get(s.id);
    if (!entry) continue;
    entryDates[entry.id] = entry.entryDate;
    const year = entry.entryDate.slice(0, 4);
    let base = `entries/${year}/${entry.entryDate}`;
    if (entry.kind === "note") {
      const n = (noteCounters[entry.entryDate] ?? 0) + 1;
      noteCounters[entry.entryDate] = n;
      base += `-note-${n}`;
    }
    files[uniquePath(taken, base, ".md")] = strToU8(entryMarkdown(entry, settings));
  }

  for (const item of j.convictions.list().reverse()) {
    const c = j.convictions.get(item.id);
    if (!c) continue;
    const base = `convictions/${toISODate(new Date(c.createdAt))}-${slugify(c.current.statement)}`;
    files[uniquePath(taken, base, ".md")] = strToU8(convictionMarkdown(c, j.convictions.links(c.id), entryDates));
  }

  for (const r of j.reviews.list()) {
    files[uniquePath(taken, `reviews/${r.weekStart}`, ".md")] = strToU8(reviewMarkdown(r));
  }

  return zipSync(files, { level: 6 });
}

export function exportJson(j: Journal): JournalExport {
  const { lock: _lock, ...settings } = j.settings.get();
  const entries: Entry[] = [];
  for (const s of j.entries.list().reverse()) {
    const e = j.entries.get(s.id);
    if (e) entries.push(e);
  }
  const convictions: JournalExport["convictions"] = [];
  for (const item of j.convictions.list().reverse()) {
    const c = j.convictions.get(item.id);
    if (c) convictions.push({ ...c, links: j.convictions.links(c.id) });
  }
  return {
    format: "journal-export",
    version: 1,
    exportedAt: nowIso(),
    entries,
    convictions,
    reviews: j.reviews.list().reverse(),
    settings,
  };
}

/**
 * Hand bytes to the platform as a file. Browser: Blob + anchor download. Tauri: native
 * save dialog (the webview has no download handler). Resolves false when the user cancels.
 */
export async function downloadBytes(name: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  if (isTauri()) {
    const ext = name.slice(name.lastIndexOf(".") + 1);
    const path = await save({ defaultPath: name, filters: [{ name: ext, extensions: [ext] }] });
    if (path === null) return false;
    await writeFile(path, bytes);
    return true;
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
