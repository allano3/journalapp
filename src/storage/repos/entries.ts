import type { SqlDriver } from "../driver";
import type { Block, BlockMetadata, BlockType, Entry, EntryKind, EntrySummary, ISODate } from "../../domain/types";
import { newId } from "../../domain/ids";
import { nowIso, addDays } from "../../domain/dates";
import { firstLine, markdownToPlain, truncate, wordCount } from "../../domain/text";
import { changes } from "../../state/events";

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
}

export interface NewBlock {
  id?: string;
  type: BlockType;
  content: string;
  position?: number;
  metadata?: BlockMetadata;
}

export interface EntryPatch {
  title?: string;
  entryDate?: ISODate;
  favorite?: boolean;
  tags?: string[];
  /** Full replacement of the block list; blocks keep ids when provided. */
  blocks?: NewBlock[];
}

export class EntriesRepo {
  constructor(private readonly db: SqlDriver) {}

  private rowToBlock(r: BlockRow): Block {
    return {
      id: r.id,
      entryId: r.entry_id,
      type: r.type as BlockType,
      content: r.content,
      position: r.position,
      metadata: JSON.parse(r.metadata || "{}") as BlockMetadata,
    };
  }

  private tagsFor(entryId: string): string[] {
    return this.db
      .all<{ name: string }>(
        "SELECT t.name FROM tags t JOIN entry_tags et ON et.tag_id = t.id WHERE et.entry_id = ? ORDER BY t.name",
        [entryId],
      )
      .map((r) => r.name);
  }

  get(id: string): Entry | null {
    const r = this.db.get<EntryRow>("SELECT * FROM entries WHERE id = ?", [id]);
    if (!r) return null;
    const blocks = this.db
      .all<BlockRow>("SELECT * FROM blocks WHERE entry_id = ? ORDER BY position", [id])
      .map((b) => this.rowToBlock(b));
    return {
      id: r.id,
      entryDate: r.entry_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      title: r.title,
      kind: r.kind as EntryKind,
      favorite: r.favorite === 1,
      sourceDevice: r.source_device,
      tags: this.tagsFor(id),
      blocks,
    };
  }

  /** The daily entry for a date, if one exists (quick notes are separate). */
  getDaily(date: ISODate): Entry | null {
    const r = this.db.get<{ id: string }>(
      "SELECT id FROM entries WHERE entry_date = ? AND kind = 'daily' ORDER BY created_at LIMIT 1",
      [date],
    );
    return r ? this.get(r.id) : null;
  }

  getBlock(blockId: string): Block | null {
    const r = this.db.get<BlockRow>("SELECT * FROM blocks WHERE id = ?", [blockId]);
    return r ? this.rowToBlock(r) : null;
  }

  create(input: {
    entryDate: ISODate;
    kind: EntryKind;
    title?: string;
    blocks?: NewBlock[];
    tags?: string[];
    sourceDevice?: string;
    createdAt?: string;
  }): Entry {
    const id = newId();
    const ts = input.createdAt ?? nowIso();
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO entries(id, entry_date, created_at, updated_at, title, kind, favorite, source_device) VALUES (?,?,?,?,?,?,0,?)",
        [id, input.entryDate, ts, ts, input.title ?? "", input.kind, input.sourceDevice ?? ""],
      );
      if (input.blocks) this.replaceBlocks(id, input.blocks);
      if (input.tags) this.setTags(id, input.tags);
    });
    changes.emit("entries");
    return this.get(id)!;
  }

  update(id: string, patch: EntryPatch): Entry {
    this.db.transaction(() => {
      const sets: string[] = ["updated_at = ?"];
      const params: (string | number)[] = [nowIso()];
      if (patch.title !== undefined) {
        sets.push("title = ?");
        params.push(patch.title);
      }
      if (patch.entryDate !== undefined) {
        sets.push("entry_date = ?");
        params.push(patch.entryDate);
      }
      if (patch.favorite !== undefined) {
        sets.push("favorite = ?");
        params.push(patch.favorite ? 1 : 0);
      }
      params.push(id);
      this.db.run(`UPDATE entries SET ${sets.join(", ")} WHERE id = ?`, params);
      if (patch.blocks) this.replaceBlocks(id, patch.blocks);
      if (patch.tags) this.setTags(id, patch.tags);
    });
    changes.emit("entries");
    return this.get(id)!;
  }

  /**
   * Update one block's content/metadata in place (autosave path). Only writes when
   * something changed, so the FTS index and persistence are not churned on every keystroke.
   */
  saveBlock(blockId: string, content: string, metadata?: BlockMetadata): void {
    const existing = this.db.get<BlockRow>("SELECT * FROM blocks WHERE id = ?", [blockId]);
    if (!existing) return;
    const meta = metadata === undefined ? existing.metadata : JSON.stringify(metadata);
    if (existing.content === content && existing.metadata === meta) return;
    this.db.transaction(() => {
      this.db.run("UPDATE blocks SET content = ?, metadata = ?, updated_at = ? WHERE id = ?", [content, meta, nowIso(), blockId]);
      this.db.run("UPDATE entries SET updated_at = ? WHERE id = ?", [nowIso(), existing.entry_id]);
    });
    changes.emit("entries");
  }

  addBlock(entryId: string, block: NewBlock): Block {
    const id = block.id ?? newId();
    const pos =
      block.position ??
      ((this.db.get<{ m: number | null }>("SELECT MAX(position) m FROM blocks WHERE entry_id = ?", [entryId])?.m ?? -1) + 1);
    this.db.transaction(() => {
      this.db.run("INSERT INTO blocks(id, entry_id, type, content, position, metadata, updated_at) VALUES (?,?,?,?,?,?,?)", [
        id,
        entryId,
        block.type,
        block.content,
        pos,
        JSON.stringify(block.metadata ?? {}),
        nowIso(),
      ]);
      this.db.run("UPDATE entries SET updated_at = ? WHERE id = ?", [nowIso(), entryId]);
    });
    changes.emit("entries");
    return this.getBlock(id)!;
  }

  removeBlock(blockId: string): void {
    const b = this.db.get<BlockRow>("SELECT entry_id FROM blocks WHERE id = ?", [blockId]);
    if (!b) return;
    this.db.transaction(() => {
      this.db.run("DELETE FROM blocks WHERE id = ?", [blockId]);
      this.db.run("DELETE FROM embeddings WHERE owner_type = 'block' AND owner_id = ?", [blockId]);
      this.db.run("UPDATE entries SET updated_at = ? WHERE id = ?", [nowIso(), b.entry_id]);
    });
    changes.emit("entries");
  }

  private replaceBlocks(entryId: string, blocks: NewBlock[]): void {
    const keep = blocks.map((b) => b.id).filter((x): x is string => typeof x === "string");
    const existing = this.db.all<{ id: string }>("SELECT id FROM blocks WHERE entry_id = ?", [entryId]).map((r) => r.id);
    for (const id of existing) {
      if (!keep.includes(id)) {
        this.db.run("DELETE FROM blocks WHERE id = ?", [id]);
        this.db.run("DELETE FROM embeddings WHERE owner_type = 'block' AND owner_id = ?", [id]);
      }
    }
    const ts = nowIso();
    blocks.forEach((b, i) => {
      const id = b.id ?? newId();
      const meta = JSON.stringify(b.metadata ?? {});
      const pos = b.position ?? i;
      if (existing.includes(id)) {
        this.db.run("UPDATE blocks SET type = ?, content = ?, position = ?, metadata = ?, updated_at = ? WHERE id = ?", [
          b.type,
          b.content,
          pos,
          meta,
          ts,
          id,
        ]);
      } else {
        this.db.run("INSERT INTO blocks(id, entry_id, type, content, position, metadata, updated_at) VALUES (?,?,?,?,?,?,?)", [
          id,
          entryId,
          b.type,
          b.content,
          pos,
          meta,
          ts,
        ]);
      }
    });
  }

  setTags(entryId: string, tags: string[]): void {
    const names = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))];
    this.db.transaction(() => {
      this.db.run("DELETE FROM entry_tags WHERE entry_id = ?", [entryId]);
      for (const name of names) {
        let tag = this.db.get<{ id: string }>("SELECT id FROM tags WHERE name = ?", [name]);
        if (!tag) {
          tag = { id: newId() };
          this.db.run("INSERT INTO tags(id, name) VALUES (?, ?)", [tag.id, name]);
        }
        this.db.run("INSERT OR IGNORE INTO entry_tags(entry_id, tag_id) VALUES (?, ?)", [entryId, tag.id]);
      }
      this.db.run("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM entry_tags)");
    });
    changes.emit("entries");
  }

  allTags(): { name: string; count: number }[] {
    return this.db.all<{ name: string; count: number }>(
      "SELECT t.name, COUNT(et.entry_id) AS count FROM tags t LEFT JOIN entry_tags et ON et.tag_id = t.id GROUP BY t.id ORDER BY count DESC, t.name",
    );
  }

  delete(id: string): void {
    this.db.transaction(() => {
      const blockIds = this.db.all<{ id: string }>("SELECT id FROM blocks WHERE entry_id = ?", [id]).map((r) => r.id);
      for (const b of blockIds) this.db.run("DELETE FROM embeddings WHERE owner_type = 'block' AND owner_id = ?", [b]);
      this.db.run("DELETE FROM entries WHERE id = ?", [id]);
      this.db.run("INSERT OR REPLACE INTO tombstones(table_name, row_id, deleted_at) VALUES ('entries', ?, ?)", [id, nowIso()]);
      this.db.run("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM entry_tags)");
    });
    changes.emit("entries");
  }

  /** Summaries, newest first. `from`/`to` inclusive calendar dates. */
  list(opts: { from?: ISODate; to?: ISODate; kind?: EntryKind; favoritesOnly?: boolean; tag?: string; limit?: number; offset?: number } = {}): EntrySummary[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.from) {
      where.push("e.entry_date >= ?");
      params.push(opts.from);
    }
    if (opts.to) {
      where.push("e.entry_date <= ?");
      params.push(opts.to);
    }
    if (opts.kind) {
      where.push("e.kind = ?");
      params.push(opts.kind);
    }
    if (opts.favoritesOnly) where.push("e.favorite = 1");
    if (opts.tag) {
      where.push("e.id IN (SELECT et.entry_id FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = ?)");
      params.push(opts.tag);
    }
    const sql = `SELECT e.* FROM entries e ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY e.entry_date DESC, e.created_at DESC
      ${opts.limit ? `LIMIT ${Number(opts.limit)} OFFSET ${Number(opts.offset ?? 0)}` : ""}`;
    return this.db.all<EntryRow>(sql, params).map((r) => this.summarize(r));
  }

  summarize(r: EntryRow): EntrySummary {
    const blocks = this.db.all<{ content: string }>("SELECT content FROM blocks WHERE entry_id = ? ORDER BY position", [r.id]);
    const text = blocks.map((b) => b.content).join("\n");
    const first = blocks.find((b) => b.content.trim().length > 0)?.content ?? "";
    return {
      id: r.id,
      entryDate: r.entry_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      title: r.title || (r.kind === "note" ? truncate(firstLine(first), 80) : ""),
      kind: r.kind as EntryKind,
      favorite: r.favorite === 1,
      tags: this.tagsFor(r.id),
      preview: truncate(markdownToPlain(first).replace(/\s+/g, " "), 220),
      wordCount: wordCount(text),
    };
  }

  summary(id: string): EntrySummary | null {
    const r = this.db.get<EntryRow>("SELECT * FROM entries WHERE id = ?", [id]);
    return r ? this.summarize(r) : null;
  }

  /** Dates with at least one entry in [from, to], with counts. */
  datesWithEntries(from: ISODate, to: ISODate): { date: ISODate; count: number }[] {
    return this.db.all<{ date: string; count: number }>(
      "SELECT entry_date AS date, COUNT(*) AS count FROM entries WHERE entry_date BETWEEN ? AND ? GROUP BY entry_date",
      [from, to],
    );
  }

  count(): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) n FROM entries")?.n ?? 0;
  }

  /** Entries near a target date (±window days), oldest first. For "on this day". */
  around(date: ISODate, window = 2): EntrySummary[] {
    return this.list({ from: addDays(date, -window), to: addDays(date, window) }).reverse();
  }

  /** Full text of all blocks of an entry, plain. */
  plainText(id: string): string {
    return this.db
      .all<{ content: string }>("SELECT content FROM blocks WHERE entry_id = ? ORDER BY position", [id])
      .map((b) => markdownToPlain(b.content))
      .filter((t) => t.length > 0)
      .join("\n\n");
  }
}
