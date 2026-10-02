import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Conviction, ConvictionStatus, ConvictionVersion } from "../../domain/types";
import { CONVICTION_STATUSES } from "../../domain/types";
import { addMonths, formatLong, formatMedium, relativeDays, todayISO } from "../../domain/dates";
import { journal } from "../../storage/db";
import type { VersionInput } from "../../storage/repos/convictions";
import { laterEntriesForConviction } from "../../search/related";
import { useAsyncQuery, useQuery } from "../../state/hooks";
import { HitList } from "../components/HitList";
import { Sheet } from "../components/Sheet";
import { ConvictionComparison } from "../ai/ConvictionComparison";
import { ConfidenceDots } from "../convictions/ConfidenceDots";
import { ConvictionForm } from "../convictions/ConvictionForm";
import { FIELD_LABELS, FIELD_ORDER, KIND_LABELS, STATUS_LABELS, diffVersions, fieldText, tsDate } from "../convictions/fields";
import "../convictions/convictions.css";

type SheetState = { kind: "revise"; reflect: boolean } | { kind: "status"; status: ConvictionStatus } | { kind: "review" } | null;

const NEXT_REVIEW: readonly { label: string; months: number | null }[] = [
  { label: "no date", months: null },
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
];

export function ConvictionDetailPage() {
  const { id = "" } = useParams();
  const c = useQuery((j) => j.convictions.get(id), [id], ["convictions"]);
  if (!c) {
    return (
      <div className="page">
        <div className="empty">
          This record no longer exists. <Link to="/convictions">Back to the ledger.</Link>
        </div>
      </div>
    );
  }
  return <Detail c={c} />;
}

function Detail({ c }: { c: Conviction }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetState>(null);
  const today = todayISO();
  const v = c.current;
  const source = useQuery((j) => (c.sourceEntryId ? j.entries.summary(c.sourceEntryId) : null), [c.sourceEntryId], ["entries"]);
  const later = useAsyncQuery((j) => laterEntriesForConviction(j, c), [c.id, c.updatedAt, c.linkedEntryIds.join(",")], ["entries", "embeddings"]);
  const due = v.reviewDate !== null && v.reviewDate <= today && (v.status === "active" || v.status === "reconsidering");
  const recorded = tsDate(c.createdAt);

  const addVersion = (patch: Partial<VersionInput>) => {
    journal().convictions.addVersion(c.id, patch);
    setSheet(null);
  };
  const remove = () => {
    if (!window.confirm("Delete this record and its whole history? This cannot be undone.")) return;
    journal().convictions.delete(c.id);
    navigate("/convictions", { replace: true });
  };
  const toggleLink = (entryId: string) => {
    if (c.linkedEntryIds.includes(entryId)) journal().convictions.unlink(c.id, entryId);
    else journal().convictions.link(c.id, entryId);
  };

  return (
    <div className="page">
      <div className="cv-meta" style={{ marginTop: 0 }}>
        <span className="pill">{KIND_LABELS[c.kind]}</span>
        <span>
          Recorded {formatLong(recorded)} · {relativeDays(recorded)}
        </span>
        <span className={`status status-${v.status}`}>{STATUS_LABELS[v.status]}</span>
        {v.confidence !== null && <ConfidenceDots value={v.confidence} />}
        {v.reviewDate && <span className={due ? "cv-due" : undefined}>review {formatMedium(v.reviewDate)}</span>}
      </div>

      <h1 className="cv-statement">{v.statement}</h1>

      {source && (
        <div className="faint small">
          From the entry of <Link to={c.sourceBlockId ? `/entry/${source.id}#${c.sourceBlockId}` : `/entry/${source.id}`}>{formatMedium(source.entryDate)}</Link>
          {source.title && <span> · {source.title}</span>}
        </div>
      )}

      <div className="cv-toolbar">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSheet({ kind: "revise", reflect: false })}>
          Revise
        </button>
        {due && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSheet({ kind: "review" })}>
            Mark reviewed
          </button>
        )}
        <select
          className="select cv-select cv-select-quiet"
          value={v.status}
          aria-label="Status"
          onChange={(e) => {
            const status = e.target.value as ConvictionStatus;
            if (status !== v.status) setSheet({ kind: "status", status });
          }}
        >
          {CONVICTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="cv-spacer" />
        <button type="button" className="btn btn-quiet btn-sm faint" onClick={remove}>
          Delete
        </button>
      </div>

      <ReadView v={v} />

      <section className="cv-section">
        <h2>History</h2>
        <History versions={c.versions} currentId={v.id} />
      </section>

      <section className="cv-section">
        <div className="cv-section-head">
          <h2>Later entries about this</h2>
          {later.data && later.data.hits.length > 0 && (
            <span className="faint small">{later.data.method === "semantic" ? "matched by meaning" : "matched by keywords"}</span>
          )}
        </div>
        {later.loading && !later.data ? (
          <div className="faint small">Looking through later entries…</div>
        ) : later.error ? (
          <div className="faint small">Could not search later entries: {later.error}</div>
        ) : (
          <>
            {later.data && later.data.hits.length > 0 && (
              <div className="cv-reflect">
                <span>You previously wrote something different about this. What changed?</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSheet({ kind: "revise", reflect: true })}>
                  Reflect on this
                </button>
              </div>
            )}
            <HitList
              hits={later.data?.hits ?? []}
              emptyText="No later entries touch this yet."
              trailing={(h) => {
                if (!h.entryId) return null;
                const linked = c.linkedEntryIds.includes(h.entryId);
                const entryId = h.entryId;
                return (
                  <div className="cv-hit-tools">
                    {linked && <span className="pill pill-accent">linked</span>}
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLink(entryId);
                      }}
                    >
                      {linked ? "Unlink" : "Link"}
                    </button>
                  </div>
                );
              }}
            />
          </>
        )}
      </section>

      <section className="cv-section">
        <ConvictionComparison convictionId={c.id} />
      </section>

      {sheet?.kind === "revise" && (
        <Sheet title={sheet.reflect ? "What changed?" : `Revise this ${KIND_LABELS[c.kind].toLowerCase()}`} onClose={() => setSheet(null)} wide>
          <ConvictionForm
            initial={{ ...v, changeNote: "", status: sheet.reflect && v.status === "active" ? "reconsidering" : v.status }}
            kind={c.kind}
            showChangeNote
            focusChangeNote={sheet.reflect}
            submitLabel="Save new version"
            onSubmit={(next) => addVersion(next)}
            onCancel={() => setSheet(null)}
          />
        </Sheet>
      )}

      {sheet?.kind === "status" && (
        <NoteSheet
          title={`Mark as ${STATUS_LABELS[sheet.status].toLowerCase()}`}
          intro={`${STATUS_LABELS[v.status]} → ${STATUS_LABELS[sheet.status]}. The earlier version stays in the history.`}
          submitLabel={`Mark ${STATUS_LABELS[sheet.status].toLowerCase()}`}
          onClose={() => setSheet(null)}
          onSubmit={(note) => addVersion({ status: sheet.status, changeNote: note })}
        />
      )}

      {sheet?.kind === "review" && <ReviewSheet v={v} onClose={() => setSheet(null)} onSubmit={addVersion} />}
    </div>
  );
}

/** The current version as calm reading, one labelled passage per non-empty field. */
function ReadView({ v }: { v: ConvictionVersion }) {
  const fields = FIELD_ORDER.filter((k) => k !== "statement" && k !== "status" && k !== "confidence" && k !== "reviewDate" && fieldText(v, k) !== "");
  if (fields.length === 0) return <div className="faint small">Only the statement so far. Revise to add context, reasoning, or what would change your mind.</div>;
  return (
    <div className="cv-read">
      {fields.map((k) => (
        <div key={k}>
          <span className="label">{FIELD_LABELS[k]}</span>
          <div className="cv-read-text">{fieldText(v, k)}</div>
        </div>
      ))}
    </div>
  );
}

/** Every version, oldest first: the original belief, then each change against the version before it. */
function History({ versions, currentId }: { versions: ConvictionVersion[]; currentId: string }) {
  return (
    <div className="cv-timeline">
      {versions.map((ver, i) => {
        const prev = i > 0 ? versions[i - 1] : null;
        const changes = prev ? diffVersions(prev, ver) : [];
        return (
          <div key={ver.id} className={ver.id === currentId ? "cv-version current" : "cv-version"}>
            <div className="cv-version-head">
              <span>{prev ? `Version ${ver.versionNo}` : "Original"}</span>
              <span>{formatMedium(tsDate(ver.createdAt))}</span>
              <span className={`status status-${ver.status}`}>{STATUS_LABELS[ver.status]}</span>
              {ver.confidence !== null && <ConfidenceDots value={ver.confidence} />}
            </div>
            {!prev && <div className="cv-version-body">{ver.statement}</div>}
            {prev && changes.length === 0 && ver.changeNote.trim() === "" && <div className="faint small" style={{ marginTop: "0.3rem" }}>Reviewed; nothing changed.</div>}
            {changes.length > 0 && (
              <div className="cv-diff">
                {changes.map((ch) => (
                  <div key={ch.key} className="cv-diff-row">
                    <span className="label">{FIELD_LABELS[ch.key]}</span>
                    <span className="muted">{ch.before || "—"}</span>
                    <span className="cv-arrow" aria-label="became">
                      →
                    </span>
                    <span>{ch.after || "—"}</span>
                  </div>
                ))}
              </div>
            )}
            {ver.changeNote.trim() !== "" && <div className="cv-note">{ver.changeNote}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** A sheet that asks "What changed?" (optional) before a single-field change is recorded. */
function NoteSheet({ title, intro, submitLabel, onClose, onSubmit }: { title: string; intro: string; submitLabel: string; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <div className="muted small">{intro}</div>
        <div className="cv-field">
          <span className="label">What changed?</span>
          <textarea className="cv-area" rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="Optional. Kept with the history." />
        </div>
        <div className="cv-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSubmit(note.trim())}>
            {submitLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Review a due record: keep it as it is (with the next review date) or mark it reconsidering. */
function ReviewSheet({ v, onClose, onSubmit }: { v: ConvictionVersion; onClose: () => void; onSubmit: (patch: Partial<VersionInput>) => void }) {
  const [note, setNote] = useState("");
  const [months, setMonths] = useState<number | null>(3);
  const nextDate = months === null ? null : addMonths(todayISO(), months);
  return (
    <Sheet title="Reviewing this record" onClose={onClose}>
      <div className="stack">
        <div className="muted small">It was due for review on {formatMedium(v.reviewDate ?? todayISO())}. Reading it again today, does it still hold?</div>
        <div className="cv-field">
          <span className="label">Notes on rereading it</span>
          <textarea className="cv-area" rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="Optional. Kept with the history." />
        </div>
        <div className="cv-field">
          <span className="label">Next review</span>
          <div className="cv-presets" role="radiogroup" aria-label="Next review">
            {NEXT_REVIEW.map((p) => (
              <button
                key={p.label}
                type="button"
                role="radio"
                aria-checked={months === p.months}
                className={months === p.months ? "btn btn-sm" : "btn btn-quiet btn-sm"}
                onClick={() => setMonths(p.months)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {nextDate && <span className="faint small">Come back to this on {formatMedium(nextDate)}.</span>}
        </div>
        <div className="cv-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => onSubmit({ status: "reconsidering", reviewDate: nextDate, changeNote: note.trim() })}>
            I'm reconsidering
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSubmit({ reviewDate: nextDate, changeNote: note.trim() })}>
            It still holds
          </button>
        </div>
      </div>
    </Sheet>
  );
}
