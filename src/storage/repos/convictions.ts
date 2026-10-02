import type { SqlDriver } from "../driver";
import type {
  Confidence,
  Conviction,
  ConvictionKind,
  ConvictionLink,
  ConvictionStatus,
  ConvictionVersion,
  ISODate,
} from "../../domain/types";
import { newId } from "../../domain/ids";
import { nowIso } from "../../domain/dates";
import { changes } from "../../state/events";

interface ConvictionRow {
  id: string;
  kind: string;
  created_at: string;
  updated_at: string;
  source_entry_id: string | null;
  source_block_id: string | null;
  current_version_id: string | null;
}

interface VersionRow {
  id: string;
  conviction_id: string;
  version_no: number;
  created_at: string;
  statement: string;
  context: string;
  reasoning: string;
  confidence: number | null;
  evidence: string;
  uncertainties: string;
  change_triggers: string;
  cost_of_ignoring: string;
  next_action: string;
  if_condition: string | null;
  then_action: string | null;
  review_date: string | null;
  status: string;
  change_note: string;
}

/** Everything a version holds except identity/sequence. */
export type VersionInput = Omit<ConvictionVersion, "id" | "convictionId" | "versionNo" | "createdAt">;

export const EMPTY_VERSION: VersionInput = {
  statement: "",
  context: "",
  reasoning: "",
  confidence: null,
  evidence: "",
  uncertainties: "",
  changeTriggers: "",
  costOfIgnoring: "",
  nextAction: "",
  ifThen: null,
  reviewDate: null,
  status: "active",
  changeNote: "",
};

export interface ConvictionListItem {
  id: string;
  kind: ConvictionKind;
  createdAt: string;
  updatedAt: string;
  statement: string;
  status: ConvictionStatus;
  confidence: Confidence | null;
  reviewDate: ISODate | null;
  versionCount: number;
  /** Date of the latest version (when it last changed). */
  changedAt: string;
}

export class ConvictionsRepo {
  constructor(private readonly db: SqlDriver) {}

  private rowToVersion(r: VersionRow): ConvictionVersion {
    return {
      id: r.id,
      convictionId: r.conviction_id,
      versionNo: r.version_no,
      createdAt: r.created_at,
      statement: r.statement,
      context: r.context,
      reasoning: r.reasoning,
      confidence: (r.confidence as Confidence | null) ?? null,
      evidence: r.evidence,
      uncertainties: r.uncertainties,
      changeTriggers: r.change_triggers,
      costOfIgnoring: r.cost_of_ignoring,
      nextAction: r.next_action,
      ifThen: r.if_condition || r.then_action ? { condition: r.if_condition ?? "", action: r.then_action ?? "" } : null,
      reviewDate: r.review_date,
      status: r.status as ConvictionStatus,
      changeNote: r.change_note,
    };
  }

  get(id: string): Conviction | null {
    const r = this.db.get<ConvictionRow>("SELECT * FROM convictions WHERE id = ?", [id]);
    if (!r) return null;
    const versions = this.db
      .all<VersionRow>("SELECT * FROM conviction_versions WHERE conviction_id = ? ORDER BY version_no", [id])
      .map((v) => this.rowToVersion(v));
    const current = versions.find((v) => v.id === r.current_version_id) ?? versions[versions.length - 1];
    return {
      id: r.id,
      kind: r.kind as ConvictionKind,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sourceEntryId: r.source_entry_id,
      sourceBlockId: r.source_block_id,
      current,
      versions,
      linkedEntryIds: this.db
        .all<{ entry_id: string }>("SELECT entry_id FROM conviction_links WHERE conviction_id = ? ORDER BY created_at", [id])
        .map((x) => x.entry_id),
    };
  }

  create(input: {
    kind: ConvictionKind;
    version: Partial<VersionInput>;
    sourceEntryId?: string | null;
    sourceBlockId?: string | null;
    createdAt?: string;
  }): Conviction {
    const id = newId();
    const ts = input.createdAt ?? nowIso();
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO convictions(id, kind, created_at, updated_at, source_entry_id, source_block_id, current_version_id) VALUES (?,?,?,?,?,?,NULL)",
        [id, input.kind, ts, ts, input.sourceEntryId ?? null, input.sourceBlockId ?? null],
      );
      this.insertVersion(id, 1, { ...EMPTY_VERSION, ...input.version }, ts);
    });
    changes.emit("convictions");
    return this.get(id)!;
  }

  /**
   * Record a new version. The previous version is never modified. `patch` is merged
   * over the current version so callers can change one field (e.g. status) alone.
   */
  addVersion(convictionId: string, patch: Partial<VersionInput>, createdAt?: string): Conviction {
    const c = this.get(convictionId);
    if (!c) throw new Error("conviction not found");
    const ts = createdAt ?? nowIso();
    const { id: _id, convictionId: _cid, versionNo, createdAt: _ca, ...base } = c.current;
    this.db.transaction(() => {
      this.insertVersion(convictionId, versionNo + 1, { ...base, changeNote: "", ...patch }, ts);
    });
    changes.emit("convictions");
    return this.get(convictionId)!;
  }

  private insertVersion(convictionId: string, versionNo: number, v: VersionInput, ts: string): void {
    const id = newId();
    this.db.run(
      `INSERT INTO conviction_versions(id, conviction_id, version_no, created_at, statement, context, reasoning, confidence,
        evidence, uncertainties, change_triggers, cost_of_ignoring, next_action, if_condition, then_action, review_date, status, change_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        convictionId,
        versionNo,
        ts,
        v.statement,
        v.context,
        v.reasoning,
        v.confidence,
        v.evidence,
        v.uncertainties,
        v.changeTriggers,
        v.costOfIgnoring,
        v.nextAction,
        v.ifThen?.condition ?? null,
        v.ifThen?.action ?? null,
        v.reviewDate,
        v.status,
        v.changeNote,
      ],
    );
    this.db.run("UPDATE convictions SET current_version_id = ?, updated_at = ? WHERE id = ?", [id, ts, convictionId]);
  }

  delete(id: string): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM convictions WHERE id = ?", [id]);
      this.db.run("DELETE FROM embeddings WHERE owner_type = 'conviction' AND owner_id = ?", [id]);
      this.db.run("INSERT OR REPLACE INTO tombstones(table_name, row_id, deleted_at) VALUES ('convictions', ?, ?)", [id, nowIso()]);
    });
    changes.emit("convictions");
  }

  link(convictionId: string, entryId: string, note = ""): void {
    this.db.run(
      "INSERT OR REPLACE INTO conviction_links(conviction_id, entry_id, note, created_at) VALUES (?,?,?,?)",
      [convictionId, entryId, note, nowIso()],
    );
    changes.emit("convictions");
  }

  unlink(convictionId: string, entryId: string): void {
    this.db.run("DELETE FROM conviction_links WHERE conviction_id = ? AND entry_id = ?", [convictionId, entryId]);
    changes.emit("convictions");
  }

  links(convictionId: string): ConvictionLink[] {
    return this.db
      .all<{ conviction_id: string; entry_id: string; note: string; created_at: string }>(
        "SELECT * FROM conviction_links WHERE conviction_id = ? ORDER BY created_at",
        [convictionId],
      )
      .map((r) => ({ convictionId: r.conviction_id, entryId: r.entry_id, note: r.note, createdAt: r.created_at }));
  }

  /** Convictions linked to or sourced from an entry. */
  forEntry(entryId: string): ConvictionListItem[] {
    const ids = this.db
      .all<{ id: string }>(
        "SELECT id FROM convictions WHERE source_entry_id = ? UNION SELECT conviction_id FROM conviction_links WHERE entry_id = ?",
        [entryId, entryId],
      )
      .map((r) => r.id);
    return this.list().filter((c) => ids.includes(c.id));
  }

  list(opts: { status?: ConvictionStatus[]; kind?: ConvictionKind } = {}): ConvictionListItem[] {
    const where: string[] = [];
    const params: string[] = [];
    if (opts.status && opts.status.length > 0) {
      where.push(`v.status IN (${opts.status.map(() => "?").join(",")})`);
      params.push(...opts.status);
    }
    if (opts.kind) {
      where.push("c.kind = ?");
      params.push(opts.kind);
    }
    return this.db
      .all<{
        id: string;
        kind: string;
        created_at: string;
        updated_at: string;
        statement: string;
        status: string;
        confidence: number | null;
        review_date: string | null;
        version_count: number;
        changed_at: string;
      }>(
        `SELECT c.id, c.kind, c.created_at, c.updated_at, v.statement, v.status, v.confidence, v.review_date, v.created_at AS changed_at,
           (SELECT COUNT(*) FROM conviction_versions x WHERE x.conviction_id = c.id) AS version_count
         FROM convictions c JOIN conviction_versions v ON v.id = c.current_version_id
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY c.created_at DESC`,
        params,
      )
      .map((r) => ({
        id: r.id,
        kind: r.kind as ConvictionKind,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        statement: r.statement,
        status: r.status as ConvictionStatus,
        confidence: (r.confidence as Confidence | null) ?? null,
        reviewDate: r.review_date,
        versionCount: r.version_count,
        changedAt: r.changed_at,
      }));
  }

  /** Active/reconsidering convictions whose review date is on or before `date`. */
  dueForReview(date: ISODate): ConvictionListItem[] {
    return this.list({ status: ["active", "reconsidering"] }).filter((c) => c.reviewDate !== null && c.reviewDate <= date);
  }

  /** Convictions whose latest version was created in [from, to] timestamps and has more than one version. */
  changedBetween(fromTs: string, toTs: string): ConvictionListItem[] {
    return this.list().filter((c) => c.versionCount > 1 && c.changedAt >= fromTs && c.changedAt <= toTs);
  }

  createdBetween(fromTs: string, toTs: string): ConvictionListItem[] {
    return this.list().filter((c) => c.createdAt >= fromTs && c.createdAt <= toTs);
  }

  count(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) n FROM convictions")?.n ?? 0;
  }
}
