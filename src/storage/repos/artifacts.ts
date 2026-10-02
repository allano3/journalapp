import type { SqlDriver } from "../driver";
import type { AiArtifact } from "../../domain/types";
import { newId } from "../../domain/ids";
import { nowIso } from "../../domain/dates";
import { changes } from "../../state/events";

interface ArtifactRow {
  id: string;
  kind: string;
  owner_type: string;
  owner_id: string;
  model: string;
  content: string;
  created_at: string;
  state: string;
}

/**
 * AI-derived artifacts (summaries, suggested convictions, comparisons). Stored apart
 * from user text and always rendered as AI material.
 */
export class ArtifactsRepo {
  constructor(private readonly db: SqlDriver) {}

  private toArtifact(r: ArtifactRow): AiArtifact {
    return {
      id: r.id,
      kind: r.kind as AiArtifact["kind"],
      ownerType: r.owner_type as AiArtifact["ownerType"],
      ownerId: r.owner_id,
      model: r.model,
      content: r.content,
      createdAt: r.created_at,
      state: r.state as AiArtifact["state"],
    };
  }

  forOwner(ownerType: AiArtifact["ownerType"], ownerId: string, kind?: AiArtifact["kind"]): AiArtifact[] {
    const rows = kind
      ? this.db.all<ArtifactRow>("SELECT * FROM ai_artifacts WHERE owner_type = ? AND owner_id = ? AND kind = ? ORDER BY created_at DESC", [ownerType, ownerId, kind])
      : this.db.all<ArtifactRow>("SELECT * FROM ai_artifacts WHERE owner_type = ? AND owner_id = ? ORDER BY created_at DESC", [ownerType, ownerId]);
    return rows.map((r) => this.toArtifact(r));
  }

  add(a: Omit<AiArtifact, "id" | "createdAt" | "state">): AiArtifact {
    const id = newId();
    this.db.run("INSERT INTO ai_artifacts(id, kind, owner_type, owner_id, model, content, created_at, state) VALUES (?,?,?,?,?,?,?,'pending')", [
      id,
      a.kind,
      a.ownerType,
      a.ownerId,
      a.model,
      a.content,
      nowIso(),
    ]);
    changes.emit("ai");
    return this.toArtifact(this.db.get<ArtifactRow>("SELECT * FROM ai_artifacts WHERE id = ?", [id])!);
  }

  setState(id: string, state: AiArtifact["state"]): void {
    this.db.run("UPDATE ai_artifacts SET state = ? WHERE id = ?", [state, id]);
    changes.emit("ai");
  }

  /** Replace prior artifacts of the same kind for an owner (e.g. regenerate a summary). */
  replace(a: Omit<AiArtifact, "id" | "createdAt" | "state">): AiArtifact {
    this.db.run("DELETE FROM ai_artifacts WHERE owner_type = ? AND owner_id = ? AND kind = ?", [a.ownerType, a.ownerId, a.kind]);
    return this.add(a);
  }

  clearAll(): void {
    this.db.run("DELETE FROM ai_artifacts");
    changes.emit("ai");
  }
}
