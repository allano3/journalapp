import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import type { ConvictionKind, ConvictionStatus } from "../../domain/types";
import { CONVICTION_STATUSES } from "../../domain/types";
import { addMonths, formatMedium, todayISO } from "../../domain/dates";
import type { VersionInput } from "../../storage/repos/convictions";
import { ConfidenceDots } from "./ConfidenceDots";
import { FIELD_PROMPTS, STATUS_LABELS } from "./fields";
import "./convictions.css";

const REVIEW_PRESETS: readonly { label: string; months: number }[] = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
];

/** Journal-font textarea that grows with its content instead of scrolling. */
const GrowingArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }>(function GrowingArea({ value, className, rows = 2, ...rest }, outer) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof outer === "function") outer(el);
        else if (outer) outer.current = el;
      }}
      value={value}
      rows={rows}
      {...rest}
      className={className ? `cv-area ${className}` : "cv-area"}
    />
  );
});

/**
 * The record as a single calm flow of prompts. Shared by the New page and the Revise
 * sheet; only the statement is required.
 */
export function ConvictionForm({
  initial,
  kind,
  onSubmit,
  onCancel,
  showChangeNote = false,
  submitLabel,
  focusChangeNote = false,
}: {
  initial: VersionInput;
  kind: ConvictionKind;
  onSubmit: (v: VersionInput) => void;
  onCancel: () => void;
  showChangeNote?: boolean;
  submitLabel: string;
  /** Put the caret in "What changed?" on mount (used by "Reflect on this"). */
  focusChangeNote?: boolean;
}) {
  const [v, setV] = useState<VersionInput>(initial);
  const statementRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const patch = (p: Partial<VersionInput>) => setV((cur) => ({ ...cur, ...p }));
  const canSave = v.statement.trim().length > 0;

  useEffect(() => {
    const target = focusChangeNote && showChangeNote ? noteRef.current : statementRef.current;
    if (!target) return;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  }, [focusChangeNote, showChangeNote]);

  const ifThen = v.ifThen ?? { condition: "", action: "" };
  const setIfThen = (p: Partial<{ condition: string; action: string }>) => {
    const next = { ...ifThen, ...p };
    patch({ ifThen: next.condition === "" && next.action === "" ? null : next });
  };

  const submit = () => {
    if (!canSave) return;
    onSubmit({
      ...v,
      statement: v.statement.trim(),
      ifThen: v.ifThen && (v.ifThen.condition.trim() || v.ifThen.action.trim()) ? { condition: v.ifThen.condition.trim(), action: v.ifThen.action.trim() } : null,
      reviewDate: v.reviewDate || null,
    });
  };

  return (
    <form
      className="cv-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      {showChangeNote && (
        <div className="cv-field cv-field-note">
          <span className="label">What changed?</span>
          <GrowingArea
            ref={noteRef}
            value={v.changeNote}
            onChange={(e) => patch({ changeNote: e.target.value })}
            placeholder="A line on why this version differs from the last. Kept with the history."
            rows={2}
          />
        </div>
      )}

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.statement}</span>
        <GrowingArea
          ref={statementRef}
          className="cv-area-statement"
          value={v.statement}
          onChange={(e) => patch({ statement: e.target.value })}
          placeholder={kind === "decision" ? "I will…" : "I believe…"}
          rows={2}
        />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.context}</span>
        <GrowingArea value={v.context} onChange={(e) => patch({ context: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.reasoning}</span>
        <GrowingArea value={v.reasoning} onChange={(e) => patch({ reasoning: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.confidence}</span>
        <div className="row">
          <ConfidenceDots value={v.confidence} onChange={(c) => patch({ confidence: c })} size="md" />
          <span className="faint small">{v.confidence === null ? "not set" : `${v.confidence} of 5`}</span>
        </div>
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.evidence}</span>
        <GrowingArea value={v.evidence} onChange={(e) => patch({ evidence: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.uncertainties}</span>
        <GrowingArea value={v.uncertainties} onChange={(e) => patch({ uncertainties: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.changeTriggers}</span>
        <span className="cv-hint">Conviction without stubbornness — name the evidence that would move you.</span>
        <GrowingArea value={v.changeTriggers} onChange={(e) => patch({ changeTriggers: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.costOfIgnoring}</span>
        <GrowingArea value={v.costOfIgnoring} onChange={(e) => patch({ costOfIgnoring: e.target.value })} rows={2} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.nextAction}</span>
        <GrowingArea value={v.nextAction} onChange={(e) => patch({ nextAction: e.target.value })} rows={1} />
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.ifThen}</span>
        <div className="cv-ifthen">
          <span>If</span>
          <input value={ifThen.condition} onChange={(e) => setIfThen({ condition: e.target.value })} aria-label="Condition" />
          <span>happens, I will</span>
          <input value={ifThen.action} onChange={(e) => setIfThen({ action: e.target.value })} aria-label="Action" />
        </div>
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.reviewDate}</span>
        <div className="cv-presets">
          <input type="date" className="input input-quiet cv-date" value={v.reviewDate ?? ""} onChange={(e) => patch({ reviewDate: e.target.value || null })} aria-label="Review date" />
          {REVIEW_PRESETS.map((p) => (
            <button key={p.months} type="button" className="btn btn-quiet btn-sm" onClick={() => patch({ reviewDate: addMonths(todayISO(), p.months) })}>
              {p.label}
            </button>
          ))}
          {v.reviewDate && (
            <button type="button" className="btn btn-quiet btn-sm faint" onClick={() => patch({ reviewDate: null })}>
              clear
            </button>
          )}
        </div>
        {v.reviewDate && <span className="faint small">Come back to this on {formatMedium(v.reviewDate)}.</span>}
      </div>

      <div className="cv-field">
        <span className="label">{FIELD_PROMPTS.status}</span>
        <select className="select cv-select" value={v.status} onChange={(e) => patch({ status: e.target.value as ConvictionStatus })} aria-label="Status">
          {CONVICTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="cv-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSave} title={canSave ? "⌘↩" : "A statement is needed"}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
