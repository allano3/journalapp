import { journal } from "../../storage/db";
import { useSettings } from "../../state/hooks";

/** The visible privacy indicator from the brief: plain facts, no claims. */
export function PrivacySection() {
  const [settings] = useSettings();
  const ai = settings.ai;
  return (
    <section className="settings-section">
      <div className="label">Privacy</div>
      <dl className="privacy-facts">
        <dt>Data location</dt>
        <dd>{journal().store.describe()}</dd>
        <dt>AI processing</dt>
        <dd>{ai.enabled ? `Local (Ollama at ${ai.ollamaUrl})` : "Disabled"}</dd>
        <dt>Sync</dt>
        <dd>Disabled</dd>
      </dl>
      <p className="small muted privacy-note">
        The journal database on this device is not encrypted by this app; it relies on your operating system's disk encryption and
        user account. Encrypted backups are AES-256-GCM with a key derived from your passphrase by PBKDF2-SHA256 (600,000 iterations);
        without the passphrase they cannot be opened, and there is no recovery. Markdown and JSON exports are plain text. The app lock is
        a gate on this device, not encryption. Nothing is sent anywhere; the only network connection the app can make is to the Ollama
        address above, and only when AI is enabled.
      </p>
    </section>
  );
}
