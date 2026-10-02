import { BaseDirectory, exists, mkdir, readFile, rename, writeFile } from "@tauri-apps/plugin-fs";
import type { BlobStore } from "./driver";

const FILE = "journal.sqlite";
const OPTS = { baseDir: BaseDirectory.AppData };

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Desktop/mobile persistence: the SQLite file in the app data directory.
 * Written via temp file + rename so a crash mid-write never corrupts the journal.
 */
export class TauriFileBlobStore implements BlobStore {
  async load(): Promise<Uint8Array | null> {
    if (!(await exists(FILE, OPTS))) return null;
    return readFile(FILE, OPTS);
  }

  async save(bytes: Uint8Array): Promise<void> {
    if (!(await exists("", OPTS))) await mkdir("", { ...OPTS, recursive: true });
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, bytes, OPTS);
    await rename(tmp, FILE, { oldPathBaseDir: OPTS.baseDir, newPathBaseDir: OPTS.baseDir });
  }

  describe(): string {
    return "This device (application data folder)";
  }
}
