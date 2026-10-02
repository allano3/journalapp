import { useNavigate, useSearchParams } from "react-router-dom";
import { todayISO } from "../../domain/dates";
import { journal } from "../../storage/db";
import { useQuery } from "../../state/hooks";
import { QuickNoteButton } from "../editor/QuickNoteButton";
import { Timeline } from "../journal/Timeline";
import { Calendar } from "../journal/Calendar";
import "../journal/journal.css";

type View = "timeline" | "calendar";

/**
 * JOURNAL destination: everything written, as a timeline or a calendar.
 * `?view=timeline|calendar` selects the view; each view keeps its own query params
 * (`kind`, `fav`, `tag` for the timeline; `month` for the calendar).
 */
export function JournalPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "calendar" ? "calendar" : "timeline";
  const count = useQuery((j) => j.entries.count(), [], ["entries"]);

  const switchView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === "timeline") p.delete("view");
    else p.set("view", next);
    setParams(p, { replace: true });
  };

  const openToday = () => {
    const j = journal();
    const today = todayISO();
    const entry = j.entries.getDaily(today) ?? j.entries.create({ entryDate: today, kind: "daily" });
    navigate(`/entry/${entry.id}`);
  };

  return (
    <div className="page page-wide">
      <div className="journal-head">
        <div>
          <h1 className="page-title">Journal</h1>
          <p className="page-sub">{count === 0 ? "Nothing written yet" : `${count.toLocaleString()} ${count === 1 ? "entry" : "entries"}`}</p>
        </div>
        <div className="journal-head-actions">
          <button type="button" className="btn btn-quiet" onClick={openToday}>
            New entry
          </button>
          <QuickNoteButton className="btn btn-quiet" />
        </div>
      </div>

      <div className="journal-views" role="tablist" aria-label="Journal view">
        <button type="button" role="tab" className="btn btn-quiet" aria-selected={view === "timeline"} aria-current={view === "timeline" ? "true" : undefined} onClick={() => switchView("timeline")}>
          Timeline
        </button>
        <button type="button" role="tab" className="btn btn-quiet" aria-selected={view === "calendar"} aria-current={view === "calendar" ? "true" : undefined} onClick={() => switchView("calendar")}>
          Calendar
        </button>
      </div>

      {view === "timeline" ? <Timeline /> : <Calendar />}
    </div>
  );
}
