import type { Journal } from "../storage/db";
import type { Settings } from "../domain/types";
import { todayISO } from "../domain/dates";
import { newId } from "../domain/ids";
import { decrypt, encrypt } from "../security/crypto";
import { changes } from "../state/events";
import type { JournalExport } from "./export";
import { mergeDatabase, recordAgreement, type MergeSummary } from "./merge";

/**
 * Encrypted backup = the raw SQLite file (so FTS tables, embeddings and settings restore
 * byte-for-byte) wrapped in the `JRNL1` AES-256-GCM container from security/crypto.
 */

const SQLITE_HEADER = "SQLite format 3\0";
export const BACKUP_EXTENSION = ".journalbackup";

export function isSqliteFile(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i++) if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  return true;
}

export async function createEncryptedBackup(j: Journal, passphrase: string): Promise<{ name: string; bytes: Uint8Array }> {
  await j.db.flush();
  const bytes = await encrypt(j.db.export(), passphrase);
  return { name: `journal-${todayISO()}${BACKUP_EXTENSION}`, bytes };
}

export async function restoreEncryptedBackup(j: Journal, file: Uint8Array, passphrase: string): Promise<void> {
  const bytes = await decrypt(file, passphrase);
  if (!isSqliteFile(bytes)) throw new Error("the backup decrypted but does not contain a journal database");
  await j.replaceDatabase(bytes);
  noteRestoredAgreement(j);
}

/**
 * After a replace-restore both devices hold the same text, so a later merge of writing
 * from the device that made the backup must not read untouched sections as conflicts.
 * The peer's name comes from the restored rows themselves: the settings cache may still
 * describe the journal that was just replaced.
 */
function noteRestoredAgreement(j: Journal): void {
  const row = j.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'deviceName'");
  let device = "another device";
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === "string" && parsed.trim().length > 0) device = parsed.trim();
    } catch {
      // A malformed value just means the peer stays anonymous.
    }
  }
  const high = j.db.get<{ t: string | null }>("SELECT MAX(updated_at) t FROM blocks")?.t ?? "";
  recordAgreement(j, device, high);
}

/**
 * Combine a backup with what is already here instead of replacing it. Returns what the
 * merge did (or would do, with `dryRun`) so the user can confirm before committing.
 */
export async function mergeEncryptedBackup(j: Journal, file: Uint8Array, passphrase: string, opts: { dryRun?: boolean } = {}): Promise<MergeSummary> {
  const bytes = await decrypt(file, passphrase);
  if (!isSqliteFile(bytes)) throw new Error("the backup decrypted but does not contain a journal database");
  return mergeDatabase(j, bytes, opts);
}

/** A plain `.sqlite` file the user chose (e.g. copied out of the app data folder). */
export async function restoreSqliteFile(j: Journal, bytes: Uint8Array): Promise<void> {
  if (!isSqliteFile(bytes)) throw new Error("that file is not a SQLite database");
  await j.replaceDatabase(bytes);
}

export function isJournalEmpty(j: Journal): boolean {
  return j.entries.count() === 0 && j.convictions.count() === 0 && j.reviews.list().length === 0;
}

function parseExport(text: string): JournalExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("that file is not valid JSON");
  }
  if (typeof data !== "object" || data === null) throw new Error("that file is not a journal export");
  const d = data as Partial<JournalExport>;
  if (d.format !== "journal-export" || d.version !== 1) throw new Error("that file is not a journal export this version understands");
  if (!Array.isArray(d.entries) || !Array.isArray(d.convictions) || !Array.isArray(d.reviews)) {
    throw new Error("the export is missing its entries, convictions or reviews");
  }
  return d as JournalExport;
}

/**
 * Restore a JSON export into an empty journal, preserving ids, timestamps and every
 * conviction version. Direct SQL because the repositories mint fresh ids.
 */
export async function importJson(j: Journal, text: string): Promise<{ entries: number; convictions: number; reviews: number }> {
  if (!isJournalEmpty(j)) throw new Error("the journal is not empty");
  const data = parseExport(text);
  const db = j.db;

  db.transaction(() => {
    const tagIds: Record<string, string> = {};
    for (const e of data.entries) {
      db.run("INSERT INTO entries(id, entry_date, created_at, updated_at, title, kind, favorite, source_device) VALUES (?,?,?,?,?,?,?,?)", [
        e.id,
        e.entryDate,
        e.createdAt,
        e.updatedAt,
        e.title ?? "",
        e.kind ?? "daily",
        e.favorite ? 1 : 0,
        e.sourceDevice ?? "",
      ]);
      (e.blocks ?? []).forEach((b, i) => {
        db.run("INSERT INTO blocks(id, entry_id, type, content, position, metadata) VALUES (?,?,?,?,?,?)", [
          b.id,
          e.id,
          b.type,
          b.content ?? "",
          typeof b.position === "number" ? b.position : i,
          JSON.stringify(b.metadata ?? {}),
        ]);
      });
      for (const raw of e.tags ?? []) {
        const name = raw.trim().toLowerCase();
        if (name.length === 0) continue;
        let id = tagIds[name];
        if (!id) {
          id = newId();
          tagIds[name] = id;
          db.run("INSERT INTO tags(id, name) VALUES (?, ?)", [id, name]);
        }
        db.run("INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES (?, ?)", [e.id, id]);
      }
    }

    const entryIds: Record<string, true> = {};
    for (const e of data.entries) entryIds[e.id] = true;

    for (const c of data.convictions) {
      const versions = [...(c.versions ?? [])].sort((a, b) => a.versionNo - b.versionNo);
      if (versions.length === 0) continue;
      const currentId = versions.some((v) => v.id === c.current?.id) ? c.current.id : versions[versions.length - 1].id;
      db.run(
        "INSERT INTO convictions(id, kind, created_at, updated_at, source_entry_id, source_block_id, current_version_id) VALUES (?,?,?,?,?,?,?)",
        [
          c.id,
          c.kind ?? "conviction",
          c.createdAt,
          c.updatedAt ?? c.createdAt,
          c.sourceEntryId && entryIds[c.sourceEntryId] ? c.sourceEntryId : null,
          c.sourceBlockId ?? null,
          currentId,
        ],
      );
      for (const v of versions) {
        db.run(
          `INSERT INTO conviction_versions(id, conviction_id, version_no, created_at, statement, context, reasoning, confidence,
            evidence, uncertainties, change_triggers, cost_of_ignoring, next_action, if_condition, then_action, review_date, status, change_note)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            v.id,
            c.id,
            v.versionNo,
            v.createdAt,
            v.statement ?? "",
            v.context ?? "",
            v.reasoning ?? "",
            v.confidence ?? null,
            v.evidence ?? "",
            v.uncertainties ?? "",
            v.changeTriggers ?? "",
            v.costOfIgnoring ?? "",
            v.nextAction ?? "",
            v.ifThen?.condition ?? null,
            v.ifThen?.action ?? null,
            v.reviewDate ?? null,
            v.status ?? "active",
            v.changeNote ?? "",
          ],
        );
      }
      for (const l of c.links ?? []) {
        if (!entryIds[l.entryId]) continue;
        db.run("INSERT OR REPLACE INTO conviction_links(conviction_id, entry_id, note, created_at) VALUES (?,?,?,?)", [
          c.id,
          l.entryId,
          l.note ?? "",
          l.createdAt ?? c.createdAt,
        ]);
      }
    }

    for (const r of data.reviews) {
      db.run(
        "INSERT OR REPLACE INTO reviews(id, week_start, created_at, updated_at, content, ai_draft, ai_draft_model, ai_draft_created_at) VALUES (?,?,?,?,?,?,?,?)",
        [r.id, r.weekStart, r.createdAt, r.updatedAt ?? r.createdAt, r.content ?? "", r.aiDraft ?? null, r.aiDraftModel ?? null, r.aiDraftCreatedAt ?? null],
      );
    }
  });

  if (data.settings && typeof data.settings === "object") {
    const { lock: _lock, ...rest } = data.settings as Partial<Settings>;
    j.settings.update(rest);
  }
  await db.flush();
  for (const t of ["entries", "convictions", "reviews", "settings"] as const) changes.emit(t);
  return { entries: data.entries.length, convictions: data.convictions.length, reviews: data.reviews.length };
}
