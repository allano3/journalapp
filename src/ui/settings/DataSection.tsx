import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { journal } from "../../storage/db";
import { useQuery } from "../../state/hooks";
import { todayISO } from "../../domain/dates";
import { downloadBytes, exportJson, exportMarkdownZip } from "../../sync/export";
import { BACKUP_EXTENSION, createEncryptedBackup, importJson, isJournalEmpty, restoreEncryptedBackup, restoreSqliteFile } from "../../sync/backup";
import { hasDemoData, removeDemoData, seedDemoData } from "../../demo/seed";
import { Sheet } from "../components/Sheet";

const MIN_PASSPHRASE = 8;

type Dialog = "backup" | "restore" | "import" | "sqlite" | "delete" | null;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function FilePick({ accept, onFile, children }: { accept: string; onFile: (f: File) => void; children: ReactNode }) {
  return (
    <label className="btn file-pick">
      {children}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function BackupSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pass.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (pass !== confirm) return setError("The two passphrases do not match.");
    setBusy(true);
    try {
      const { name, bytes } = await createEncryptedBackup(journal(), pass);
      const saved = await downloadBytes(name, bytes, "application/octet-stream");
      onDone(saved ? `Backup written: ${name} (${Math.round(bytes.length / 1024)} KB).` : "Backup cancelled.");
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Encrypted backup" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">
          The whole journal database is encrypted with this passphrase (AES-256-GCM, key from PBKDF2-SHA256). There is no way to recover
          a backup without it.
        </p>
        <input className="input" type="password" autoComplete="new-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        <input className="input" type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <div className="small settings-error">{error}</div>}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Encrypting…" : "Create backup"}
          </button>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function RestoreSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a backup file first.");
    setBusy(true);
    try {
      await restoreEncryptedBackup(journal(), new Uint8Array(await file.arrayBuffer()), pass);
      onDone(`Restored from ${file.name}.`);
      onClose();
      navigate("/");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title="Restore backup" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">
          Restoring replaces everything currently in this journal with the contents of the backup. This cannot be undone; export or back up
          first if the current writing matters.
        </p>
        <div className="row">
          <FilePick accept={BACKUP_EXTENSION} onFile={setFile}>
            Choose file
          </FilePick>
          <span className="small muted">{file ? file.name : "No file chosen"}</span>
        </div>
        <input className="input" type="password" autoComplete="off" placeholder="Backup passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {error && <div className="small settings-error">{error}</div>}
        <div className="row">
          <button className="btn btn-danger" type="submit" disabled={busy || !file || pass.length === 0}>
            {busy ? "Restoring…" : "Replace journal with backup"}
          </button>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function ReplaceFileSheet({
  title,
  intro,
  accept,
  onClose,
  onDone,
  run,
}: {
  title: string;
  intro: string;
  accept: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  run: (file: File) => Promise<string>;
}) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file first.");
    setBusy(true);
    try {
      onDone(await run(file));
      onClose();
      navigate("/");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">{intro}</p>
        <div className="row">
          <FilePick accept={accept} onFile={setFile}>
            Choose file
          </FilePick>
          <span className="small muted">{file ? file.name : "No file chosen"}</span>
        </div>
        {error && <div className="small settings-error">{error}</div>}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || !file}>
            {busy ? "Working…" : "Continue"}
          </button>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function DeleteSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (typed !== "DELETE") return;
    setBusy(true);
    await journal().eraseAll();
    onClose();
    navigate("/");
  }
  return (
    <Sheet title="Delete all journal data" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">
          Every entry, conviction, review, setting and search index on this device will be erased. There is no undo. Type DELETE to confirm.
        </p>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoFocus autoComplete="off" spellCheck={false} />
        <div className="row">
          <button className="btn btn-danger" type="submit" disabled={busy || typed !== "DELETE"}>
            {busy ? "Erasing…" : "Delete everything"}
          </button>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function DataSection() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [status, setStatus] = useState<string | null>(null);
  const demo = useQuery((j) => hasDemoData(j), [], ["entries", "settings"]);
  const empty = useQuery((j) => isJournalEmpty(j), [], ["entries", "convictions", "reviews"]);
  const close = () => setDialog(null);

  async function exportMarkdown() {
    try {
      const j = journal();
      const bytes = exportMarkdownZip(j);
      const saved = await downloadBytes(`journal-markdown-${todayISO()}.zip`, bytes, "application/zip");
      setStatus(saved ? `Exported ${j.entries.count()} entries and ${j.convictions.count()} convictions as Markdown.` : "Export cancelled.");
    } catch (e) {
      setStatus(`Export failed: ${errorText(e)}`);
    }
  }

  async function exportAsJson() {
    try {
      const data = exportJson(journal());
      const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
      const saved = await downloadBytes(`journal-${todayISO()}.json`, bytes, "application/json");
      setStatus(saved ? `Exported ${data.entries.length} entries, ${data.convictions.length} convictions and ${data.reviews.length} reviews as JSON.` : "Export cancelled.");
    } catch (e) {
      setStatus(`Export failed: ${errorText(e)}`);
    }
  }

  return (
    <section className="settings-section">
      <div className="label">Data</div>

      <div className="settings-group">
        <div className="settings-row">
          <span className="settings-row-name">
            Export
            <small className="muted">Plain files you can read anywhere, now or decades from now. Not encrypted.</small>
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={exportMarkdown}>
              Markdown (.zip)
            </button>
            <button type="button" className="btn btn-sm" onClick={exportAsJson}>
              JSON
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-name">
            Encrypted backup
            <small className="muted">The full database, including search index and settings, protected by a passphrase.</small>
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setDialog("backup")}>
              Create backup
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setDialog("restore")}>
              Restore backup
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-name">
            Import
            <small className="muted">
              {empty ? "Bring a JSON export or a plain .sqlite file into this empty journal." : "Importing JSON needs an empty journal; restore replaces everything."}
            </small>
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm btn-quiet" disabled={!empty} onClick={() => setDialog("import")}>
              Import JSON
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setDialog("sqlite")}>
              Restore .sqlite file
            </button>
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-name">
            Demo entries
            <small className="muted">{demo ? "Example entries tagged “demo” are in the journal." : "Add a few example entries to see how the journal reads."}</small>
          </span>
          {demo ? (
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              onClick={() => {
                removeDemoData(journal());
                setStatus("Demo entries removed.");
              }}
            >
              Remove demo entries
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              onClick={() => {
                seedDemoData(journal());
                setStatus("Demo entries added.");
              }}
            >
              Load demo entries
            </button>
          )}
        </div>
        <div className="settings-row">
          <span className="settings-row-name">
            Delete
            <small className="muted">Erase every entry, conviction and setting from this device.</small>
          </span>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setDialog("delete")}>
            Delete all journal data
          </button>
        </div>
      </div>

      {status && (
        <p className="small muted settings-status" role="status">
          {status}
        </p>
      )}

      {dialog === "backup" && <BackupSheet onClose={close} onDone={setStatus} />}
      {dialog === "restore" && <RestoreSheet onClose={close} onDone={setStatus} />}
      {dialog === "import" && (
        <ReplaceFileSheet
          title="Import JSON export"
          intro="Entries, convictions with their full version history, reviews and settings from a JSON export are added to this empty journal with their original dates and ids."
          accept=".json,application/json"
          onClose={close}
          onDone={setStatus}
          run={async (file) => {
            const n = await importJson(journal(), await file.text());
            return `Imported ${n.entries} entries, ${n.convictions} convictions and ${n.reviews} reviews.`;
          }}
        />
      )}
      {dialog === "sqlite" && (
        <ReplaceFileSheet
          title="Restore .sqlite file"
          intro="Replaces the current journal with a plain SQLite database file, for example one copied out of the app's data folder. This cannot be undone."
          accept=".sqlite,.db,.sqlite3"
          onClose={close}
          onDone={setStatus}
          run={async (file) => {
            await restoreSqliteFile(journal(), new Uint8Array(await file.arrayBuffer()));
            return `Restored from ${file.name}.`;
          }}
        />
      )}
      {dialog === "delete" && <DeleteSheet onClose={close} />}
    </section>
  );
}
