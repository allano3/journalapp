import { useState, type FormEvent } from "react";
import { useQuery, useSettings } from "../../state/hooks";
import { hashPasscode, verifyPasscode } from "../../security/crypto";
import { LOCK_AFTER_CHOICES, getLockAfterMinutes, getLockOnHide, lock, setLockAfterMinutes, setLockOnHide, unlock } from "../../security/lock";
import { Sheet } from "../components/Sheet";

const MIN_PASSCODE = 4;

export function PasscodeForm({
  requireCurrent,
  onDone,
}: {
  requireCurrent: { salt: string; hash: string; iterations: number } | null;
  onDone: () => void;
}) {
  const [, update] = useSettings();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSCODE) return setError(`Use at least ${MIN_PASSCODE} characters.`);
    if (next !== confirm) return setError("The two passcodes do not match.");
    setBusy(true);
    if (requireCurrent && !(await verifyPasscode(current, requireCurrent))) {
      setBusy(false);
      return setError("The current passcode is not correct.");
    }
    update({ lock: await hashPasscode(next) });
    unlock();
    setBusy(false);
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      {requireCurrent && (
        <input className="input" type="password" autoComplete="current-password" placeholder="Current passcode" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
      )}
      <input className="input" type="password" autoComplete="new-password" placeholder="New passcode" value={next} onChange={(e) => setNext(e.target.value)} autoFocus={!requireCurrent} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Repeat new passcode" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <div className="small settings-error">{error}</div>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {requireCurrent ? "Change passcode" : "Set passcode"}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveSheet({ record, onClose }: { record: { salt: string; hash: string; iterations: number }; onClose: () => void }) {
  const [, update] = useSettings();
  const [current, setCurrent] = useState("");
  const [error, setError] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(await verifyPasscode(current, record))) return setError(true);
    update({ lock: null });
    onClose();
  }
  return (
    <Sheet title="Remove passcode" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted small">The app will open without asking for a passcode on this device.</p>
        <input className="input" type="password" autoComplete="current-password" placeholder="Current passcode" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        {error && <div className="small settings-error">The passcode is not correct.</div>}
        <div className="row">
          <button className="btn btn-danger" type="submit">
            Remove
          </button>
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function LockSection() {
  const [settings] = useSettings();
  const lockAfter = useQuery(() => getLockAfterMinutes(), [], ["settings"]);
  const lockOnHide = useQuery(() => getLockOnHide(), [], ["settings"]);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const record = settings.lock;

  return (
    <section className="settings-section">
      <div className="label">App lock</div>
      {record === null && !editing && (
        <div className="settings-row">
          <span className="settings-row-name muted">No passcode. The app opens directly.</span>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            Set a passcode
          </button>
        </div>
      )}
      {record !== null && !editing && (
        <div className="settings-row">
          <span className="settings-row-name">A passcode is set.</span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Change
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRemoving(true)}>
              Remove
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => lock()}>
              Lock now
            </button>
          </div>
        </div>
      )}
      {editing && <PasscodeForm requireCurrent={record} onDone={() => setEditing(false)} />}
      {removing && record !== null && <RemoveSheet record={record} onClose={() => setRemoving(false)} />}

      {record !== null && (
        <>
          <div className="settings-row">
            <label className="settings-row-name" htmlFor="lock-after">
              Lock after inactivity
            </label>
            <select id="lock-after" className="select settings-select" value={lockAfter} onChange={(e) => setLockAfterMinutes(Number(e.target.value))}>
              {LOCK_AFTER_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "Never" : m === 1 ? "1 minute" : `${m} minutes`}
                </option>
              ))}
            </select>
          </div>
          <label className="settings-check">
            <input type="checkbox" checked={lockOnHide} onChange={(e) => setLockOnHide(e.target.checked)} />
            <span>Lock when the app is hidden or switched away from</span>
          </label>
        </>
      )}
      <p className="small faint">The passcode locks the app on this device. It does not encrypt the journal file.</p>
    </section>
  );
}
