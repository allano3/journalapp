import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Block, BlockMetadata, BlockType, PrayerItem, PrayerStatus } from "../../domain/types";
import { formatMedium, toISODate } from "../../domain/dates";
import { useQuery } from "../../state/hooks";
import { IconChevronRight } from "../shell/icons";
import { MarkdownEditor } from "./MarkdownEditor";
import { useBlockDraft, type BlockDraft } from "./useBlockDraft";
import "./editor.css";

export interface SectionEditorProps {
  entryId: string;
  /** Template key (or the block's own key for blocks outside the template). */
  sectionKey: string;
  label: string;
  blockType: BlockType;
  prompt: string;
  secondaryPrompts: string[];
  block: Block | null;
  autoFocus?: boolean;
}

const COLLAPSE_PREFIX = "journal.section.collapsed.";

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(COLLAPSE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(COLLAPSE_PREFIX + key, "1");
    else localStorage.removeItem(COLLAPSE_PREFIX + key);
  } catch {
    // Private mode or quota: the toggle still works for this session.
  }
}

const PRAYER_STATUSES: { value: PrayerStatus; label: string }[] = [
  { value: "ongoing", label: "ongoing" },
  { value: "resolved", label: "resolved" },
  { value: "answered", label: "answered" },
  { value: "no_longer_relevant", label: "no longer relevant" },
];

function prayerLines(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*-\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (m && m[1].trim().length > 0) items.push(m[1].trim());
  }
  return items;
}

function SleepLine({ draft }: { draft: BlockDraft }) {
  const quality = typeof draft.metadata.sleepQuality === "number" ? draft.metadata.sleepQuality : 0;
  const hours = typeof draft.metadata.sleepHours === "number" ? String(draft.metadata.sleepHours) : "";
  return (
    <div className="section-inline">
      <span className="faint">Sleep</span>
      <span className="section-inline-sep">·</span>
      <span className="faint">quality</span>
      <span className="dots" role="radiogroup" aria-label="Sleep quality">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={quality === n}
            aria-label={`${n} of 5`}
            className={`dot${n <= quality ? " dot-on" : ""}`}
            onClick={() => draft.setMetadata({ sleepQuality: quality === n ? undefined : n })}
          />
        ))}
      </span>
      <span className="section-inline-sep">·</span>
      <label className="faint">
        hours{" "}
        <input
          className="input-quiet input-tiny"
          type="number"
          inputMode="decimal"
          min={0}
          max={24}
          step={0.5}
          value={hours}
          onChange={(e) => draft.setMetadata({ sleepHours: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

function ReadingLine({ draft }: { draft: BlockDraft }) {
  const source = typeof draft.metadata.source === "string" ? draft.metadata.source : "";
  const reference = typeof draft.metadata.reference === "string" ? draft.metadata.reference : "";
  return (
    <div className="section-inline section-inline-fields">
      <input className="input-quiet" placeholder="Source" value={source} onChange={(e) => draft.setMetadata({ source: e.target.value })} aria-label="Source" />
      <input
        className="input-quiet"
        placeholder="Chapter / reference"
        value={reference}
        onChange={(e) => draft.setMetadata({ reference: e.target.value })}
        aria-label="Chapter or reference"
      />
    </div>
  );
}

function PrayerItems({ draft }: { draft: BlockDraft }) {
  const lines = prayerLines(draft.text);
  if (lines.length === 0) return null;
  const stored: PrayerItem[] = Array.isArray(draft.metadata.prayerItems) ? draft.metadata.prayerItems : [];
  const statusByText: Record<string, PrayerStatus> = {};
  for (const p of stored) statusByText[p.text] = p.status;
  const setStatus = (text: string, status: PrayerStatus) => {
    const next: PrayerItem[] = lines.map((t) => ({ text: t, status: t === text ? status : (statusByText[t] ?? "ongoing") }));
    draft.setMetadata({ prayerItems: next });
  };
  return (
    <ul className="prayer-items">
      {lines.map((text, i) => {
        const status = statusByText[text] ?? "ongoing";
        return (
          <li key={`${i}:${text}`} className={`prayer-item prayer-${status}`}>
            <span className="prayer-text">{text}</span>
            <select className="select-tiny" value={status} onChange={(e) => setStatus(text, e.target.value as PrayerStatus)} aria-label={`Status of “${text}”`}>
              {PRAYER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

function ConvictionControls({ entryId, draft }: { entryId: string; draft: BlockDraft }) {
  const navigate = useNavigate();
  const convictions = useQuery((j) => j.convictions.forEntry(entryId), [entryId], ["convictions"]);
  const go = (kind: "conviction" | "decision") => {
    draft.flush();
    const blockId = draft.ensureBlock();
    navigate(`/convictions/new?entry=${encodeURIComponent(entryId)}&block=${encodeURIComponent(blockId)}&kind=${kind}`);
  };
  return (
    <div className="section-after">
      <div className="row">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => go("conviction")}>
          Record a conviction
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => go("decision")}>
          Record a decision
        </button>
      </div>
      {convictions.length > 0 && (
        <ul className="section-links">
          {convictions.map((c) => (
            <li key={c.id}>
              <Link to={`/convictions/${c.id}`}>{c.statement || "(untitled)"}</Link>
              <span className="faint small">
                {" "}
                · {c.kind} · {formatMedium(toISODate(new Date(c.createdAt)))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionLine({ draft }: { draft: BlockDraft }) {
  const action = typeof draft.metadata.action === "string" ? draft.metadata.action : "";
  const done = draft.metadata.done === true;
  return (
    <div className="section-inline section-after">
      <input type="checkbox" className="check-tiny" checked={done} onChange={(e) => draft.setMetadata({ done: e.target.checked })} aria-label="Action done" />
      <input
        className={`input-quiet input-grow${done ? " action-done" : ""}`}
        placeholder="One concrete action"
        value={action}
        onChange={(e) => draft.setMetadata({ action: e.target.value })}
        aria-label="One concrete action"
      />
    </div>
  );
}

export function SectionEditor({ entryId, sectionKey, label, blockType, prompt, secondaryPrompts, block, autoFocus }: SectionEditorProps) {
  const initialMeta: BlockMetadata = { section: sectionKey };
  const draft = useBlockDraft(entryId, block, blockType, initialMeta);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(sectionKey));
  const [showPrompts, setShowPrompts] = useState(false);

  const toggle = () => {
    writeCollapsed(sectionKey, !collapsed);
    setCollapsed(!collapsed);
  };

  const insertPrompt = (p: string) => {
    const base = draft.text.trimEnd();
    draft.setText((base.length > 0 ? base + "\n\n" : "") + "> " + p + "\n");
  };

  let before: ReactNode = null;
  let after: ReactNode = null;
  if (blockType === "sleep") before = <SleepLine draft={draft} />;
  else if (blockType === "reading") before = <ReadingLine draft={draft} />;
  else if (blockType === "prayer") after = <PrayerItems draft={draft} />;
  else if (blockType === "conviction") after = <ConvictionControls entryId={entryId} draft={draft} />;
  else if (blockType === "action") after = <ActionLine draft={draft} />;

  const hasText = draft.text.trim().length > 0;

  return (
    <section className={`section${collapsed ? " section-collapsed" : ""}`} id={draft.blockId ?? undefined} data-section={sectionKey}>
      <div className="section-head">
        <button type="button" className="section-toggle" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}>
          <IconChevronRight className="section-chevron" />
          <span className="label">{label}</span>
        </button>
        {!collapsed && secondaryPrompts.length > 0 && (
          <button type="button" className="section-prompts-toggle" onClick={() => setShowPrompts((s) => !s)} aria-expanded={showPrompts}>
            prompts
          </button>
        )}
        {collapsed && hasText && <span className="section-collapsed-hint faint small">written</span>}
      </div>
      {!collapsed && (
        <div className="section-body">
          {showPrompts && (
            <ul className="section-prompts">
              {secondaryPrompts.map((p) => (
                <li key={p}>
                  <button type="button" className="section-prompt" onClick={() => insertPrompt(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {before}
          <MarkdownEditor value={draft.text} onChange={draft.setText} placeholder={prompt} autoFocus={autoFocus} minLines={2} />
          {after}
        </div>
      )}
    </section>
  );
}
