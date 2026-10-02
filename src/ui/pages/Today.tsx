import { useLayoutEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { EntrySummary as EntryRow } from "../../domain/types";
import { addDays, addMonths, daysBetween, formatLong, formatMedium, toISODate, todayISO } from "../../domain/dates";
import { markdownToPlain, truncate } from "../../domain/text";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { seedDemoData } from "../../demo/seed";
import { MarkdownView } from "../components/MarkdownView";
import { QuickNoteButton } from "../editor/QuickNoteButton";
import "../editor/editor.css";

const LOOKBACK: { label: string; months: number }[] = [
  { label: "1 year ago", months: -12 },
  { label: "6 months ago", months: -6 },
  { label: "1 month ago", months: -1 },
];

interface Resurfaced {
  label: string;
  entry: EntryRow;
}

/** One entry per lookback horizon: the closest within ±2 days, if any. */
function resurfacing(today: string): Resurfaced[] {
  const j = journal();
  const out: Resurfaced[] = [];
  for (const { label, months } of LOOKBACK) {
    const target = addMonths(today, months);
    let best: EntryRow | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const e of j.entries.around(target, 2)) {
      const d = Math.abs(daysBetween(target, e.entryDate));
      if (d < bestDistance) {
        best = e;
        bestDistance = d;
      }
    }
    const chosen = best;
    if (chosen && !out.some((r) => r.entry.id === chosen.id)) out.push({ label, entry: chosen });
  }
  return out;
}

/** The closing/action block of the most recent previous daily entry, as a carry line. */
function carryLine(today: string): { entryId: string; date: string; text: string } | null {
  const j = journal();
  const [prev] = j.entries.list({ kind: "daily", to: addDays(today, -1), limit: 1 });
  if (!prev) return null;
  const entry = j.entries.get(prev.id);
  if (!entry) return null;
  const block = entry.blocks.find((b) => b.type === "action" || b.metadata.section === "closing");
  if (!block) return null;
  const action = typeof block.metadata.action === "string" ? block.metadata.action.trim() : "";
  const text = action.length > 0 && block.metadata.done !== true ? action : truncate(markdownToPlain(block.content).replace(/\s+/g, " "), 160);
  if (text.length === 0) return null;
  return { entryId: entry.id, date: entry.entryDate, text };
}

function EmptyJournal() {
  const navigate = useNavigate();
  const today = todayISO();
  return (
    <div className="today-welcome">
      <p className="serif today-welcome-text">
        This journal is private and lives only on this device. Nothing you write is sent anywhere. Every section is optional; write as much
        or as little as the day asks for.
      </p>
      <div className="row today-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const e = journal().entries.create({ entryDate: today, kind: "daily" });
            navigate(`/entry/${e.id}`);
          }}
        >
          Begin writing
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => seedDemoData(journal())}>
          Explore with demo entries
        </button>
      </div>
    </div>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const today = todayISO();
  const [settings] = useSettings();
  const total = useQuery((j) => j.entries.count(), [], ["entries"]);
  const daily = useQuery((j) => j.entries.getDaily(today), [today], ["entries"]);
  const notes = useQuery((j) => j.entries.list({ from: today, to: today, kind: "note" }), [today], ["entries"]);
  const due = useQuery((j) => j.convictions.dueForReview(today), [today], ["convictions"]);
  const lookback = useQuery(() => (settings.resurfacingEnabled ? resurfacing(today) : []), [today, settings.resurfacingEnabled], ["entries"]);
  const carry = useQuery(() => (settings.resurfacingEnabled ? carryLine(today) : null), [today, settings.resurfacingEnabled], ["entries"]);

  const preview = daily?.blocks.find((b) => b.content.trim().length > 0)?.content ?? "";
  const previewRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (el) el.dataset.clipped = el.scrollHeight > el.clientHeight + 1 ? "true" : "false";
  }, [preview]);

  return (
    <div className="page today">
      <header className="today-head">
        <h1 className="today-date">{formatLong(today)}</h1>
      </header>

      {total === 0 ? (
        <EmptyJournal />
      ) : (
        <>
          <div className="today-primary">
            {daily ? (
              <>
                <Link to={`/entry/${daily.id}`} className="btn btn-primary">
                  Continue today's journal
                </Link>
                {preview.length > 0 && (
                  <div ref={previewRef} className="today-preview" onClick={() => navigate(`/entry/${daily.id}`)}>
                    <MarkdownView markdown={preview} />
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const e = journal().entries.create({ entryDate: today, kind: "daily" });
                  navigate(`/entry/${e.id}`);
                }}
              >
                Begin today's journal
              </button>
            )}
            <div className="today-secondary">
              <QuickNoteButton />
            </div>
          </div>

          {notes.length > 0 && (
            <section className="today-section">
              <h2 className="label">Notes from today</h2>
              {notes.map((n) => (
                <Link key={n.id} to={`/entry/${n.id}`} className="list-item">
                  <div className="list-preview">{n.preview || "Empty note"}</div>
                </Link>
              ))}
            </section>
          )}

          {due.length > 0 && (
            <section className="today-section">
              <h2 className="label">Scheduled for reflection</h2>
              <p className="faint small today-section-note">You scheduled a reflection for today.</p>
              {due.map((c) => (
                <Link key={c.id} to={`/convictions/${c.id}`} className="list-item">
                  <div className="list-meta">
                    <span>{c.kind === "decision" ? "Decision" : "Conviction"}</span>
                    <span>· recorded {formatMedium(toISODate(new Date(c.createdAt)))}</span>
                  </div>
                  <div className="list-title serif">{c.statement || "(untitled)"}</div>
                </Link>
              ))}
            </section>
          )}

          {(lookback.length > 0 || carry) && (
            <section className="today-section">
              <h2 className="label">Looking back</h2>
              {carry && (
                <p className="today-carry serif">
                  <span className="faint">You wanted to carry: </span>
                  <Link to={`/entry/${carry.entryId}`}>{carry.text}</Link>
                </p>
              )}
              {lookback.map((r) => (
                <Link key={r.label} to={`/entry/${r.entry.id}`} className="list-item">
                  <div className="list-meta">
                    <span>{r.label}</span>
                    <span>· {formatMedium(r.entry.entryDate)}</span>
                    {r.entry.favorite && <span>· ★</span>}
                  </div>
                  {r.entry.title && <div className="list-title">{r.entry.title}</div>}
                  {r.entry.preview && <div className="list-preview">{r.entry.preview}</div>}
                </Link>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
