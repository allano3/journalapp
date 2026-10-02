import type { SqlDriver } from "./driver";

/**
 * Forward-only migrations. Append new entries; never edit a shipped one.
 * Every table carries sortable ids and timestamps so a future encrypted sync can merge
 * rows by (id, updated_at); deletions are recorded in `tombstones`.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        entry_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'daily',
        favorite INTEGER NOT NULL DEFAULT 0,
        source_device TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX entries_date ON entries(entry_date);

      CREATE TABLE blocks (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX blocks_entry ON blocks(entry_id, position);

      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE entry_tags (
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (entry_id, tag_id)
      );

      CREATE VIRTUAL TABLE blocks_fts USING fts5(
        content,
        block_id UNINDEXED,
        entry_id UNINDEXED,
        tokenize = 'porter unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
        INSERT INTO blocks_fts(content, block_id, entry_id) VALUES (new.content, new.id, new.entry_id);
      END;
      CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
        DELETE FROM blocks_fts WHERE block_id = old.id;
      END;
      CREATE TRIGGER blocks_au AFTER UPDATE OF content ON blocks BEGIN
        DELETE FROM blocks_fts WHERE block_id = old.id;
        INSERT INTO blocks_fts(content, block_id, entry_id) VALUES (new.content, new.id, new.entry_id);
      END;

      CREATE TABLE convictions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'conviction',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source_entry_id TEXT REFERENCES entries(id) ON DELETE SET NULL,
        source_block_id TEXT,
        current_version_id TEXT
      );

      CREATE TABLE conviction_versions (
        id TEXT PRIMARY KEY,
        conviction_id TEXT NOT NULL REFERENCES convictions(id) ON DELETE CASCADE,
        version_no INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        statement TEXT NOT NULL DEFAULT '',
        context TEXT NOT NULL DEFAULT '',
        reasoning TEXT NOT NULL DEFAULT '',
        confidence INTEGER,
        evidence TEXT NOT NULL DEFAULT '',
        uncertainties TEXT NOT NULL DEFAULT '',
        change_triggers TEXT NOT NULL DEFAULT '',
        cost_of_ignoring TEXT NOT NULL DEFAULT '',
        next_action TEXT NOT NULL DEFAULT '',
        if_condition TEXT,
        then_action TEXT,
        review_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        change_note TEXT NOT NULL DEFAULT '',
        UNIQUE (conviction_id, version_no)
      );

      CREATE VIRTUAL TABLE convictions_fts USING fts5(
        content,
        version_id UNINDEXED,
        conviction_id UNINDEXED,
        tokenize = 'porter unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER cv_ai AFTER INSERT ON conviction_versions BEGIN
        INSERT INTO convictions_fts(content, version_id, conviction_id)
        VALUES (new.statement || ' ' || new.context || ' ' || new.reasoning || ' ' || new.evidence || ' ' ||
                new.uncertainties || ' ' || new.change_triggers || ' ' || new.cost_of_ignoring || ' ' ||
                new.next_action || ' ' || new.change_note, new.id, new.conviction_id);
      END;
      CREATE TRIGGER cv_ad AFTER DELETE ON conviction_versions BEGIN
        DELETE FROM convictions_fts WHERE version_id = old.id;
      END;

      CREATE TABLE conviction_links (
        conviction_id TEXT NOT NULL REFERENCES convictions(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        PRIMARY KEY (conviction_id, entry_id)
      );

      CREATE TABLE reviews (
        id TEXT PRIMARY KEY,
        week_start TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        ai_draft TEXT,
        ai_draft_model TEXT,
        ai_draft_created_at TEXT
      );

      CREATE TABLE ai_artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        model TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX ai_artifacts_owner ON ai_artifacts(owner_type, owner_id);

      CREATE TABLE embeddings (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        model TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        text TEXT NOT NULL,
        vector BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX embeddings_owner ON embeddings(owner_type, owner_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE tombstones (
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (table_name, row_id)
      );
    `,
  },
];

export function migrate(db: SqlDriver): void {
  db.run("CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const row = db.get<{ v: number | null }>("SELECT MAX(version) AS v FROM migrations");
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.run(m.sql);
      db.run("INSERT INTO migrations(version, applied_at) VALUES (?, ?)", [m.version, new Date().toISOString()]);
    });
  }
}

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
