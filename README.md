# Journal

A private, local-first journal for one person. It is built to preserve a thought
process well enough that, years later, you can see what you believed, why, what you
intended, and whether your thinking changed. Daily entries follow an optional
template, quick notes bypass it, convictions and decisions are kept in an
append-only ledger with full version history, and weekly reviews pull the week back
together. Search is full-text (SQLite FTS5) and, if you choose to run a local model,
semantic. The interface is calm and editorial: the writing dominates, and nothing is
gamified.

## Privacy

- Everything stays on your device. There is no account, no server, no telemetry, no
  analytics, no external fonts or CDNs.
- The only network destination in the codebase is the Ollama URL you configure
  (default `http://localhost:11434`), and it is contacted only when AI is enabled.
  Every AI feature is optional; the app works fully with AI off or Ollama stopped.
- AI output is stored separately from your writing and is always marked as such. It
  never edits your text.
- The database is **not** encrypted by the app; it relies on your operating system's
  disk encryption. Encrypted `.journalbackup` files (PBKDF2-SHA256, AES-256-GCM)
  are the way to move or archive the journal safely. An optional passcode lock gates
  the UI but is not encryption.

## Run in the browser

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:1420>. The whole app, including SQLite, runs in the page.

## Install on a phone (PWA)

The production build is an installable, offline-capable web app: `npm run build`
emits a manifest and a service worker that precaches the app shell and the SQLite
engine, so once installed it opens with no network at all.

The repository deploys itself to GitHub Pages on every push to `main`
(`.github/workflows/pages.yml`, which builds with `VITE_BASE=/journalapp/`):

**https://allano3.github.io/journalapp/**

Open that URL on the phone and choose **Add to Home Screen** (iOS Safari: Share →
Add to Home Screen; Android Chrome: menu → Install app). Only the app's own files are
served from GitHub; journal text never goes there. To host elsewhere, serve `dist/`
from any HTTPS origin and set `VITE_BASE` to the path it lives under.

Storage in this mode is the same IndexedDB backend as the browser (see the table
below). Three things to know:

- Storage is per origin **and** per container. On iOS the home-screen app has its own
  IndexedDB separate from the Safari tab; on Android, Chrome and the installed app share
  one profile. To move writing between containers use **Encrypted backup → Restore**.
- The app asks the browser for persistent storage on first launch
  (`navigator.storage.persist()`), which stops the OS evicting the database under storage
  pressure. Installed apps normally get it; Settings → Privacy reports whether it was
  granted. Treat the browser as a device you back up, not as an archive.
- The service worker is only registered in a real browser; the Tauri shell serves files
  itself and skips it.

To test locally without HTTPS: `npm run preview` serves `dist/` on localhost, which
browsers treat as a secure origin.

## Run as a desktop app

The desktop shell is Tauri 2 (`src-tauri/`). It needs a Rust toolchain
(<https://rustup.rs>) and the platform prerequisites listed at
<https://v2.tauri.app/start/prerequisites/>.

```sh
npm install
npm run tauri dev      # development window, hot reload
npm run tauri build    # installable bundle in src-tauri/target/release/bundle
```

The shell contains no custom native code: `src-tauri/src/lib.rs` opens one window
and registers the file-system plugin. `src-tauri/capabilities/default.json` limits
that plugin to the application data folder, so the webview cannot touch any other
path.

Before packaging a release, generate the platform icon set from the 512x512 source:

```sh
npx tauri icon src-tauri/icons/icon.png
```

This writes the `.icns`, `.ico` and store-size PNGs that `tauri build` expects;
then add `icons/icon.icns` and `icons/icon.ico` to `bundle.icon` in
`src-tauri/tauri.conf.json`. The repository ships only the PNGs needed for
development.

### Mobile

The same codebase targets Android and iOS. Initialise a platform project once, then
develop or build with the matching subcommand:

```sh
npm run tauri android init && npm run tauri android dev
npm run tauri ios init     && npm run tauri ios dev
```

## Where your data lives

The database is a single SQLite file named `journal.sqlite`. Only its persistence
differs by platform; the storage layer picks the backend at startup
(`src/storage/blobstore.tauri.ts` detects the Tauri runtime, otherwise
`src/storage/blobstore.web.ts` is used).

| Mode | Location |
|---|---|
| Browser / installed PWA | IndexedDB of that browser profile (or the home-screen app's own container on iOS), database `journal-store` (clearing site data deletes it) |
| Desktop, macOS | `~/Library/Application Support/com.journal.app/journal.sqlite` |
| Desktop, Linux | `~/.local/share/com.journal.app/journal.sqlite` |
| Desktop, Windows | `%APPDATA%\com.journal.app\journal.sqlite` |
| Android / iOS | the app's private data directory |

Desktop writes go to a temporary file that is then renamed over the previous one,
so an interrupted save never corrupts the journal.

## Export and backup

Open **Settings**.

- **Export** produces a zip of Markdown files and a JSON file with every table.
  These are plain text; keep them somewhere you trust.
- **Backup** produces an encrypted `.journalbackup` file protected by a passphrase
  you choose. Restore it from the same section on any device. Nobody can recover a
  lost passphrase.
- Because the journal is one SQLite file, copying the file listed above while the
  app is closed is also a complete backup.

## Optional local AI with Ollama

Install Ollama from <https://ollama.com>, then pull an embedding model and a chat
model:

```sh
ollama pull nomic-embed-text
ollama pull llama3.1
```

Start Ollama, then in **Settings** enable AI, confirm the URL
(`http://localhost:11434`), pick the two models and run the connection test. The
index is built locally from your entries. With AI enabled you get semantic search,
"Ask my journal" answers that cite entries by date, a draft for the weekly review
and comparisons between a conviction and later writing. Turn it off at any time;
nothing else depends on it.
