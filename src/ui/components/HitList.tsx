import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SearchHit } from "../../domain/types";
import { formatMedium, relativeDays } from "../../domain/dates";
import { BLOCK_TYPE_LABELS } from "../../domain/template";
import { MARK_CLOSE, MARK_OPEN } from "../../search/fts";

/** Render an FTS snippet, turning the control-character marks into <mark>. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(MARK_OPEN);
  return (
    <>
      {parts.map((p, i) => {
        if (i === 0) return <Fragment key={i}>{p}</Fragment>;
        const [hit, rest] = p.split(MARK_CLOSE);
        return (
          <Fragment key={i}>
            <mark>{hit}</mark>
            {rest}
          </Fragment>
        );
      })}
    </>
  );
}

export function hitHref(h: SearchHit): string {
  if (h.kind === "conviction") return `/convictions/${h.id}`;
  return h.blockId ? `/entry/${h.entryId}#${h.blockId}` : `/entry/${h.entryId}`;
}

/**
 * Shared list of search/related hits. Used by Search, conviction detail, the editor
 * aside and Today so results look identical everywhere.
 */
export function HitList({ hits, compact = false, emptyText = "Nothing here yet.", trailing }: { hits: SearchHit[]; compact?: boolean; emptyText?: ReactNode; trailing?: (h: SearchHit) => ReactNode }) {
  if (hits.length === 0) return <div className={compact ? "faint small" : "empty"}>{emptyText}</div>;
  return (
    <div>
      {hits.map((h) => (
        <Link key={`${h.kind}:${h.id}:${h.blockId ?? ""}`} to={hitHref(h)} className={compact ? "aside-item" : "list-item"}>
          <div className={compact ? "aside-item-date" : "list-meta"}>
            <span>{formatMedium(h.date)}</span>
            {!compact && <span>· {relativeDays(h.date)}</span>}
            {h.blockType && <span>· {h.kind === "conviction" ? (h.blockType === "decision" ? "Decision" : "Conviction") : BLOCK_TYPE_LABELS[h.blockType]}</span>}
            {h.favorite && <span>· ★</span>}
          </div>
          {h.title && <div className={compact ? "aside-item-title" : "list-title"}>{h.title}</div>}
          <div className={compact ? "aside-item-snippet" : "list-preview prose-snippet"}>
            <Snippet text={h.snippet} />
          </div>
          {trailing?.(h)}
        </Link>
      ))}
    </div>
  );
}
