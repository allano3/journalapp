import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useSettings } from "../../state/hooks";
import { verifyPasscode } from "../../security/crypto";
import { isLocked, startAutoLock, subscribe, unlock } from "../../security/lock";
import "./lock.css";

export { lock as lockNow } from "../../security/lock";

function LockScreen({ record }: { record: { salt: string; hash: string; iterations: number } }) {
  const [settings] = useSettings();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // The shell (which normally owns theme attributes) is not mounted while locked.
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = settings.theme === "dark" || (settings.theme === "system" && mq.matches) ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || code.length === 0) return;
    setBusy(true);
    const ok = await verifyPasscode(code, record);
    setBusy(false);
    if (ok) {
      setCode("");
      setError(false);
      unlock();
    } else {
      setError(true);
      setCode("");
    }
  }

  return (
    <div className="lock-screen">
      <form className="lock-form" onSubmit={submit}>
        <h1 className="lock-brand">Journal</h1>
        <input
          className="input lock-input"
          type="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Passcode"
          placeholder="Passcode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || code.length === 0}>
          Unlock
        </button>
        <div className="lock-error" role="alert" aria-live="polite">
          {error ? "That passcode is not correct." : "\u00a0"}
        </div>
        <p className="lock-note">The passcode locks the app on this device. It does not encrypt the journal file.</p>
      </form>
    </div>
  );
}

/** Gate the whole UI behind the passcode when one is set and the session is locked. */
export function LockGate({ children }: { children: ReactNode }) {
  const [settings] = useSettings();
  const locked = useSyncExternalStore(subscribe, isLocked);
  const enabled = settings.lock !== null;

  useEffect(() => {
    if (!enabled) return;
    return startAutoLock();
  }, [enabled]);

  if (!enabled) return <>{children}</>;
  if (locked) return <LockScreen record={settings.lock!} />;
  return <>{children}</>;
}
