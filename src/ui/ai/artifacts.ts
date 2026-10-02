import type { Journal } from "../../storage/db";
import { changes } from "../../state/events";

/** Remove one AI artifact (summary, comparison) at the user's request. */
export function removeArtifact(j: Journal, id: string): void {
  j.db.run("DELETE FROM ai_artifacts WHERE id = ?", [id]);
  changes.emit("ai");
}
