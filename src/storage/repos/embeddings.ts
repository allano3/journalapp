import type { SqlDriver } from "../driver";
import { newId } from "../../domain/ids";
import { nowIso } from "../../domain/dates";
import { bytesToFloat32, float32ToBytes } from "../../domain/similarity";

export type EmbeddingOwner = "block" | "conviction";

export interface StoredEmbedding {
  id: string;
  ownerType: EmbeddingOwner;
  ownerId: string;
  chunkIndex: number;
  model: string;
  textHash: string;
  text: string;
  vector: Float32Array;
}

/** Local semantic index: one row per chunk, vector stored as float32 bytes. */
export class EmbeddingsRepo {
  constructor(private readonly db: SqlDriver) {}

  /** (ownerId → hash) for every owner already indexed under `model`. Chunk 0's hash covers the whole text. */
  indexedHashes(ownerType: EmbeddingOwner, model: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.db.all<{ owner_id: string; text_hash: string }>(
      "SELECT owner_id, text_hash FROM embeddings WHERE owner_type = ? AND model = ? AND chunk_index = 0",
      [ownerType, model],
    ))
      out[r.owner_id] = r.text_hash;
    return out;
  }

  replace(ownerType: EmbeddingOwner, ownerId: string, model: string, textHash: string, chunks: { index: number; text: string; vector: Float32Array }[]): void {
    this.db.transaction(() => {
      this.db.run("DELETE FROM embeddings WHERE owner_type = ? AND owner_id = ?", [ownerType, ownerId]);
      for (const c of chunks) {
        this.db.run(
          "INSERT INTO embeddings(id, owner_type, owner_id, chunk_index, model, text_hash, text, vector, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          [newId(), ownerType, ownerId, c.index, model, textHash, c.text, float32ToBytes(c.vector), nowIso()],
        );
      }
    });
  }

  remove(ownerType: EmbeddingOwner, ownerId: string): void {
    this.db.run("DELETE FROM embeddings WHERE owner_type = ? AND owner_id = ?", [ownerType, ownerId]);
  }

  all(model: string): StoredEmbedding[] {
    return this.db
      .all<{
        id: string;
        owner_type: string;
        owner_id: string;
        chunk_index: number;
        model: string;
        text_hash: string;
        text: string;
        vector: Uint8Array;
      }>("SELECT * FROM embeddings WHERE model = ?", [model])
      .map((r) => ({
        id: r.id,
        ownerType: r.owner_type as EmbeddingOwner,
        ownerId: r.owner_id,
        chunkIndex: r.chunk_index,
        model: r.model,
        textHash: r.text_hash,
        text: r.text,
        vector: bytesToFloat32(r.vector),
      }));
  }

  count(model?: string): number {
    return model
      ? (this.db.get<{ n: number }>("SELECT COUNT(DISTINCT owner_id) n FROM embeddings WHERE model = ?", [model])?.n ?? 0)
      : (this.db.get<{ n: number }>("SELECT COUNT(DISTINCT owner_id) n FROM embeddings")?.n ?? 0);
  }

  clear(): void {
    this.db.run("DELETE FROM embeddings");
  }
}
