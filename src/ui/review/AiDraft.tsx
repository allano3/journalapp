import { useEffect, useMemo, useRef, useState } from "react";
import type { ISODate, WeeklyReview } from "../../domain/types";
import { journal } from "../../storage/db";
import { useQuery } from "../../state/hooks";
import { convictionPassages, draftWeeklyReview, weekPassages, weekRange } from "../../ai/weekly";
import { AiBlock } from "../components/AiBlock";
import { MarkdownView } from "../components/MarkdownView";
import { linkCitations } from "../ai/citations";
import { aiErrorText } from "../ai/errors";
import "../ai/ai.css";
import "./review.css";

/**
 * "Draft by local AI": prepare, stream, keep, copy into the user's review, or
 * discard. The draft lives in `reviews.ai_draft`, apart from the user's text.
 */
export function AiDraft({ weekStart, review, onCopy }: { weekStart: ISODate; review: WeeklyReview | null; onCopy: (draft: string, model: string | null, createdAt: string | null) => void }) {
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nothing, setNothing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Citation targets for the stored draft: the week's entries and conviction activity.
  const sources = useQuery(
    (j) => {
      const { fromTs, toTs } = weekRange(weekStart);
      return [...weekPassages(j, weekStart), ...convictionPassages(j.convictions.createdBetween(fromTs, toTs)), ...convictionPassages(j.convictions.changedBetween(fromTs, toTs))];
    },
    [weekStart],
    ["entries", "convictions"],
  );

  const busy = streaming !== null;
  const text = streaming ?? review?.aiDraft ?? "";
  const markdown = useMemo(() => linkCitations(text, sources), [text, sources]);

  const prepare = async () => {
    const j = journal();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setNothing(false);
    setStreaming("");
    try {
      const res = await draftWeeklyReview(j, weekStart, (_d, soFar) => setStreaming(soFar), { signal: ctrl.signal });
      setNothing(res === null);
    } catch (e) {
      setError(aiErrorText(e, j.settings.get().ai.ollamaUrl));
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  };

  const hasDraft = busy || (review?.aiDraft ?? "").length > 0;
  const model = busy ? journal().settings.get().ai.chatModel : review?.aiDraftModel;

  return (
    <section className="review-section review-draft">
      <div className="label">Draft by local AI</div>
      {!hasDraft && (
        <div className="stack">
          <div>
            <button type="button" className="btn btn-sm" onClick={() => void prepare()}>
              Prepare a draft
            </button>
          </div>
          <div className="faint small">A draft is a starting point to edit, written from this week's entries. It is kept apart from your own words.</div>
          {nothing && <div className="faint small">There is nothing written this week to draft from.</div>}
          {error && <div className="ai-note">{error}</div>}
        </div>
      )}
      {hasDraft && (
        <>
          <AiBlock
            model={model}
            actions={
              busy ? (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => abortRef.current?.abort()}>
                  Stop
                </button>
              ) : null
            }
          >
            {text.length > 0 ? <MarkdownView markdown={markdown} /> : <p className="ai-pending">Reading this week's entries…</p>}
          </AiBlock>
          {!busy && review?.aiDraft && (
            <div className="ai-foot">
              <button type="button" className="btn btn-sm" onClick={() => onCopy(review.aiDraft ?? "", review.aiDraftModel, review.aiDraftCreatedAt)}>
                Copy draft into my review
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void prepare()}>
                Prepare again
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => journal().reviews.saveAiDraft(weekStart, null, null)}>
                Discard draft
              </button>
            </div>
          )}
          {error && <div className="ai-note">{error}</div>}
        </>
      )}
    </section>
  );
}
