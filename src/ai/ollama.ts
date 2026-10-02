import type { AiSettings } from "../domain/types";

/**
 * The only network client in the application. It talks exclusively to the
 * user-configured Ollama URL (default: localhost). Nothing else is ever called.
 */

export interface OllamaStatus {
  reachable: boolean;
  models: string[];
  error?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function ollamaStatus(settings: AiSettings, timeoutMs = 2500): Promise<OllamaStatus> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, "")}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return { reachable: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { reachable: true, models: (data.models ?? []).map((m) => m.name) };
  } catch (e) {
    return { reachable: false, models: [], error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Embed a batch of texts. Returns one vector per input, in order. */
export async function embed(settings: AiSettings, texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, "")}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: settings.embeddingModel, input: texts }),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings.map((v) => Float32Array.from(v));
}

export interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  /** Called with each streamed token delta. */
  onToken?: (delta: string, soFar: string) => void;
}

/** Streaming chat completion. Resolves with the full assistant text. */
export async function chat(settings: AiSettings, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${settings.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: settings.chatModel,
      messages,
      stream: true,
      options: { temperature: opts.temperature ?? 0.3 },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama chat failed: HTTP ${res.status} ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.length === 0) continue;
      const msg = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
      if (msg.error) throw new Error(msg.error);
      const delta = msg.message?.content ?? "";
      if (delta.length > 0) {
        full += delta;
        opts.onToken?.(delta, full);
      }
    }
  }
  return full;
}
