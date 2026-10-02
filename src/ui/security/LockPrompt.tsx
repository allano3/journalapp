import { useState } from "react";
import { Link } from "react-router-dom";
import { journal } from "../../storage/db";
import { useQuery, useSettings } from "../../state/hooks";
import { Sheet } from "../components/Sheet";
import { PasscodeForm } from "../settings/LockSection";

const FLAG = "lockPromptDismissed";

/**
 * A quiet, skippable suggestion to set an app passcode. Shown on Today until a passcode
 * exists or the user dismisses it; the same controls stay available in Settings.
 */
export function LockPrompt() {
  const [settings] = useSettings();
  const dismissed = useQuery((j) => j.settings.getFlag<boolean>(FLAG) === true, [], ["settings"]);
  const [open, setOpen] = useState(false);
  if (settings.lock !== null || dismissed) return null;

  const dismiss = () => journal().settings.setFlag(FLAG, true);

  return (
    <section className="today-section">
      <h2 className="label">Privacy</h2>
      <p className="muted small">
        This journal opens without a passcode. You can require one each time the app opens or after it sits idle. It locks the
        screen on this device; it does not encrypt the file. You can change this later in <Link to="/settings">Settings</Link>.
      </p>
      <div className="row" style={{ marginTop: "0.5rem" }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Set a passcode
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={dismiss}>
          Not now
        </button>
      </div>
      {open && (
        <Sheet title="Set a passcode" onClose={() => setOpen(false)}>
          <PasscodeForm requireCurrent={null} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </section>
  );
}
