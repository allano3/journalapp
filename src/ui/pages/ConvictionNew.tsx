import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ConvictionKind } from "../../domain/types";
import { formatMedium } from "../../domain/dates";
import { journal } from "../../storage/db";
import { EMPTY_VERSION, type VersionInput } from "../../storage/repos/convictions";
import { useQuery } from "../../state/hooks";
import { ConvictionForm } from "../convictions/ConvictionForm";
import { KIND_LABELS, firstParagraph } from "../convictions/fields";
import "../convictions/convictions.css";

/**
 * Promote a thought into a record. Query params: `kind` (conviction|decision),
 * `entry` and `block` (source), `statement` (prefilled text, URL-encoded).
 */
export function ConvictionNewPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const kind: ConvictionKind = params.get("kind") === "decision" ? "decision" : "conviction";
  const blockId = params.get("block");
  const entryParam = params.get("entry");
  const statementParam = params.get("statement") ?? "";

  const source = useQuery(
    (j) => {
      const block = blockId ? j.entries.getBlock(blockId) : null;
      const entryId = entryParam ?? block?.entryId ?? null;
      const entry = entryId ? j.entries.summary(entryId) : null;
      return { block, entry };
    },
    [blockId, entryParam],
    ["entries"],
  );

  const initial: VersionInput = {
    ...EMPTY_VERSION,
    statement: statementParam.trim() || (source.block ? firstParagraph(source.block.content) : ""),
    context: source.entry ? `From the journal entry of ${formatMedium(source.entry.entryDate)}` : "",
  };

  const save = (v: VersionInput) => {
    const c = journal().convictions.create({
      kind,
      version: v,
      sourceEntryId: source.entry?.id ?? null,
      sourceBlockId: source.block?.id ?? null,
    });
    navigate(`/convictions/${c.id}`, { replace: true });
  };

  const switchKind = (k: ConvictionKind) => {
    const next = new URLSearchParams(params);
    next.set("kind", k);
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">New {KIND_LABELS[kind].toLowerCase()}</h1>
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <span className="cv-kind-toggle">
            {(["conviction", "decision"] as const).map((k) => (
              <button key={k} type="button" className={k === kind ? "btn btn-sm" : "btn btn-quiet btn-sm"} onClick={() => switchKind(k)} aria-pressed={k === kind}>
                {KIND_LABELS[k]}
              </button>
            ))}
          </span>
          {source.entry && (
            <span className="faint small">
              from the entry of{" "}
              <Link to={source.block ? `/entry/${source.entry.id}#${source.block.id}` : `/entry/${source.entry.id}`}>{formatMedium(source.entry.entryDate)}</Link>
            </span>
          )}
        </div>
        <p className="page-sub">
          {kind === "decision"
            ? "Something you intend to do. Only the statement is needed; the rest can wait."
            : "Something clear enough that you don't want your future self to casually forget it. Only the statement is needed."}
        </p>
      </div>

      <ConvictionForm key={`${blockId ?? ""}|${entryParam ?? ""}|${statementParam}`} initial={initial} kind={kind} onSubmit={save} onCancel={() => navigate(-1)} submitLabel="Save" />
    </div>
  );
}
