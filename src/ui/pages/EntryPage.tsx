import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Block, Entry, SearchHit, TemplateSection } from "../../domain/types";
import { formatLong, formatMedium } from "../../domain/dates";
import { wordCount } from "../../domain/text";
import { BLOCK_TYPE_LABELS } from "../../domain/template";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { convictionsRelatedToText, relatedEntries } from "../../search/related";
import { useAside, useShell } from "../shell/ShellContext";
import { IconClose, IconFocus, IconStar } from "../shell/icons";
import { HitList } from "../components/HitList";
import { EntrySummary } from "../ai/EntrySummary";
import { ConvictionSuggestion } from "../ai/ConvictionSuggestion";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { SectionEditor } from "../editor/SectionEditor";
import { useBlockDraft } from "../editor/useBlockDraft";
import "../editor/editor.css";

const STAMP = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const RELATED_DELAY = 2000;

interface Related {
  hits: SearchHit[];
  method: "semantic" | "keyword";
  convictions: SearchHit[];
}

/** Related entries and convictions for the entry's text; immediate on open, then 2s after edits settle. */
function useRelated(entryId: string, text: string): Related | null {
  const [related, setRelated] = useState<Related | null>(null);
  const first = useRef(true);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const j = journal();
      const [entries, convictions] = await Promise.all([
        relatedEntries(j, text, { excludeEntryId: entryId, limit: 6 }),
        convictionsRelatedToText(j, text),
      ]);
      if (alive) setRelated({ hits: entries.hits, method: entries.method, convictions });
    };
    const delay = first.current ? 0 : RELATED_DELAY;
    first.current = false;
    const timer = window.setTimeout(() => void run(), delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [entryId, text]);
  return related;
}

function NoteEditor({ entry, autoFocus }: { entry: Entry; autoFocus: boolean }) {
  const draft = useBlockDraft(entry.id, entry.blocks[0] ?? null, "generic", {});
  return (
    <div id={draft.blockId ?? undefined}>
      <MarkdownEditor value={draft.text} onChange={draft.setText} placeholder="Write it down before it goes." autoFocus={autoFocus} minLines={8} />
    </div>
  );
}

function DailySections({ entry, template, autoFocus }: { entry: Entry; template: TemplateSection[]; autoFocus: boolean }) {
  const used = new Set<string>();
  const sections: { section: TemplateSection; block: Block | null }[] = [];
  for (const section of template) {
    if (!section.enabled) continue;
    const block = entry.blocks.find((b) => b.metadata.section === section.key && !used.has(b.id)) ?? null;
    if (block) used.add(block.id);
    sections.push({ section, block });
  }
  const orphans = entry.blocks.filter((b) => !used.has(b.id));
  return (
    <>
      {sections.map(({ section, block }, i) => (
        <SectionEditor
          key={section.key}
          entryId={entry.id}
          sectionKey={section.key}
          label={section.label}
          blockType={section.blockType}
          prompt={section.prompt}
          secondaryPrompts={section.secondaryPrompts}
          block={block}
          autoFocus={autoFocus && i === 0}
        />
      ))}
      {orphans.map((block) => {
        const key = typeof block.metadata.section === "string" ? block.metadata.section : block.type;
        const section = template.find((s) => s.key === key);
        return (
          <SectionEditor
            key={block.id}
            entryId={entry.id}
            sectionKey={key}
            label={section?.label ?? BLOCK_TYPE_LABELS[block.type]}
            blockType={block.type}
            prompt={section?.prompt ?? ""}
            secondaryPrompts={section?.secondaryPrompts ?? []}
            block={block}
          />
        );
      })}
    </>
  );
}

function EntryEditor({ entry }: { entry: Entry }) {
  const j = journal();
  const navigate = useNavigate();
  const location = useLocation();
  const [settings] = useSettings();
  const { focus, setFocus } = useShell();

  const [title, setTitle] = useState(entry.title);
  const titleSaved = useRef(entry.title);
  const titleTimer = useRef<number | undefined>(undefined);
  const [tagsText, setTagsText] = useState(entry.tags.join(", "));
  const tagsSaved = useRef(entry.tags.join(", "));

  useEffect(() => {
    if (entry.title !== titleSaved.current) {
      titleSaved.current = entry.title;
      setTitle(entry.title);
    }
  }, [entry.title]);
  useEffect(() => {
    const joined = entry.tags.join(", ");
    if (joined !== tagsSaved.current) {
      tagsSaved.current = joined;
      setTagsText(joined);
    }
  }, [entry.tags]);

  const saveTitle = (next: string) => {
    setTitle(next);
    clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      if (next === titleSaved.current) return;
      titleSaved.current = next;
      j.entries.update(entry.id, { title: next });
    }, 500);
  };
  useEffect(() => () => clearTimeout(titleTimer.current), []);

  const commitTags = () => {
    if (tagsText === tagsSaved.current) return;
    const tags = tagsText.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    tagsSaved.current = tags.join(", ");
    setTagsText(tagsSaved.current);
    j.entries.setTags(entry.id, tags);
  };

  // Leave focus mode when the page goes away; Escape exits it while here.
  useEffect(() => () => setFocus(false), [setFocus]);
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus]);

  // `#<blockId>` in the URL scrolls to that block once the editors are mounted.
  useEffect(() => {
    const target = location.hash.slice(1);
    if (!target) return;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allText = entry.blocks.map((b) => b.content).join("\n\n");
  const words = wordCount(allText);
  const related = useRelated(entry.id, allText);

  useAside(
    <>
      <section>
        <h3 className="label">Related</h3>
        {related ? (
          <>
            <HitList hits={related.hits} compact emptyText="Nothing related yet. Keep writing." />
            {related.hits.length > 0 && <div className="faint small aside-note">{related.method === "semantic" ? "Found by meaning (local index)." : "Found by shared words."}</div>}
          </>
        ) : (
          <div className="faint small">Looking…</div>
        )}
      </section>
      {related && related.convictions.length > 0 && (
        <section>
          <h3 className="label">You previously wrote</h3>
          {related.convictions.map((h) => (
            <Link key={h.id} to={`/convictions/${h.id}`} className="aside-item">
              <div className="aside-item-date">
                {h.blockType === "decision" ? "Decision" : "Conviction"} · {formatMedium(h.date)}
              </div>
              <div className="aside-item-title">{h.title}</div>
              <div className="aside-item-snippet">You previously wrote something about this. What changed?</div>
            </Link>
          ))}
        </section>
      )}
      {settings.ai.enabled && (
        <section>
          <h3 className="label">Local AI</h3>
          <EntrySummary entryId={entry.id} />
          <ConvictionSuggestion entryId={entry.id} />
        </section>
      )}
      <section className="aside-meta">
        <h3 className="label">About this entry</h3>
        <div className="faint small">Created {STAMP.format(new Date(entry.createdAt))}</div>
        <div className="faint small">Updated {STAMP.format(new Date(entry.updatedAt))}</div>
        <div className="faint small">
          {words} {words === 1 ? "word" : "words"}
          {entry.kind === "note" ? " · quick note" : ""}
        </div>
      </section>
    </>,
    [related, entry.id, entry.createdAt, entry.updatedAt, words, entry.kind, settings.ai.enabled],
  );

  const remove = () => {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    clearTimeout(titleTimer.current);
    titleSaved.current = title;
    j.entries.delete(entry.id);
    navigate("/journal");
  };

  const isEmpty = entry.blocks.every((b) => b.content.trim().length === 0);

  return (
    <div className={`page entry-page${focus ? " entry-focus" : ""}`}>
      {focus ? (
        <button type="button" className="btn btn-quiet focus-exit" onClick={() => setFocus(false)} aria-label="Exit focus mode" title="Exit focus mode (Esc)">
          <IconClose width={18} height={18} />
        </button>
      ) : (
        <header className="entry-head">
          <div className="row-between">
            <h1 className="entry-date">{formatLong(entry.entryDate)}</h1>
            <div className="row entry-tools">
              <button
                type="button"
                className={`btn btn-quiet btn-sm${entry.favorite ? " is-favorite" : ""}`}
                onClick={() => j.entries.update(entry.id, { favorite: !entry.favorite })}
                aria-pressed={entry.favorite}
                aria-label={entry.favorite ? "Remove from favorites" : "Mark as favorite"}
              >
                <IconStar width={18} height={18} filled={entry.favorite} />
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFocus(true)} aria-label="Focus mode" title="Focus mode">
                <IconFocus width={18} height={18} />
              </button>
            </div>
          </div>
          <input className="input-quiet entry-title" placeholder="Untitled" value={title} onChange={(e) => saveTitle(e.target.value)} aria-label="Title" />
          <div className="row entry-meta">
            <input
              className="input-quiet entry-tags"
              placeholder="tags, comma separated"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={commitTags}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria-label="Tags"
            />
            <span className="faint small entry-words">
              {words} {words === 1 ? "word" : "words"}
            </span>
          </div>
        </header>
      )}

      <div className="entry-body">
        {entry.kind === "note" ? (
          <NoteEditor entry={entry} autoFocus={isEmpty} />
        ) : (
          <DailySections entry={entry} template={settings.template} autoFocus={isEmpty} />
        )}
      </div>

      {!focus && (
        <footer className="entry-foot">
          <button type="button" className="btn btn-quiet btn-sm btn-danger-quiet" onClick={remove}>
            Delete entry
          </button>
        </footer>
      )}
    </div>
  );
}

export function EntryPage() {
  const { id = "" } = useParams();
  const entry = useQuery((j) => j.entries.get(id), [id], ["entries"]);
  if (!entry) {
    return (
      <div className="page">
        <div className="empty">
          This entry no longer exists. <Link to="/journal">Back to the journal.</Link>
        </div>
      </div>
    );
  }
  return <EntryEditor key={entry.id} entry={entry} />;
}
