import type { BlobStore, SqlDriver } from "./driver";
import { SqliteDriver } from "./sqlite";
import { IndexedDbBlobStore } from "./blobstore.web";
import { TauriFileBlobStore, isTauri } from "./blobstore.tauri";
import { migrate } from "./migrations";
import { EntriesRepo } from "./repos/entries";
import { ConvictionsRepo } from "./repos/convictions";
import { ReviewsRepo } from "./repos/reviews";
import { SettingsRepo } from "./repos/settings";
import { EmbeddingsRepo } from "./repos/embeddings";
import { ArtifactsRepo } from "./repos/artifacts";
import { changes } from "../state/events";

/** Everything the app needs to talk to local storage. One instance per process. */
export interface Journal {
  db: SqlDriver;
  store: BlobStore;
  entries: EntriesRepo;
  convictions: ConvictionsRepo;
  reviews: ReviewsRepo;
  settings: SettingsRepo;
  embeddings: EmbeddingsRepo;
  artifacts: ArtifactsRepo;
  /** Replace the whole database (restore). Re-runs migrations and notifies all views. */
  replaceDatabase(bytes: Uint8Array): Promise<void>;
  /** Wipe every table. */
  eraseAll(): Promise<void>;
}

let instance: Journal | null = null;
let opening: Promise<Journal> | null = null;

function buildRepos(db: SqlDriver, store: BlobStore): Journal {
  const j: Journal = {
    db,
    store,
    entries: new EntriesRepo(db),
    convictions: new ConvictionsRepo(db),
    reviews: new ReviewsRepo(db),
    settings: new SettingsRepo(db),
    embeddings: new EmbeddingsRepo(db),
    artifacts: new ArtifactsRepo(db),
    async replaceDatabase(bytes) {
      db.import(bytes);
      migrate(db);
      j.settings.invalidate();
      await db.flush();
      for (const t of ["entries", "convictions", "reviews", "settings", "embeddings", "ai"] as const) changes.emit(t);
    },
    async eraseAll() {
      db.transaction(() => {
        for (const t of [
          "conviction_links",
          "conviction_versions",
          "convictions",
          "entry_tags",
          "tags",
          "blocks",
          "entries",
          "reviews",
          "ai_artifacts",
          "embeddings",
          "settings",
          "tombstones",
        ])
          db.run(`DELETE FROM ${t}`);
      });
      j.settings.invalidate();
      await db.flush();
      for (const t of ["entries", "convictions", "reviews", "settings", "embeddings", "ai"] as const) changes.emit(t);
    },
  };
  return j;
}

/**
 * Open (once) the local database. Concurrent callers share the same promise, so React
 * StrictMode's double-invoked effects never create two in-memory databases writing to
 * the same file.
 */
export function openJournal(): Promise<Journal> {
  if (instance) return Promise.resolve(instance);
  if (opening) return opening;
  opening = (async () => {
    const store: BlobStore = isTauri() ? new TauriFileBlobStore() : new IndexedDbBlobStore();
    const driver = await SqliteDriver.open(store);
    migrate(driver);
    await driver.flush();
    instance = buildRepos(driver, store);
    window.addEventListener("beforeunload", () => void driver.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void driver.flush();
    });
    return instance;
  })();
  return opening;
}

/** Synchronous access after `openJournal` resolved (UI code runs after the splash). */
export function journal(): Journal {
  if (!instance) throw new Error("journal not opened");
  return instance;
}
