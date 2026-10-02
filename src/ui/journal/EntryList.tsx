import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { EntrySummary } from "../../domain/types";
import { formatMedium, formatMonthYear, fromISODate, monthKey } from "../../domain/dates";

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });

export function EntryListItem({ entry }: { entry: EntrySummary }) {
  return (
    <Link to={`/entry/${entry.id}`} className="list-item">
      <div className="list-meta">
        <span>
          {WEEKDAY.format(fromISODate(entry.entryDate))}, {formatMedium(entry.entryDate)}
        </span>
        {entry.favorite && <span title="Favorite">★</span>}
        {entry.wordCount > 0 && <span>{entry.wordCount.toLocaleString()} words</span>}
      </div>
      {entry.kind === "note" ? (
        <div className="list-title">
          <span className="pill">Quick note</span>
        </div>
      ) : (
        entry.title && <div className="list-title">{entry.title}</div>
      )}
      {entry.preview && <div className="list-preview">{entry.preview}</div>}
      {entry.tags.length > 0 && (
        <div className="journal-item-tags">
          {entry.tags.map((t) => (
            <span key={t} className="pill">
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

/**
 * Entries newest first. With `byMonth`, a faint sticky month heading precedes each
 * month's entries; the list is assumed to already be sorted by date descending.
 */
export function EntryList({ entries, byMonth = false, emptyText = "Nothing here yet." }: { entries: EntrySummary[]; byMonth?: boolean; emptyText?: ReactNode }) {
  if (entries.length === 0) return <div className="empty">{emptyText}</div>;
  if (!byMonth) {
    return (
      <div>
        {entries.map((e) => (
          <EntryListItem key={e.id} entry={e} />
        ))}
      </div>
    );
  }
  let current = "";
  return (
    <div>
      {entries.map((e) => {
        const m = monthKey(e.entryDate);
        const heading = m !== current;
        current = m;
        return (
          <Fragment key={e.id}>
            {heading && <div className="journal-month">{formatMonthYear(m)}</div>}
            <EntryListItem entry={e} />
          </Fragment>
        );
      })}
    </div>
  );
}
