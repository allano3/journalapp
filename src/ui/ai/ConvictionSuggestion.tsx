import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import type { AiArtifact } from "../../domain/types";
import { readSuggestion, suggestConvictions, type ConvictionSuggestion as Suggestion } from "../../ai/suggest";
import { AiBlock } from "../components/AiBlock";
import { aiErrorText } from "./errors";
import "./ai.css";

function SuggestionCard({ artifact, suggestion, entryId }: { artifact: AiArtifact; suggestion: Suggestion; entryId: string }) {
  const navigate = useNavigate();
  const accept = () => {
    journal().artifacts.setState(artifact.id, "accepted");
    const q = new URLSearchParams({ entry: entryId, kind: suggestion.kind, statement: suggestion.statement });
    if (suggestion.blockId) q.set("block", suggestion.blockId);
    navigate(`/convictions/new?${q.toString()}`);
  };
  return (
    <AiBlock model={artifact.model}>
      <p>Your entry sounds like it may contain an important {suggestion.kind}. Save this as a conviction?</p>
      <p className="ai-statement">{suggestion.statement}</p>
      {suggestion.quote.length > 0 && <p className="ai-quote">“{suggestion.quote}”</p>}
      <div className="ai-actions">
        <button type="button" className="btn btn-sm" onClick={accept}>
          Save as conviction
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => journal().artifacts.setState(artifact.id, "dismissed")}>
          Dismiss
        </button>
      </div>
    </AiBlock>
  );
}

function SuggestionPanel({ entryId }: { entryId: string }) {
  const pending = useQuery((j) => j.artifacts.forOwner("entry", entryId, "suggestion").filter((a) => a.state === "pending"), [entryId], ["ai"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedEmpty, setSearchedEmpty] = useState(false);

  const look = async () => {
    const j = journal();
    setBusy(true);
    setError(null);
    setSearchedEmpty(false);
    try {
      const found = await suggestConvictions(j, entryId);
      setSearchedEmpty(found.length === 0);
    } catch (e) {
      setError(aiErrorText(e, j.settings.get().ai.ollamaUrl));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-inline">
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => void look()} disabled={busy}>
        {busy ? "Reading the entry…" : pending.length > 0 ? "Look again" : "Look for decisions in this entry"}
      </button>
      {error && <div className="ai-note">{error}</div>}
      {searchedEmpty && pending.length === 0 && !error && <div className="faint small">Nothing in this entry reads like a decision or conviction.</div>}
      {pending.map((a) => {
        const s = readSuggestion(a);
        return s ? <SuggestionCard key={a.id} artifact={a} suggestion={s} entryId={entryId} /> : null;
      })}
    </div>
  );
}

/** Optional, explicit-acceptance suggestions of convictions found in an entry. Null when AI is off. */
export function ConvictionSuggestion({ entryId }: { entryId: string }) {
  const [settings] = useSettings();
  if (!settings.ai.enabled) return null;
  return <SuggestionPanel entryId={entryId} />;
}
