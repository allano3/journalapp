import { useEffect, useState } from "react";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { changes } from "../../state/events";
import type { AiSettings } from "../../domain/types";
import { formatTime } from "../../domain/dates";
import { ollamaStatus, type OllamaStatus } from "../../ai/ollama";
import { indexProgress, onIndexProgress, syncIndex, type IndexProgress } from "../../ai/embeddings";
import "./ai.css";

function ModelField({ id, label, value, models, onChange }: { id: string; label: string; value: string; models: string[]; onChange: (v: string) => void }) {
  const options = models.includes(value) || value.length === 0 ? models : [value, ...models];
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {models.length > 0 ? (
        <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
      )}
    </div>
  );
}

function IndexStatus({ ai }: { ai: AiSettings }) {
  const [progress, setProgress] = useState<IndexProgress>(indexProgress());
  useEffect(() => onIndexProgress(setProgress), []);
  const indexedEntries = useQuery(
    (j) =>
      j.db.get<{ n: number }>(
        "SELECT COUNT(DISTINCT b.entry_id) n FROM embeddings em JOIN blocks b ON b.id = em.owner_id WHERE em.owner_type = 'block' AND em.model = ?",
        [ai.embeddingModel],
      )?.n ?? 0,
    [ai.embeddingModel],
    ["embeddings"],
  );

  const rebuild = () => {
    const j = journal();
    j.embeddings.clear();
    changes.emit("embeddings");
    void syncIndex(j);
  };

  let line: string;
  let tone = "";
  if (progress.running) {
    line = `Indexing ${progress.done} of ${progress.total} passages…`;
  } else if (progress.error) {
    line = progress.error;
    tone = "is-error";
  } else {
    line = `Indexed ${indexedEntries} ${indexedEntries === 1 ? "entry" : "entries"} · ${ai.embeddingModel}`;
    if (progress.lastRunAt) line += ` · checked ${formatTime(progress.lastRunAt)}`;
  }

  return (
    <div className="field">
      <div className="label">Semantic index</div>
      <div className="row-between">
        <span className={`status-line ${tone}`}>{line}</span>
        <span className="row">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => void syncIndex(journal())} disabled={progress.running}>
            Update
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={rebuild} disabled={progress.running}>
            Rebuild index
          </button>
        </span>
      </div>
    </div>
  );
}

export function AiSettingsSection() {
  const [settings, update] = useSettings();
  const ai = settings.ai;
  const [url, setUrl] = useState(ai.ollamaUrl);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const save = (patch: Partial<AiSettings>) => update({ ai: { ...journal().settings.get().ai, ...patch } });

  const test = async (s: AiSettings) => {
    setTesting(true);
    setStatus(await ollamaStatus(s));
    setTesting(false);
  };

  // Check the configured address once when the section opens with AI on.
  useEffect(() => {
    if (ai.enabled && status === null && !testing) void test(ai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.enabled]);

  const commitUrl = () => {
    const next = url.trim().replace(/\/$/, "") || "http://localhost:11434";
    setUrl(next);
    if (next === ai.ollamaUrl) return;
    save({ ollamaUrl: next });
    setStatus(null);
  };

  const models = status?.reachable ? status.models : [];

  return (
    <div className="ai-settings">
      <label className="toggle">
        <input type="checkbox" checked={ai.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        <span>Use local AI (Ollama)</span>
      </label>

      <div className="field">
        <label className="label" htmlFor="ai-url">
          Ollama address
        </label>
        <div className="row">
          <input
            id="ai-url"
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={commitUrl}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            inputMode="url"
          />
          <button type="button" className="btn btn-sm" onClick={() => void test({ ...ai, ollamaUrl: url.trim() || ai.ollamaUrl })} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
        {status && (
          <div className={`status-line ${status.reachable ? "is-ok" : "is-error"}`}>
            {status.reachable
              ? status.models.length > 0
                ? `Reachable · ${status.models.length} ${status.models.length === 1 ? "model" : "models"}: ${status.models.join(", ")}`
                : "Reachable, but no models are installed. Pull one with `ollama pull`."
              : `Not reachable at ${url.trim() || ai.ollamaUrl}${status.error ? ` (${status.error})` : ""}.`}
          </div>
        )}
      </div>

      <div className="field-row">
        <ModelField id="ai-chat-model" label="Chat model" value={ai.chatModel} models={models} onChange={(v) => save({ chatModel: v })} />
        <ModelField id="ai-embed-model" label="Embedding model" value={ai.embeddingModel} models={models} onChange={(v) => save({ embeddingModel: v })} />
      </div>

      {ai.enabled && <IndexStatus ai={ai} />}

      <p className="privacy-note">Journal text is sent only to this Ollama address. Nothing leaves this machine unless you point it elsewhere.</p>
    </div>
  );
}
