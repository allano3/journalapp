import { useState, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ISODate } from "../../domain/types";
import { addMonths, formatLong, formatMonthYear, fromISODate, monthKey, toISODate, todayISO } from "../../domain/dates";
import { journal } from "../../storage/db";
import { useQuery } from "../../state/hooks";
import { IconChevronLeft, IconChevronRight } from "../shell/icons";
import { EntryList } from "./EntryList";

const DOW_SHORT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_SHORT = new Intl.DateTimeFormat(undefined, { month: "short" });

/** Monday-first weekday headers; 2024-01-01 was a Monday. */
const WEEKDAYS: string[] = Array.from({ length: 7 }, (_, i) => DOW_SHORT.format(new Date(2024, 0, 1 + i)));
const MONTH_ABBR: string[] = Array.from({ length: 12 }, (_, i) => MONTH_SHORT.format(new Date(2024, i, 1)));

function monthBounds(month: string): { first: ISODate; last: ISODate } {
  const [y, m] = month.split("-").map(Number);
  return { first: toISODate(new Date(y, m - 1, 1)), last: toISODate(new Date(y, m, 0)) };
}

function isMonthKey(s: string | null): s is string {
  return s !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/**
 * One month at a time (`?month=YYYY-MM`, default: this month). Days with writing carry
 * a small accent dot; selecting a day lists its entries, or offers to start one.
 */
export function Calendar() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const monthParam = params.get("month");
  const month = isMonthKey(monthParam) ? monthParam : monthKey(today);
  const { first, last } = monthBounds(month);
  const year = Number(month.slice(0, 4));

  const [selection, setSelection] = useState<{ month: string; day: ISODate | null }>({ month, day: null });
  const selected = selection.month === month ? selection.day : null;

  const counts = useQuery(
    (j) => {
      const byDate: Record<ISODate, number> = {};
      for (const row of j.entries.datesWithEntries(first, last)) byDate[row.date] = row.count;
      return byDate;
    },
    [first, last],
    ["entries"],
  );
  const yearMonths = useQuery(
    (j) => {
      const seen: Record<string, true> = {};
      for (const row of j.entries.datesWithEntries(`${year}-01-01`, `${year}-12-31`)) seen[monthKey(row.date)] = true;
      return seen;
    },
    [year],
    ["entries"],
  );
  const dayEntries = useQuery((j) => (selected ? j.entries.list({ from: selected, to: selected }) : []), [selected], ["entries"]);

  const goToMonth = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === monthKey(today)) p.delete("month");
    else p.set("month", next);
    setParams(p, { replace: true });
  };
  const step = (delta: number) => goToMonth(monthKey(addMonths(first, delta)));

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  const writeForDay = (date: ISODate) => {
    const j = journal();
    const existing = j.entries.getDaily(date);
    const entry = existing ?? j.entries.create({ entryDate: date, kind: "daily" });
    navigate(`/entry/${entry.id}`);
  };

  // Leading blanks so the 1st lands under its weekday (Monday-first).
  const leading = (fromISODate(first).getDay() + 6) % 7;
  const daysInMonth = fromISODate(last).getDate();
  const cells: (ISODate | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section aria-label="Calendar">
      <div className="cal-nav">
        <h2>{formatMonthYear(month)}</h2>
        {month !== monthKey(today) && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => goToMonth(monthKey(today))}>
            Today
          </button>
        )}
        <button type="button" className="btn btn-quiet" aria-label="Previous month" onClick={() => step(-1)}>
          <IconChevronLeft />
        </button>
        <button type="button" className="btn btn-quiet" aria-label="Next month" onClick={() => step(1)}>
          <IconChevronRight />
        </button>
      </div>

      <div className="cal" role="group" aria-label={`${formatMonthYear(month)}. Use left and right arrow keys to change month.`} tabIndex={0} onKeyDown={onGridKey}>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-dow" aria-hidden="true">
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} className="cal-day is-empty" aria-hidden="true" />;
            const n = counts[date] ?? 0;
            const cls = ["cal-day", n > 0 ? "has-entries" : "", date === today ? "is-today" : "", date === selected ? "is-selected" : ""].filter(Boolean).join(" ");
            return (
              <button
                key={date}
                type="button"
                className={cls}
                aria-pressed={date === selected}
                aria-label={`${formatLong(date)}${n > 0 ? `, ${n} ${n === 1 ? "entry" : "entries"}` : ""}`}
                onClick={() => setSelection({ month, day: date === selected ? null : date })}
              >
                <span className="cal-num">{Number(date.slice(8))}</span>
                {n > 0 && <span className={n > 1 ? "cal-dot is-many" : "cal-dot"} />}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="cal-day-detail">
          <div className="label">
            <span>{formatLong(selected)}</span>
            {selected === today && <span className="faint">Today</span>}
          </div>
          {dayEntries.length > 0 ? (
            <EntryList entries={dayEntries} />
          ) : (
            <div className="row cal-day-empty">
              <span className="muted small">Nothing written on this day.</span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => writeForDay(selected)}>
                Write for this day
              </button>
            </div>
          )}
        </div>
      )}

      <div className="cal-year" aria-label={`Months of ${year}`}>
        <span className="cal-year-label">
          <button type="button" className="btn btn-quiet" aria-label="Previous year" onClick={() => goToMonth(`${year - 1}-${month.slice(5)}`)}>
            <IconChevronLeft />
          </button>
          <span>{year}</span>
          <button type="button" className="btn btn-quiet" aria-label="Next year" onClick={() => goToMonth(`${year + 1}-${month.slice(5)}`)}>
            <IconChevronRight />
          </button>
        </span>
        <div className="cal-year-months">
          {MONTH_ABBR.map((abbr, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`;
            const has = yearMonths[key] === true;
            const cls = ["cal-year-month", has ? "has-entries" : "", key === month ? "is-current" : ""].filter(Boolean).join(" ");
            return (
              <button key={key} type="button" className={cls} disabled={!has && key !== month} aria-current={key === month ? "true" : undefined} onClick={() => goToMonth(key)}>
                {abbr}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
