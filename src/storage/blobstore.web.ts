import type { BlobStore } from "./driver";

const DB_NAME = "journal-store";
const STORE = "files";
const KEY = "journal.sqlite";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Browser/PWA persistence: the SQLite file bytes stored in IndexedDB on this device.
 * On first load we ask the browser to mark the origin's storage as persistent so the
 * journal is not evicted under storage pressure (installed PWAs usually get this).
 */
export class IndexedDbBlobStore implements BlobStore {
  private persisted: boolean | null = null;

  async load(): Promise<Uint8Array | null> {
    if (this.persisted === null && navigator.storage?.persist) {
      this.persisted = await navigator.storage.persist().catch(() => false);
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null);
      req.onerror = () => reject(req.error);
    });
  }

  async save(bytes: Uint8Array): Promise<void> {
    const db = await openIdb();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(copy.buffer, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  describe(): string {
    const mode = window.matchMedia("(display-mode: standalone)").matches ? "installed app" : "browser";
    const durability = this.persisted === true ? "persistent" : this.persisted === false ? "best-effort, back up regularly" : "";
    return `This device (${mode} storage${durability ? ", " + durability : ""})`;
  }
}
