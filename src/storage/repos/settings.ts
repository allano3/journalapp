import type { SqlDriver } from "../driver";
import type { Settings } from "../../domain/types";
import { DEFAULT_TEMPLATE, normalizeTemplate } from "../../domain/template";
import { changes } from "../../state/events";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  journalFont: "serif",
  fontSize: "medium",
  template: DEFAULT_TEMPLATE,
  ai: {
    enabled: false,
    ollamaUrl: "http://localhost:11434",
    chatModel: "llama3.1",
    embeddingModel: "nomic-embed-text",
  },
  resurfacingEnabled: true,
  lock: null,
  deviceName: "",
};

/** Settings stored as one JSON document per key; unknown keys are preserved. */
export class SettingsRepo {
  private cache: Settings | null = null;

  constructor(private readonly db: SqlDriver) {}

  get(): Settings {
    if (this.cache) return this.cache;
    const rows = this.db.all<{ key: string; value: string }>("SELECT key, value FROM settings");
    const stored: Partial<Settings> = {};
    for (const r of rows) (stored as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      ai: { ...DEFAULT_SETTINGS.ai, ...(stored.ai ?? {}) },
      template: normalizeTemplate(stored.template),
    };
    this.cache = s;
    return s;
  }

  update(patch: Partial<Settings>): Settings {
    const next = { ...this.get(), ...patch };
    this.db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) {
        this.db.run("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", [k, JSON.stringify(v)]);
      }
    });
    this.cache = next;
    changes.emit("settings");
    return next;
  }

  /** Arbitrary small flags (e.g. "demoSeeded", "lastResurfacedAt") outside the typed settings. */
  getFlag<T>(key: string): T | null {
    const r = this.db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [`flag:${key}`]);
    return r ? (JSON.parse(r.value) as T) : null;
  }

  setFlag(key: string, value: unknown): void {
    this.db.run("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", [`flag:${key}`, JSON.stringify(value)]);
    changes.emit("settings");
  }

  invalidate(): void {
    this.cache = null;
  }
}
