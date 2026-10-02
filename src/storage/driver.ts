export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[];
export type Row = Record<string, SqlValue>;

/**
 * Minimal synchronous SQL surface over an in-memory SQLite database. Repositories
 * depend only on this. `persist` is scheduled by `run` and flushed by the owner.
 */
export interface SqlDriver {
  run(sql: string, params?: SqlParams): void;
  all<T = Row>(sql: string, params?: SqlParams): T[];
  get<T = Row>(sql: string, params?: SqlParams): T | undefined;
  transaction<T>(fn: () => T): T;
  /** Serialize the whole database to bytes (SQLite file format). */
  export(): Uint8Array;
  /** Replace the whole database with the given SQLite file bytes. */
  import(bytes: Uint8Array): void;
  /** Flush pending persistence immediately. */
  flush(): Promise<void>;
  /** Called after every write; the driver persists on a debounce. */
  markDirty(): void;
}

/** Where the serialized database lives per platform. */
export interface BlobStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
  /** Human-readable location shown in the privacy indicator. */
  describe(): string;
}
