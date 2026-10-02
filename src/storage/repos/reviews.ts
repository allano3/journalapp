import type { SqlDriver } from "../driver";
import type { ISODate, WeeklyReview } from "../../domain/types";
import { newId } from "../../domain/ids";
import { nowIso } from "../../domain/dates";
import { changes } from "../../state/events";

interface ReviewRow {
  id: string;
  week_start: string;
  created_at: string;
  updated_at: string;
  content: string;
  ai_draft: string | null;
  ai_draft_model: string | null;
  ai_draft_created_at: string | null;
}

export class ReviewsRepo {
  constructor(private readonly db: SqlDriver) {}

  private toReview(r: ReviewRow): WeeklyReview {
    return {
      id: r.id,
      weekStart: r.week_start,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      content: r.content,
      aiDraft: r.ai_draft,
      aiDraftModel: r.ai_draft_model,
      aiDraftCreatedAt: r.ai_draft_created_at,
    };
  }

  getByWeek(weekStart: ISODate): WeeklyReview | null {
    const r = this.db.get<ReviewRow>("SELECT * FROM reviews WHERE week_start = ?", [weekStart]);
    return r ? this.toReview(r) : null;
  }

  list(): WeeklyReview[] {
    return this.db.all<ReviewRow>("SELECT * FROM reviews ORDER BY week_start DESC").map((r) => this.toReview(r));
  }

  /** Create-or-get the review row for a week. */
  ensure(weekStart: ISODate): WeeklyReview {
    const existing = this.getByWeek(weekStart);
    if (existing) return existing;
    const ts = nowIso();
    this.db.run("INSERT INTO reviews(id, week_start, created_at, updated_at, content) VALUES (?,?,?,?,'')", [newId(), weekStart, ts, ts]);
    changes.emit("reviews");
    return this.getByWeek(weekStart)!;
  }

  /** Save the user's own writing. Never touches the AI draft. */
  saveContent(weekStart: ISODate, content: string): void {
    const r = this.ensure(weekStart);
    if (r.content === content) return;
    this.db.run("UPDATE reviews SET content = ?, updated_at = ? WHERE week_start = ?", [content, nowIso(), weekStart]);
    changes.emit("reviews");
  }

  /** Store the AI draft as a separate derived artifact. */
  saveAiDraft(weekStart: ISODate, draft: string | null, model: string | null): void {
    this.ensure(weekStart);
    this.db.run("UPDATE reviews SET ai_draft = ?, ai_draft_model = ?, ai_draft_created_at = ?, updated_at = ? WHERE week_start = ?", [
      draft,
      model,
      draft === null ? null : nowIso(),
      nowIso(),
      weekStart,
    ]);
    changes.emit("reviews");
  }

  delete(weekStart: ISODate): void {
    this.db.run("DELETE FROM reviews WHERE week_start = ?", [weekStart]);
    changes.emit("reviews");
  }
}
