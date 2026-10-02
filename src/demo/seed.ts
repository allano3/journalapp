import type { Journal } from "../storage/db";
import type { NewBlock } from "../storage/repos/entries";
import type { BlockType, ISODate } from "../domain/types";
import { DEFAULT_TEMPLATE } from "../domain/template";
import { fromISODate, todayISO } from "../domain/dates";
import { buildDemoScript } from "./content";
import type { SectionKey } from "./content";

/** Ids of everything the demo seeded, so it can be removed cleanly. */
export interface DemoIds {
  entries: string[];
  convictions: string[];
  /** Week starts of seeded weekly reviews. */
  reviews: ISODate[];
}

const FLAG = "demoIds";

const SECTION_TYPES = Object.fromEntries(DEFAULT_TEMPLATE.map((s) => [s.key, s.blockType])) as Record<SectionKey, BlockType>;

/** ISO timestamp for a local calendar date at a local wall-clock time. */
function stamp(date: ISODate, time: string): string {
  const d = fromISODate(date);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function hasDemoData(j: Journal): boolean {
  const ids = j.settings.getFlag<DemoIds>(FLAG);
  return ids !== null && Array.isArray(ids.entries) && ids.entries.length > 0;
}

export function seedDemoData(j: Journal): void {
  if (hasDemoData(j)) return;
  const script = buildDemoScript(todayISO());
  const ids: DemoIds = { entries: [], convictions: [], reviews: [] };

  // Entry key -> { entryId, conviction-section block id, createdAt }
  const byKey: Record<string, { entryId: string; convictionBlockId: string | null; createdAt: string }> = {};

  j.db.transaction(() => {
    for (const e of script.entries) {
      const createdAt = stamp(e.date, e.time);
      const blocks: NewBlock[] = e.blocks.map((b) => ({
        type: SECTION_TYPES[b.section],
        content: b.content,
        metadata: { section: b.section, ...b.metadata },
      }));
      const entry = j.entries.create({
        entryDate: e.date,
        kind: e.kind,
        title: e.title,
        blocks,
        tags: e.tags,
        sourceDevice: "demo",
        createdAt,
      });
      // Repos stamp favorite/updated_at with "now"; keep the seeded timestamps honest.
      if (e.favorite) j.db.run("UPDATE entries SET favorite = 1 WHERE id = ?", [entry.id]);
      j.db.run("UPDATE entries SET updated_at = ? WHERE id = ?", [createdAt, entry.id]);
      const convictionBlock = entry.blocks.find((b) => b.metadata.section === "conviction") ?? null;
      byKey[e.key] = { entryId: entry.id, convictionBlockId: convictionBlock?.id ?? null, createdAt };
      ids.entries.push(entry.id);
    }

    for (const c of script.convictions) {
      const source = byKey[c.entryKey];
      const created = j.convictions.create({
        kind: c.kind,
        version: c.version,
        sourceEntryId: source.entryId,
        sourceBlockId: source.convictionBlockId,
        createdAt: source.createdAt,
      });
      for (const r of c.revisions) j.convictions.addVersion(created.id, r.patch, byKey[r.entryKey].createdAt);
      ids.convictions.push(created.id);
    }

    for (const r of script.reviews) {
      // Never overwrite a review the user already wrote for that week.
      if (j.reviews.getByWeek(r.weekStart)) continue;
      j.reviews.saveContent(r.weekStart, r.content);
      const ts = stamp(r.date, r.time);
      j.db.run("UPDATE reviews SET created_at = ?, updated_at = ? WHERE week_start = ?", [ts, ts, r.weekStart]);
      ids.reviews.push(r.weekStart);
    }

    j.settings.setFlag(FLAG, ids);
  });
}

export function removeDemoData(j: Journal): void {
  const ids = j.settings.getFlag<DemoIds>(FLAG);
  if (!ids) return;
  j.db.transaction(() => {
    for (const id of ids.convictions ?? []) j.convictions.delete(id);
    for (const id of ids.entries ?? []) j.entries.delete(id);
    for (const week of ids.reviews ?? []) j.reviews.delete(week);
    j.settings.setFlag(FLAG, null);
  });
}
