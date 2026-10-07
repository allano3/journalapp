# Journal — architecture and design plan

A private, local-first journaling application for one person. The product goal is
to preserve a thought process well enough that, years later, the writer can see what
they believed, why, what they intended, and whether their thinking changed.

## 1. Repository state

Greenfield. Empty directory at start. Stack chosen per the brief:

- **UI:** React 18 + TypeScript, Vite.
- **Shell:** Tauri 2 (`src-tauri/`). The same web bundle runs in a plain browser
  during development and inside the Tauri webview on desktop/mobile.
- **Storage:** SQLite via `@sqlite.org/sqlite-wasm` (the official WebAssembly build, FTS5 enabled).
  One SQL engine in every environment; only the *persistence of the database file*
  differs per platform (`BlobStore`): IndexedDB in the browser, a file in the app data
  directory under Tauri.
- **Rust:** only the Tauri shell. No custom native code is needed for v1.

Why sqlite-wasm instead of a native SQLite plugin: one code path, FTS5 guaranteed, works in
browser dev without a Rust toolchain, trivial to export the raw `.sqlite` file. The whole
database is a few megabytes for a lifetime of writing; rewriting the file on a debounced
save is cheap. If a native driver is ever wanted, only `src/storage/driver.ts` changes.

## 2. Layering

```
src/
  domain/     pure types + logic: entries, blocks, template, markdown, chunking, dates
  storage/    SqlDriver, migrations, repositories (entries, convictions, reviews, settings, embeddings)
  search/     FTS5 keyword search, filters, grouping; related-entry lookup; semantic bridge
  ai/         Ollama client, embedding index, Ask My Journal, weekly draft, conviction suggestions
  security/   passcode lock, AES-GCM backup encryption
  sync/       export (Markdown/JSON), encrypted backup/restore; future sync notes
  state/      thin React hooks + change-event bus over repositories
  ui/         shell, pages, editor, components, styles
  demo/       synthetic demo data (never auto-inserted)
```

Rules:

- `domain`, `storage`, `search`, `ai`, `security`, `sync` never import from `ui`.
- `ai` is additive. Everything in `ui` must render and function with `ai` disabled
  or Ollama unreachable.
- AI output is always stored in separate columns/tables (`reviews.ai_draft`,
  `ai_artifacts`) and rendered with an explicit "Local AI" marker. User text is never
  modified by AI code paths.

## 3. Data model

- `entries(id, entry_date, created_at, updated_at, title, favorite, source_device, kind)`
  `kind` = `daily` | `note` (quick notes bypass the template).
- `blocks(id, entry_id, type, content, position, metadata, updated_at)` — markdown content; `metadata`
  JSON holds structured extras (sleep quality/hours, reading source/chapter, prayer item
  states, the template section key).
- `tags(id, name)` + `entry_tags`.
- `convictions(id, kind, created_at, source_entry_id, source_block_id, current_version_id)`
- `conviction_versions(...)` — **append-only**. Every edit, status change or "what changed"
  reflection creates a new version. The ledger shows the chain.
- `conviction_links(conviction_id, entry_id, note)` — explicit links to later entries.
- `reviews(id, week_start, content, ai_draft, ...)` — weekly reviews; AI draft separate.
- `embeddings(id, owner_type, owner_id, chunk_index, model, text_hash, vector BLOB)`.
- `blocks_fts`, `convictions_fts` — FTS5 virtual tables maintained by triggers.
- `settings(key, value)` — JSON values.
- `migrations(version)` — forward-only migrations applied at open.

Every row carries a ULID-style id and timestamps so a future encrypted sync can
merge by (id, updated_at) without a redesign. Deletions are recorded in `tombstones`.

## 4. Privacy-sensitive decisions

| Decision | Choice |
|---|---|
| Network | No network access except the user-configured Ollama URL (default `http://localhost:11434`) and only when AI is enabled. No analytics, telemetry, fonts, CDNs. |
| AI provider | Ollama only. No cloud inference provider exists in the codebase. |
| Storage at rest | SQLite file in app data (Tauri) or IndexedDB (browser). **Not encrypted by the app**; relies on OS disk encryption. Stated plainly in Settings. |
| Backups | `.journalbackup` files are encrypted: PBKDF2-SHA256 (600k iterations) → AES-256-GCM. Only the backup is encrypted. Plain exports (Markdown/JSON) are not. |
| App lock | Optional passcode (PBKDF2 hash stored locally). Gates the UI only; it is not encryption. Biometrics are left to Tauri's platform plugins in a later phase. |
| Resurfacing | In-app only. No push notifications in v1. |
| Demo data | Never inserted automatically; offered on first launch and removable in one click. |

## 5. MVP vs later

**MVP (this build):** daily structured entry with optional sections, quick notes,
CodeMirror markdown editor with focus mode and autosave, timeline + calendar, FTS5
search with filters and date grouping, Conviction/Decision ledger with full version
history and later-related-entries, weekly review (manual, with local synthesis),
"on this day" resurfacing, export (Markdown zip + JSON), encrypted backup/restore,
delete-all, passcode lock, responsive layout, dark mode, demo data.

**Also included because the architecture made it cheap:** Ollama detection, local
embedding index with cosine similarity, semantic search, Ask My Journal with dated
citations, AI weekly draft, "you previously wrote something different" comparison.
All optional; all degrade to keyword behaviour.

**Merging two devices (`src/sync/merge.ts`):** a backup can be merged instead of
replacing, because every row has a unique sortable id and its own `updated_at` and
conviction history is append-only. Entries and blocks take the later write; a differing
block is only treated as a *conflict* when both sides edited it since the two journals
last agreed (a per-peer watermark kept in local settings, set by a replace-restore and by
each merge), and then the losing text is kept beside the winner as a labelled block
rather than discarded. Reviews keep the newer text and carry the other below it;
tombstones delete rows that have not been edited since. Device-local tables (settings,
embeddings, AI artifacts) are not merged.

**Later:** encrypted multi-device sync (see `src/sync/README.md`), handwritten page
attachments + local OCR, platform biometrics, native notifications for review dates.
