import { Link } from "react-router-dom";
import type { ISODate } from "../../domain/types";
import { useQuery } from "../../state/hooks";
import { formatShort } from "../../domain/dates";
import type { ConvictionListItem } from "../../storage/repos/convictions";
import { PRAYER_STATUS_LABELS, collectWeek } from "./week";
import "./review.css";

function ConvictionLines({ title, items, when }: { title: string; items: ConvictionListItem[]; when: (c: ConvictionListItem) => string }) {
  if (items.length === 0) return null;
  return (
    <div className="review-group">
      <div className="group-title">{title}</div>
      {items.map((c) => (
        <Link key={c.id} to={`/convictions/${c.id}`} className="review-line">
          <span className="when">{when(c)}</span>
          <span className="what">{c.statement}</span>
          <span className={`pill status-${c.status}`}>{c.kind === "decision" ? "decision" : "conviction"}</span>
        </Link>
      ))}
    </div>
  );
}

/** "This week": the week's raw material, gathered without AI and shown regardless of AI settings. */
export function WeekSynthesis({ weekStart }: { weekStart: ISODate }) {
  const week = useQuery((j) => collectWeek(j, weekStart), [weekStart], ["entries", "convictions"]);
  const empty = week.entries.length === 0 && week.created.length === 0 && week.changed.length === 0 && week.due.length === 0;

  return (
    <section className="review-section">
      <div className="label">This week</div>
      {empty && <div className="faint">Nothing was written this week.</div>}

      {week.entries.length > 0 && (
        <div className="review-group">
          <div className="group-title">
            {week.entries.length} {week.entries.length === 1 ? "entry" : "entries"}
          </div>
          {week.entries.map((e) => (
            <Link key={e.id} to={`/entry/${e.id}`} className="aside-item">
              <div className="aside-item-date">
                {formatShort(e.entryDate)}
                {e.kind === "note" && " · note"}
                {e.favorite && " · ★"}
              </div>
              {e.title && <div className="aside-item-title">{e.title}</div>}
              {e.preview && !(e.title.length > 0 && e.preview.startsWith(e.title.replace(/…$/, ""))) && <div className="aside-item-snippet">{e.preview}</div>}
            </Link>
          ))}
        </div>
      )}

      <ConvictionLines title="Recorded this week" items={week.created} when={(c) => formatShort(c.createdAt.slice(0, 10))} />
      <ConvictionLines title="Revised this week" items={week.changed} when={(c) => formatShort(c.changedAt.slice(0, 10))} />
      <ConvictionLines title="Due for review" items={week.due} when={(c) => (c.reviewDate ? formatShort(c.reviewDate) : "")} />

      {week.prayers.length > 0 && (
        <div className="review-group">
          <div className="group-title">Prayer</div>
          {week.prayers.map((p, i) => (
            <Link key={`${p.blockId}:${i}`} to={`/entry/${p.entryId}#${p.blockId}`} className="review-line">
              <span className="when">{formatShort(p.date)}</span>
              <span className="what">{p.text}</span>
              <span className="pill">{PRAYER_STATUS_LABELS[p.status]}</span>
            </Link>
          ))}
        </div>
      )}

      {week.actions.length > 0 && (
        <div className="review-group">
          <div className="group-title">Closing actions</div>
          {week.actions.map((a) => (
            <Link key={a.blockId} to={`/entry/${a.entryId}#${a.blockId}`} className={`review-line${a.done ? " is-done" : ""}`}>
              <span className="when">{formatShort(a.date)}</span>
              <span className="what">{a.text}</span>
              {a.done && <span className="pill">done</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
