import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { journal } from "../../storage/db";
import { useSettings } from "../../state/hooks";
import type { ChatMessage } from "../../ai/ollama";
import { askJournal } from "../../ai/ask";
import { ASK_EXAMPLES, type Passage } from "../../ai/prompts";
import { AiBlock } from "../components/AiBlock";
import { MarkdownView } from "../components/MarkdownView";
import { HitList } from "../components/HitList";
import { linkCitations, passagesToHits } from "../ai/citations";
import { aiErrorText } from "../ai/errors";
import "../ai/ai.css";

interface Turn {
  id: number;
  question: string;
  answer: string;
  sources: Passage[];
  model: string;
  streaming: boolean;
  error: string | null;
}

function AssistantTurn({ turn, onStop }: { turn: Turn; onStop: () => void }) {
  const linked = useMemo(() => linkCitations(turn.answer, turn.sources), [turn.answer, turn.sources]);
  const hits = useMemo(() => passagesToHits(turn.sources), [turn.sources]);
  return (
    <AiBlock
      model={turn.model}
      actions={
        turn.streaming ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onStop}>
            Stop
          </button>
        ) : null
      }
    >
      {turn.error ? <p className="ai-error">{turn.error}</p> : null}
      {turn.answer.length > 0 ? <MarkdownView markdown={linked} /> : turn.streaming ? <p className="ai-pending">Reading your entries…</p> : null}
      {hits.length > 0 && (
        <details className="ai-sources">
          <summary className="label">
            Sources · {hits.length} {hits.length === 1 ? "passage" : "passages"}
          </summary>
          <HitList hits={hits} compact />
        </details>
      )}
    </AiBlock>
  );
}

export function AskPage() {
  const [settings] = useSettings();
  const [params, setParams] = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const [draft, setDraft] = useState("");
  const busy = turns.some((t) => t.streaming);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const ai = settings.ai;

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (q.length === 0 || abortRef.current) return;
      const j = journal();
      const id = nextId.current++;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const history: ChatMessage[] = turnsRef.current
        .filter((t) => !t.error && t.answer.length > 0)
        .flatMap((t) => [{ role: "user" as const, content: t.question }, { role: "assistant" as const, content: t.answer }]);
      setTurns((ts) => [...ts, { id, question: q, answer: "", sources: [], model: j.settings.get().ai.chatModel, streaming: true, error: null }]);
      setDraft("");
      const patch = (p: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
      try {
        const res = await askJournal(j, q, history, (_d, soFar) => patch({ answer: soFar }), { signal: ctrl.signal, onSources: (sources) => patch({ sources }) });
        patch({ answer: res.answer, sources: res.sources, model: res.model, streaming: false });
      } catch (e) {
        patch({ error: aiErrorText(e, j.settings.get().ai.ollamaUrl), streaming: false });
      } finally {
        abortRef.current = null;
      }
    },
    [],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // `?q=` asks once; the param is cleared so a reload does not re-ask. Deferred a tick so
  // StrictMode's mount/unmount rehearsal cannot start (and then abort) the request.
  useEffect(() => {
    const q = params.get("q");
    if (!q || !ai.enabled) return;
    const t = setTimeout(() => {
      setParams({}, { replace: true });
      void ask(q);
    }, 0);
    return () => clearTimeout(t);
  }, [params, setParams, ask, ai.enabled]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!ai.enabled) {
    return (
      <div className="page ask-page">
        <div className="page-head">
          <h1 className="page-title">Ask my journal</h1>
        </div>
        <p className="muted">
          Local AI is off, so there is no one to ask. You can turn it on in <Link to="/settings">Settings</Link>; search still works without it.
        </p>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(draft);
    }
  };

  return (
    <div className="page ask-page">
      <div className="page-head">
        <h1 className="page-title">Ask my journal</h1>
        <p className="page-sub">Answers are drawn from your own entries and cite the dates they come from. Nothing leaves this machine.</p>
      </div>

      {turns.length === 0 && (
        <div className="ask-examples" aria-label="Example questions">
          {ASK_EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => void ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="ask-thread">
        {turns.map((t) => (
          <div key={t.id} className="stack">
            <div className="ask-user">{t.question}</div>
            <AssistantTurn turn={t} onStop={stop} />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="ask-form" onSubmit={submit}>
        <textarea
          className="textarea"
          rows={2}
          value={draft}
          placeholder={turns.length === 0 ? "Ask about what you have written…" : "Ask a follow-up…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          aria-label="Question"
        />
        {busy ? (
          <button type="button" className="btn" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={draft.trim().length === 0}>
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
