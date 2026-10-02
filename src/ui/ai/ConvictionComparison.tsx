import { useMemo, useState } from "react";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { compareConviction, readComparison } from "../../ai/compare";
import { AiBlock } from "../components/AiBlock";
import { MarkdownView } from "../components/MarkdownView";
import { removeArtifact } from "./artifacts";
import { linkCitations } from "./citations";
import { aiErrorText } from "./errors";
import "./ai.css";

function ComparisonPanel({ convictionId }: { convictionId: string }) {
  const stored = useQuery((j) => j.artifacts.forOwner("conviction", convictionId, "comparison")[0] ?? null, [convictionId], ["ai"]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nothingLater, setNothingLater] = useState(false);

  const comparison = useMemo(() => (stored ? readComparison(stored) : null), [stored]);
  const busy = streaming !== null;
  const markdown = useMemo(() => {
    if (streaming !== null) return linkCitations(streaming, []);
    return comparison ? linkCitations(comparison.text, comparison.sources) : "";
  }, [streaming, comparison]);

  const run = async () => {
    const j = journal();
    setError(null);
    setNothingLater(false);
    setStreaming("");
    try {
      const a = await compareConviction(j, convictionId, (_d, soFar) => setStreaming(soFar));
      setNothingLater(a === null);
    } catch (e) {
      setError(aiErrorText(e, j.settings.get().ai.ollamaUrl));
    } finally {
      setStreaming(null);
    }
  };

  const hasBlock = busy || stored !== null;
  return (
    <div className="ai-inline">
      <div className="label">Local AI</div>
      {!hasBlock && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run()}>
          Compare with later writing
        </button>
      )}
      {hasBlock && (
        <AiBlock
          model={busy ? journal().settings.get().ai.chatModel : stored?.model}
          actions={
            busy ? null : (
              <span className="ai-actions">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run()}>
                  Compare again
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => stored && removeArtifact(journal(), stored.id)}>
                  Remove
                </button>
              </span>
            )
          }
        >
          {markdown.length > 0 ? <MarkdownView markdown={markdown} /> : <p className="ai-pending">Reading later entries…</p>}
        </AiBlock>
      )}
      {error && <div className="ai-note">{error}</div>}
      {nothingLater && !hasBlock && <div className="faint small">Nothing written since touches this subject yet.</div>}
    </div>
  );
}

/** "Compare with later writing": an AI note on how later entries relate to a conviction, with dated links. Null when AI is off. */
export function ConvictionComparison({ convictionId }: { convictionId: string }) {
  const [settings] = useSettings();
  if (!settings.ai.enabled) return null;
  return <ComparisonPanel convictionId={convictionId} />;
}
