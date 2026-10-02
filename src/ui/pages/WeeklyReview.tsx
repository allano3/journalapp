import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ISODate, WeeklyReview } from "../../domain/types";
import { addDays, formatMedium, formatShort, toISODate, todayISO, weekStart } from "../../domain/dates";
import { markdownToPlain, truncate } from "../../domain/text";
import { journal } from "../../storage/db";
import { useDebounced, useQuery, useSettings } from "../../state/hooks";
import { WeekSynthesis } from "../review/WeekSynthesis";
import { ReviewEditor } from "../review/ReviewEditor";
import { AiDraft } from "../review/AiDraft";
import "../review/review.css";

/** Everything below the title for one week. Keyed by week so the editor state resets. */
function WeekBody({ ws, review }: { ws: ISODate; review: WeeklyReview | null }) {
  const [settings] = useSettings();
  const [content, setContent] = useState(review?.content ?? "");
  const [saved, setSaved] = useState(true);
  const latest = useRef({ content: review?.content ?? "", dirty: false });
  latest.current.content = content;

  const save = useDebounced((text: string) => {
    journal().reviews.saveContent(ws, text);
    latest.current.dirty = false;
    setSaved(true);
  }, 600);

  const change = (text: string) => {
    setContent(text);
    setSaved(false);
    latest.current.dirty = true;
    save(text);
  };

  // Flush an unsaved edit when leaving the week or the page.
  useEffect(
    () => () => {
      if (latest.current.dirty) journal().reviews.saveContent(ws, latest.current.content);
    },
    [ws],
  );

  const copyDraft = (draft: string, model: string | null, createdAt: string | null) => {
    const when = formatMedium(createdAt ? toISODate(new Date(createdAt)) : todayISO());
    const provenance = `> Draft prepared by local AI (${model ?? "unknown model"}) on ${when}; edited by me below.`;
    const base = content.trimEnd();
    change(`${base.length > 0 ? `${base}\n\n` : ""}---\n\n${provenance}\n\n${draft.trim()}\n`);
  };

  return (
    <>
      <WeekSynthesis weekStart={ws} />
      <ReviewEditor content={content} onChange={change} saved={saved} />
      {settings.ai.enabled && <AiDraft weekStart={ws} review={review} onCopy={copyDraft} />}
    </>
  );
}

export function WeeklyReviewPage() {
  const params = useParams<{ weekStart?: string }>();
  const thisWeek = weekStart(todayISO());
  const ws = params.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(params.weekStart) ? weekStart(params.weekStart) : thisWeek;
  const review = useQuery((j) => j.reviews.getByWeek(ws), [ws], ["reviews"]);
  const past = useQuery((j) => j.reviews.list().filter((r) => r.weekStart !== ws && (r.content.trim().length > 0 || (r.aiDraft ?? "").length > 0)), [ws], ["reviews"]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="review-nav">
          <Link to={`/review/${addDays(ws, -7)}`} className="btn btn-quiet" aria-label="Previous week" title="Previous week">
            ‹
          </Link>
          <h1 className="page-title">Week of {formatMedium(ws)}</h1>
          {ws < thisWeek ? (
            <Link to={addDays(ws, 7) === thisWeek ? "/review" : `/review/${addDays(ws, 7)}`} className="btn btn-quiet" aria-label="Next week" title="Next week">
              ›
            </Link>
          ) : (
            <span className="btn btn-quiet" style={{ visibility: "hidden" }} aria-hidden="true">
              ›
            </span>
          )}
        </div>
        <p className="page-sub">
          {formatShort(ws)} – {formatShort(addDays(ws, 6))}
          {ws === thisWeek && " · this week"}
          {ws < thisWeek && (
            <>
              {" · "}
              <Link to="/review">back to this week</Link>
            </>
          )}
        </p>
      </div>

      <WeekBody key={ws} ws={ws} review={review} />

      {past.length > 0 && (
        <section className="review-section review-past">
          <div className="label">Past reviews</div>
          {past.map((r) => (
            <Link key={r.id} to={`/review/${r.weekStart}`} className="aside-item">
              <div className="aside-item-date">
                {formatShort(r.weekStart)} – {formatShort(addDays(r.weekStart, 6))}
                {r.content.trim().length === 0 && r.aiDraft && " · AI draft only"}
              </div>
              <div className="aside-item-snippet">{r.content.trim().length > 0 ? truncate(markdownToPlain(r.content.replace(/^\s*-{3,}\s*$/gm, "")).replace(/\s+/g, " "), 160) : "No review written yet."}</div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
