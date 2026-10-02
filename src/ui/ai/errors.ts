/** Plain-language text for a failed call to Ollama, always naming the address in use. */
export function aiErrorText(e: unknown, ollamaUrl: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const detail = /"error"\s*:\s*"([^"]+)"/.exec(msg)?.[1];
  if (detail) return `Ollama at ${ollamaUrl} replied: ${detail}`;
  if (/HTTP \d+/.test(msg)) return `Ollama at ${ollamaUrl} replied with an error (${msg.replace(/^Ollama \w+ failed: /, "")}).`;
  return `Could not reach Ollama at ${ollamaUrl}. Check that it is running, or change the address in Settings.`;
}
