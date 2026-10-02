import { Link, useSearchParams } from "react-router-dom";
import type { Journal } from "../../storage/db";
import type { ConvictionListItem } from "../../storage/repos/convictions";
import { addDays, formatMedium, todayISO } from "../../domain/dates";
import { useQuery } from "../../state/hooks";
import { ConfidenceDots } from "../convictions/ConfidenceDots";
import { KIND_LABELS, STATUS_LABELS, tsDate } from "../convictions/fields";
import "../convictions/convictions.css";

type View = "active" | "changing" | "pending" | "review" | "completed" | "superseded" | "all";

const VIEWS: readonly { key: View; label: string; empty: string }[] = [
  { key: "active", label: "Active", empty: "Nothing is held actively yet. When something becomes clear enough to keep, record it here." },
  { key: "changing", label: "Changing", empty: "Nothing is being reconsidered or has changed in the last three months." },
  { key: "pending", label: "Pending", empty: "No decisions are waiting on a next step, and no reviews are coming up." },
  { key: "review", label: "Review", empty: "Nothing is due for review." },
  { key: "completed", label: "Completed", empty: "No decisions have been completed yet." },
  { key: "superseded", label: "Superseded", empty: "No beliefs have been superseded yet." },
  { key: "all", label: "All", empty: "Nothing recorded yet. Convictions and decisions you promote from the journal gather here." },
];

interface Ledger {
  items: ConvictionListItem[];
  /** Ids whose current version has a next action (not carried by the list row). */
  withNextAction: Set<string>;
}

function loadLedger(j: Journal): Ledger {
  const ids = j.db.all<{ id: string }>(
    "SELECT c.id FROM convictions c JOIN conviction_versions v ON v.id = c.current_version_id WHERE TRIM(v.next_action) <> ''",
  );
  return { items: j.convictions.list(), withNextAction: new Set(ids.map((r) => r.id)) };
}

function filterView(view: View, ledger: Ledger, today: string): ConvictionListItem[] {
  const { items, withNextAction } = ledger;
  const recent = addDays(today, -90);
  switch (view) {
    case "active":
      return items.filter((c) => c.status === "active");
    case "changing":
      return items
        .filter((c) => c.status === "reconsidering" || (c.versionCount > 1 && tsDate(c.changedAt) >= recent))
        .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1));
    case "pending":
      return items
        .filter(
          (c) =>
            (c.status === "active" || c.status === "reconsidering") &&
            ((c.kind === "decision" && c.status === "active" && withNextAction.has(c.id)) || (c.reviewDate !== null && c.reviewDate > today)),
        )
        .sort((a, b) => (a.reviewDate ?? "9").localeCompare(b.reviewDate ?? "9"));
    case "review":
      return items
        .filter((c) => (c.status === "active" || c.status === "reconsidering") && c.reviewDate !== null && c.reviewDate <= today)
        .sort((a, b) => (a.reviewDate ?? "").localeCompare(b.reviewDate ?? ""));
    case "completed":
      return items.filter((c) => c.status === "completed");
    case "superseded":
      return items.filter((c) => c.status === "superseded");
    case "all":
      return items;
  }
}

export function ConvictionsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view: View = VIEWS.some((v) => v.key === raw) ? (raw as View) : "active";
  const today = todayISO();
  const ledger = useQuery(loadLedger, [], ["convictions"]);
  const rows = filterView(view, ledger, today);
  const current = VIEWS.find((v) => v.key === view)!;

  return (
    <div className="page">
      <div className="row-between page-head">
        <h1 className="page-title">Convictions</h1>
        <div className="row">
          <Link to="/convictions/new?kind=conviction" className="btn btn-quiet btn-sm">
            New conviction
          </Link>
          <Link to="/convictions/new?kind=decision" className="btn btn-quiet btn-sm">
            New decision
          </Link>
        </div>
      </div>

      <div className="cv-tabs" role="tablist" aria-label="Filter">
        {VIEWS.map((v) => {
          const n = v.key === view ? rows.length : filterView(v.key, ledger, today).length;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === view}
              className="cv-tab"
              onClick={() => setParams(v.key === "active" ? {} : { view: v.key }, { replace: true })}
            >
              {v.label}
              {n > 0 && <span className="cv-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="empty">{current.empty}</div>
      ) : (
        <div>
          {rows.map((c) => (
            <Link key={c.id} to={`/convictions/${c.id}`} className="list-item">
              <div className="list-title">{c.statement || <span className="faint">Untitled</span>}</div>
              <div className="cv-meta">
                <span className="pill">{KIND_LABELS[c.kind]}</span>
                <span>{formatMedium(tsDate(c.createdAt))}</span>
                <span className={`status status-${c.status}`}>{STATUS_LABELS[c.status]}</span>
                {c.confidence !== null && <ConfidenceDots value={c.confidence} />}
                {c.versionCount > 1 && <span>revised {c.versionCount - 1 === 1 ? "once" : `${c.versionCount - 1} times`}</span>}
                {c.reviewDate && (
                  <span className={c.reviewDate <= today && (c.status === "active" || c.status === "reconsidering") ? "cv-due" : undefined}>
                    review {formatMedium(c.reviewDate)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
