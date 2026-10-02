import { useState } from "react";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { summarizeEntry } from "../../ai/summary";
import { AiBlock } from "../components/AiBlock";
import { removeArtifact } from "./artifacts";
import { aiErrorText } from "./errors";
import "./ai.css";

function SummaryPanel({ entryId }: { entryId: string }) {
  const stored = useQuery((j) => j.artifacts.forOwner("entry", entryId, "summary")[0] ?? null, [entryId], ["ai"]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emptyEntry, setEmptyEntry] = useState(false);

  const run = async () => {
    const j = journal();
    setError(null);
    setEmptyEntry(false);
    setStreaming("");
    try {
      const a = await summarizeEntry(j, entryId, (_d, soFar) => setStreaming(soFar));
      setEmptyEntry(a === null);
    } catch (e) {
      setError(aiErrorText(e, j.settings.get().ai.ollamaUrl));
    } finally {
      setStreaming(null);
    }
  };

  const model = streaming !== null ? journal().settings.get().ai.chatModel : stored?.model;
  const text = streaming ?? stored?.content ?? "";
  const busy = streaming !== null;

  if (!busy && !stored) {
    return (
      <div className="ai-inline">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run()}>
          Summarize
        </button>
        {error && <div className="ai-note">{error}</div>}
        {emptyEntry && <div className="faint small">There is no text to summarize yet.</div>}
      </div>
    );
  }

  return (
    <div className="ai-inline">
      <AiBlock
        model={model}
        actions={
          busy ? null : (
            <span className="ai-actions">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run()}>
                Regenerate
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => stored && removeArtifact(journal(), stored.id)}>
                Remove
              </button>
            </span>
          )
        }
      >
        {text.length > 0 ? <p style={{ whiteSpace: "pre-wrap" }}>{text}</p> : <p className="ai-pending">Reading the entry…</p>}
      </AiBlock>
      {error && <div className="ai-note">{error}</div>}
    </div>
  );
}

/** On-demand summary of one entry in the "You wrote…" voice, stored apart from the entry. Null when AI is off. */
export function EntrySummary({ entryId }: { entryId: string }) {
  const [settings] = useSettings();
  if (!settings.ai.enabled) return null;
  return <SummaryPanel entryId={entryId} />;
}
