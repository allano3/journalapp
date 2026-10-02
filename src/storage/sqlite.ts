import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { BlobStore, Row, SqlDriver, SqlParams } from "./driver";

const SAVE_DEBOUNCE_MS = 800;

/**
 * SQLite (official WebAssembly build, FTS5 enabled) held in memory and persisted as a
 * whole file through a BlobStore on a debounce after writes.
 */
export class SqliteDriver implements SqlDriver {
  private db: Database;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private depth = 0;

  private constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly store: BlobStore,
    bytes: Uint8Array | null,
  ) {
    this.db = new sqlite3.oo1.DB(":memory:");
    if (bytes) this.deserialize(bytes);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  static async open(store: BlobStore): Promise<SqliteDriver> {
    const sqlite3 = await sqlite3InitModule();
    const bytes = await store.load();
    return new SqliteDriver(sqlite3, store, bytes);
  }

  private deserialize(bytes: Uint8Array): void {
    const { capi, wasm } = this.sqlite3;
    const p = wasm.allocFromTypedArray(bytes);
    const rc = capi.sqlite3_deserialize(
      this.db.pointer!,
      "main",
      p,
      bytes.length,
      bytes.length,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    if (rc !== 0) throw new Error(`sqlite3_deserialize failed: ${rc}`);
  }

  run(sql: string, params: SqlParams = []): void {
    this.db.exec({ sql, bind: params });
    this.markDirty();
  }

  all<T = Row>(sql: string, params: SqlParams = []): T[] {
    return this.db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" }) as T[];
  }

  get<T = Row>(sql: string, params: SqlParams = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec("BEGIN");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      this.depth--;
      this.markDirty();
      return out;
    } catch (e) {
      this.depth--;
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  export(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db.pointer!);
  }

  import(bytes: Uint8Array): void {
    this.db.close();
    this.db = new this.sqlite3.oo1.DB(":memory:");
    this.deserialize(bytes);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.markDirty();
  }

  markDirty(): void {
    if (this.depth > 0) return;
    this.dirty = true;
    clearTimeout(this.timer ?? undefined);
    this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer ?? undefined);
    this.timer = null;
    if (!this.dirty) return this.saving;
    this.dirty = false;
    const bytes = this.export();
    this.saving = this.saving.then(() => this.store.save(bytes)).catch((e) => {
      console.error("journal: persist failed", e);
      this.dirty = true;
    });
    return this.saving;
  }
}
