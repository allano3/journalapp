import type { Journal } from "../storage/db";
import type { SqlDriver } from "../storage/driver";
import { newId } from "../domain/ids";
import { nowIso } from "../domain/dates";
import { changes } from "../state/events";

/**
 * Merge another journal database into this one.
 *
 * Both files are the same schema, every row carries a globally unique id, and conviction
 * history is append-only, so a merge is a set of deterministic per-table rules rather
 * than a sync protocol. Nothing the user wrote is ever dropped: when the same block was
 * edited on both devices the losing text is kept as an extra block on the entry.
 *
 * Device-local tables (settings, embeddings, ai_artifacts) are not merged; the embedding
 * index rebuilds itself from the merged text.
 */

const SCHEMA = "incoming";

export interface MergeSummary {
  entriesAdded: number;
  entriesUpdated: number;
  blocksAdded: number;
  blocksUpdated: number;
  conflicts: number;
  convictionsAdded: number;
  convictionVersionsAdded: number;
  reviewsAdded: number;
  reviewsUpdated: number;
  deletionsApplied: number;
  /** Name the backup's device recorded for itself, for labelling conflicts. */
  fromDevice: string;
}

function emptySummary(fromDevice: string): MergeSummary {
  return {
    entriesAdded: 0,
    entriesUpdated: 0,
    blocksAdded: 0,
    blocksUpdated: 0,
    conflicts: 0,
    convictionsAdded: 0,
    convictionVersionsAdded: 0,
    reviewsAdded: 0,
    reviewsUpdated: 0,
    deletionsApplied: 0,
    fromDevice,
  };
}

/** Thrown to roll the transaction back after a dry run; never escapes `mergeDatabase`. */
class DryRunComplete extends Error {
  constructor(readonly summary: MergeSummary) {
    super("dry run");
  }
}

interface EntryRow {
  id: string;
  entry_date: string;
  created_at: string;
  updated_at: string;
  title: string;
  kind: string;
  favorite: number;
  source_device: string;
}

interface BlockRow {
  id: string;
  entry_id: string;
  type: string;
  content: string;
  position: number;
  metadata: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  week_start: string;
  created_at: string;
  updated_at: string;
  content: string;
  ai_draft: string | null;
  ai_draft_model: string | null;
  ai_draft_created_at: string | null;
}

function deviceNameOf(db: SqlDriver, schema: string): string {
  const row = db.get<{ value: string }>(`SELECT value FROM ${schema}.settings WHERE key = 'deviceName'`);
  if (!row) return "another device";
  try {
    const name = JSON.parse(row.value) as unknown;
    return typeof name === "string" && name.trim().length > 0 ? name.trim() : "another device";
  } catch {
    return "another device";
  }
}

/** row id -> the latest moment it was deleted, per table, taking both sides into account. */
function deletionIndex(db: SqlDriver, table: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of db.all<{ row_id: string; deleted_at: string }>(
    `SELECT row_id, deleted_at FROM main.tombstones WHERE table_name = ?
     UNION ALL SELECT row_id, deleted_at FROM ${SCHEMA}.tombstones WHERE table_name = ?`,
    [table, table],
  )) {
    if (!out[r.row_id] || out[r.row_id] < r.deleted_at) out[r.row_id] = r.deleted_at;
  }
  return out;
}

function mergeEntries(db: SqlDriver, agreedAt: string, s: MergeSummary): void {
  const deleted = deletionIndex(db, "entries");
  const incoming = db.all<EntryRow>(`SELECT * FROM ${SCHEMA}.entries`);

  for (const inc of incoming) {
    const mine = db.get<EntryRow>("SELECT * FROM main.entries WHERE id = ?", [inc.id]);
    const deletedAt = deleted[inc.id];

    if (!mine) {
      // A deletion here outranks an older version of the row arriving from the backup.
      if (deletedAt !== undefined && inc.updated_at <= deletedAt) {
        s.deletionsApplied++;
        continue;
      }
      db.run(
        "INSERT INTO main.entries(id, entry_date, created_at, updated_at, title, kind, favorite, source_device) VALUES (?,?,?,?,?,?,?,?)",
        [inc.id, inc.entry_date, inc.created_at, inc.updated_at, inc.title, inc.kind, inc.favorite, inc.source_device],
      );
      for (const b of db.all<BlockRow>(`SELECT * FROM ${SCHEMA}.blocks WHERE entry_id = ? ORDER BY position`, [inc.id])) {
        db.run("INSERT INTO main.blocks(id, entry_id, type, content, position, metadata, updated_at) VALUES (?,?,?,?,?,?,?)", [
          b.id,
          b.entry_id,
          b.type,
          b.content,
          b.position,
          b.metadata,
          b.updated_at,
        ]);
        s.blocksAdded++;
      }
      s.entriesAdded++;
      copyTags(db, inc.id);
      continue;
    }

    // An update newer than the deletion resurrects the row, so a row present on both
    // sides is merged normally regardless of tombstones.
    const incomingIsNewer = inc.updated_at > mine.updated_at;
    let touched = false;

    if (incomingIsNewer) {
      db.run("UPDATE main.entries SET entry_date = ?, title = ?, kind = ?, favorite = ?, source_device = ? WHERE id = ?", [
        inc.entry_date,
        inc.title,
        inc.kind,
        inc.favorite,
        inc.source_device,
        inc.id,
      ]);
      touched =
        inc.entry_date !== mine.entry_date || inc.title !== mine.title || inc.kind !== mine.kind || inc.favorite !== mine.favorite;
    }
    if (mergeBlocks(db, inc, agreedAt, s)) touched = true;
    if (copyTags(db, inc.id)) touched = true;

    const latest = inc.updated_at > mine.updated_at ? inc.updated_at : mine.updated_at;
    const created = inc.created_at < mine.created_at ? inc.created_at : mine.created_at;
    db.run("UPDATE main.entries SET updated_at = ?, created_at = ? WHERE id = ?", [latest, created, inc.id]);
    if (touched) s.entriesUpdated++;
  }
}

/**
 * Returns true when anything about the entry's blocks changed.
 *
 * A differing block is only a *conflict* when both sides edited it since the two
 * journals last agreed (the watermark). Otherwise the older copy is simply the version
 * the other device never touched, and replacing it silently is correct.
 */
function mergeBlocks(db: SqlDriver, inc: EntryRow, agreedAt: string, s: MergeSummary): boolean {
  const incomingBlocks = db.all<BlockRow>(`SELECT * FROM ${SCHEMA}.blocks WHERE entry_id = ? ORDER BY position`, [inc.id]);
  if (incomingBlocks.length === 0) return false;
  const nextPosition = (db.get<{ m: number | null }>("SELECT MAX(position) m FROM main.blocks WHERE entry_id = ?", [inc.id])?.m ?? -1) + 1;
  let position = nextPosition;
  let changed = false;

  for (const b of incomingBlocks) {
    const local = db.get<BlockRow>("SELECT * FROM main.blocks WHERE id = ?", [b.id]);
    if (!local) {
      db.run("INSERT INTO main.blocks(id, entry_id, type, content, position, metadata, updated_at) VALUES (?,?,?,?,?,?,?)", [
        b.id,
        inc.id,
        b.type,
        b.content,
        position++,
        b.metadata,
        b.updated_at,
      ]);
      s.blocksAdded++;
      changed = true;
      continue;
    }
    if (local.content === b.content && local.metadata === b.metadata) continue;

    const incomingIsNewer = b.updated_at > local.updated_at;
    const loser = incomingIsNewer ? local : b;
    const bothEdited = local.updated_at > agreedAt && b.updated_at > agreedAt;

    if (incomingIsNewer) {
      db.run("UPDATE main.blocks SET content = ?, metadata = ?, type = ?, updated_at = ? WHERE id = ?", [
        b.content,
        b.metadata,
        b.type,
        b.updated_at,
        b.id,
      ]);
      s.blocksUpdated++;
      changed = true;
    }
    if (!bothEdited || loser.content.trim().length === 0) continue;

    // Genuine concurrent edit: keep the losing text beside the winner rather than lose it.
    const label = incomingIsNewer ? deviceNameOf(db, "main") : s.fromDevice;
    const already = db.get<{ n: number }>(
      "SELECT COUNT(*) n FROM main.blocks WHERE entry_id = ? AND content = ? AND json_extract(metadata, '$.conflictFrom') IS NOT NULL",
      [inc.id, loser.content],
    );
    if (already && already.n > 0) continue;
    db.run("INSERT INTO main.blocks(id, entry_id, type, content, position, metadata, updated_at) VALUES (?,?,?,?,?,?,?)", [
      newId(),
      inc.id,
      "generic",
      loser.content,
      position++,
      JSON.stringify({ conflictFrom: label, conflictDate: loser.updated_at.slice(0, 10), conflictOf: b.id }),
      loser.updated_at,
    ]);
    s.conflicts++;
    changed = true;
  }
  return changed;
}

/** Union of an entry's tags. Returns true when a tag was added. */
function copyTags(db: SqlDriver, entryId: string): boolean {
  const names = db.all<{ name: string }>(
    `SELECT t.name FROM ${SCHEMA}.entry_tags et JOIN ${SCHEMA}.tags t ON t.id = et.tag_id WHERE et.entry_id = ?`,
    [entryId],
  );
  let added = false;
  for (const { name } of names) {
    let tag = db.get<{ id: string }>("SELECT id FROM main.tags WHERE name = ?", [name]);
    if (!tag) {
      tag = { id: newId() };
      db.run("INSERT INTO main.tags(id, name) VALUES (?, ?)", [tag.id, name]);
    }
    const linked = db.get<{ n: number }>("SELECT COUNT(*) n FROM main.entry_tags WHERE entry_id = ? AND tag_id = ?", [entryId, tag.id]);
    if (linked && linked.n > 0) continue;
    db.run("INSERT INTO main.entry_tags(entry_id, tag_id) VALUES (?, ?)", [entryId, tag.id]);
    added = true;
  }
  return added;
}

function mergeConvictions(db: SqlDriver, s: MergeSummary): void {
  const deleted = deletionIndex(db, "convictions");
  const incoming = db.all<{
    id: string;
    kind: string;
    created_at: string;
    updated_at: string;
    source_entry_id: string | null;
    source_block_id: string | null;
  }>(`SELECT * FROM ${SCHEMA}.convictions`);

  for (const inc of incoming) {
    const mine = db.get<{ id: string; created_at: string; updated_at: string }>("SELECT * FROM main.convictions WHERE id = ?", [inc.id]);
    if (!mine) {
      const deletedAt = deleted[inc.id];
      if (deletedAt !== undefined && inc.updated_at <= deletedAt) {
        s.deletionsApplied++;
        continue;
      }
      // The source entry may not exist here; the column is nullable and the link is
      // restored on a later merge that brings the entry along.
      const sourceEntry = db.get<{ id: string }>("SELECT id FROM main.entries WHERE id = ?", [inc.source_entry_id ?? ""]);
      db.run(
        "INSERT INTO main.convictions(id, kind, created_at, updated_at, source_entry_id, source_block_id, current_version_id) VALUES (?,?,?,?,?,?,NULL)",
        [inc.id, inc.kind, inc.created_at, inc.updated_at, sourceEntry ? inc.source_entry_id : null, inc.source_block_id],
      );
      s.convictionsAdded++;
    }
    s.convictionVersionsAdded += copyVersions(db, inc.id);
    restackVersions(db, inc.id);
    copyConvictionLinks(db, inc.id);
  }
}

/** Insert versions this device has not seen. History is append-only, so ids never clash. */
function copyVersions(db: SqlDriver, convictionId: string): number {
  const rows = db.all<Record<string, string | number | null>>(
    `SELECT v.* FROM ${SCHEMA}.conviction_versions v WHERE v.conviction_id = ?
       AND v.id NOT IN (SELECT id FROM main.conviction_versions)`,
    [convictionId],
  );
  for (const v of rows) {
    db.run(
      `INSERT INTO main.conviction_versions(id, conviction_id, version_no, created_at, statement, context, reasoning, confidence,
        evidence, uncertainties, change_triggers, cost_of_ignoring, next_action, if_condition, then_action, review_date, status, change_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        v.id as string,
        v.conviction_id as string,
        // Temporarily unique; restackVersions renumbers the whole chain by date.
        Number(v.version_no) + 100000,
        v.created_at as string,
        v.statement as string,
        v.context as string,
        v.reasoning as string,
        v.confidence as number | null,
        v.evidence as string,
        v.uncertainties as string,
        v.change_triggers as string,
        v.cost_of_ignoring as string,
        v.next_action as string,
        v.if_condition as string | null,
        v.then_action as string | null,
        v.review_date as string | null,
        v.status as string,
        v.change_note as string,
      ],
    );
  }
  return rows.length;
}

/** Renumber a conviction's versions chronologically and point it at the newest. */
function restackVersions(db: SqlDriver, convictionId: string): void {
  const versions = db.all<{ id: string; created_at: string }>(
    "SELECT id, created_at FROM main.conviction_versions WHERE conviction_id = ? ORDER BY created_at, id",
    [convictionId],
  );
  if (versions.length === 0) return;
  // Two passes: the (conviction_id, version_no) unique index would collide otherwise.
  versions.forEach((v, i) => db.run("UPDATE main.conviction_versions SET version_no = ? WHERE id = ?", [-(i + 1), v.id]));
  versions.forEach((v, i) => db.run("UPDATE main.conviction_versions SET version_no = ? WHERE id = ?", [i + 1, v.id]));
  const latest = versions[versions.length - 1];
  db.run("UPDATE main.convictions SET current_version_id = ?, updated_at = ? WHERE id = ?", [latest.id, latest.created_at, convictionId]);
}

function copyConvictionLinks(db: SqlDriver, convictionId: string): void {
  db.run(
    `INSERT OR IGNORE INTO main.conviction_links(conviction_id, entry_id, note, created_at)
     SELECT l.conviction_id, l.entry_id, l.note, l.created_at FROM ${SCHEMA}.conviction_links l
     WHERE l.conviction_id = ? AND l.entry_id IN (SELECT id FROM main.entries)`,
    [convictionId],
  );
}

function mergeReviews(db: SqlDriver, s: MergeSummary): void {
  for (const inc of db.all<ReviewRow>(`SELECT * FROM ${SCHEMA}.reviews`)) {
    const mine = db.get<ReviewRow>("SELECT * FROM main.reviews WHERE week_start = ?", [inc.week_start]);
    if (!mine) {
      db.run(
        "INSERT INTO main.reviews(id, week_start, created_at, updated_at, content, ai_draft, ai_draft_model, ai_draft_created_at) VALUES (?,?,?,?,?,?,?,?)",
        [inc.id, inc.week_start, inc.created_at, inc.updated_at, inc.content, inc.ai_draft, inc.ai_draft_model, inc.ai_draft_created_at],
      );
      s.reviewsAdded++;
      continue;
    }
    // Already carried by an earlier merge (the local text contains the incoming one).
    const alreadyCarried = inc.content.trim().length > 0 && mine.content.includes(inc.content.trim());
    if (alreadyCarried && (inc.ai_draft ?? "") === (mine.ai_draft ?? "")) continue;
    if (inc.content.trim() === mine.content.trim() && (inc.ai_draft ?? "") === (mine.ai_draft ?? "")) continue;

    const incomingIsNewer = inc.updated_at > mine.updated_at;
    const kept = incomingIsNewer ? inc : mine;
    const other = incomingIsNewer ? mine : inc;
    let content = kept.content;
    // Both sides wrote a review for this week: keep the newer one and carry the other
    // below it, labelled, instead of discarding either.
    if (other.content.trim().length > 0 && other.content.trim() !== kept.content.trim()) {
      const label = incomingIsNewer ? deviceNameOf(db, "main") : s.fromDevice;
      content = `${kept.content.trimEnd()}\n\n---\n\n> Also written on ${label} on ${other.updated_at.slice(0, 10)}.\n\n${other.content.trim()}`;
    }
    const draft = kept.ai_draft ?? other.ai_draft;
    const draftModel = kept.ai_draft ? kept.ai_draft_model : other.ai_draft_model;
    const draftAt = kept.ai_draft ? kept.ai_draft_created_at : other.ai_draft_created_at;
    db.run("UPDATE main.reviews SET content = ?, ai_draft = ?, ai_draft_model = ?, ai_draft_created_at = ?, updated_at = ? WHERE week_start = ?", [
      content,
      draft,
      draftModel,
      draftAt,
      kept.updated_at,
      inc.week_start,
    ]);
    s.reviewsUpdated++;
  }
}

/** Apply the backup's deletions here, and keep both tombstone lists. */
function mergeTombstones(db: SqlDriver, s: MergeSummary): void {
  for (const table of ["entries", "convictions"] as const) {
    const rows = db.all<{ row_id: string; deleted_at: string }>(
      `SELECT row_id, deleted_at FROM ${SCHEMA}.tombstones WHERE table_name = ?`,
      [table],
    );
    for (const t of rows) {
      const row = db.get<{ updated_at: string }>(`SELECT updated_at FROM main.${table} WHERE id = ?`, [t.row_id]);
      if (row && row.updated_at <= t.deleted_at) {
        db.run(`DELETE FROM main.${table} WHERE id = ?`, [t.row_id]);
        s.deletionsApplied++;
      }
    }
  }
  db.run(
    `INSERT OR REPLACE INTO main.tombstones(table_name, row_id, deleted_at)
     SELECT table_name, row_id, deleted_at FROM ${SCHEMA}.tombstones
     WHERE NOT EXISTS (SELECT 1 FROM main.tombstones m WHERE m.table_name = ${SCHEMA}.tombstones.table_name
                        AND m.row_id = ${SCHEMA}.tombstones.row_id AND m.deleted_at >= ${SCHEMA}.tombstones.deleted_at)`,
  );
}

const AGREEMENTS_FLAG = "syncAgreements";

/**
 * When this journal and another device were last known to hold the same text. Anything
 * edited after it is a change this device has not seen, which is how a genuine
 * concurrent edit is told apart from a copy the other device simply never touched.
 * Recorded per device, locally: agreement is this device's own knowledge, not data.
 */
function agreementWith(j: Journal, device: string): string {
  const map = j.settings.getFlag<Record<string, string>>(AGREEMENTS_FLAG);
  return map?.[device] ?? "";
}

export function recordAgreement(j: Journal, device: string, at: string): void {
  const map = j.settings.getFlag<Record<string, string>>(AGREEMENTS_FLAG) ?? {};
  if ((map[device] ?? "") >= at) return;
  j.settings.setFlag(AGREEMENTS_FLAG, { ...map, [device]: at });
}

/**
 * Merge `bytes` (a decrypted journal database) into the open journal.
 * With `dryRun` the work is done and rolled back, so the summary shown to the user is
 * exactly what committing would do.
 */
export async function mergeDatabase(j: Journal, bytes: Uint8Array, { dryRun = false } = {}): Promise<MergeSummary> {
  const db = j.db;
  db.attachBytes(SCHEMA, bytes);
  try {
    const fromDevice = deviceNameOf(db, SCHEMA);
    const summary = emptySummary(fromDevice);
    const agreedAt = agreementWith(j, fromDevice);
    const incomingHigh =
      db.get<{ t: string | null }>(`SELECT MAX(updated_at) t FROM ${SCHEMA}.blocks`)?.t ??
      db.get<{ t: string | null }>(`SELECT MAX(updated_at) t FROM ${SCHEMA}.entries`)?.t ??
      "";
    try {
      db.transaction(() => {
        mergeEntries(db, agreedAt, summary);
        mergeConvictions(db, summary);
        mergeReviews(db, summary);
        mergeTombstones(db, summary);
        // Entries deleted on the other device drop their blocks via the foreign key.
        db.run("DELETE FROM main.tags WHERE id NOT IN (SELECT tag_id FROM main.entry_tags)");
        if (dryRun) throw new DryRunComplete(summary);
      });
    } catch (e) {
      if (e instanceof DryRunComplete) return e.summary;
      throw e;
    }
    // Everything the other device had written by now is here, so this is the new
    // agreement point: a later merge of the same file changes nothing.
    recordAgreement(j, fromDevice, incomingHigh);
    j.settings.setFlag("lastMergeAt", nowIso());
    await db.flush();
    for (const topic of ["entries", "convictions", "reviews", "embeddings"] as const) changes.emit(topic);
    return summary;
  } finally {
    db.detach(SCHEMA);
  }
}

export function mergeChangedAnything(s: MergeSummary): boolean {
  return (
    s.entriesAdded + s.entriesUpdated + s.blocksAdded + s.blocksUpdated + s.conflicts + s.convictionsAdded + s.convictionVersionsAdded + s.reviewsAdded + s.reviewsUpdated + s.deletionsApplied > 0
  );
}

/** One-line descriptions of what a merge would change, for the confirmation step. */
export function describeMerge(s: MergeSummary): string[] {
  const lines: string[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (s.entriesAdded > 0) lines.push(`${plural(s.entriesAdded, "new entry", "new entries")}`);
  if (s.entriesUpdated > 0) lines.push(`${plural(s.entriesUpdated, "entry", "entries")} updated`);
  if (s.blocksAdded > 0) lines.push(`${plural(s.blocksAdded, "new section")}`);
  if (s.blocksUpdated > 0) lines.push(`${plural(s.blocksUpdated, "section")} rewritten`);
  if (s.conflicts > 0) lines.push(`${plural(s.conflicts, "section")} kept beside a newer version`);
  if (s.convictionsAdded > 0) lines.push(`${plural(s.convictionsAdded, "new conviction")}`);
  if (s.convictionVersionsAdded > 0) lines.push(`${plural(s.convictionVersionsAdded, "conviction revision")}`);
  if (s.reviewsAdded > 0) lines.push(`${plural(s.reviewsAdded, "new weekly review")}`);
  if (s.reviewsUpdated > 0) lines.push(`${plural(s.reviewsUpdated, "weekly review")} updated`);
  if (s.deletionsApplied > 0) lines.push(`${plural(s.deletionsApplied, "deletion")} applied`);
  return lines;
}
