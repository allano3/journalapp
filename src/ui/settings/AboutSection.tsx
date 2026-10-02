import { useQuery } from "../../state/hooks";
import { SCHEMA_VERSION } from "../../storage/migrations";

const APP_VERSION = "0.1.0";

export function AboutSection() {
  const counts = useQuery((j) => ({ entries: j.entries.count(), convictions: j.convictions.count() }), [], ["entries", "convictions"]);
  return (
    <section className="settings-section">
      <div className="label">About</div>
      <dl className="privacy-facts">
        <dt>Version</dt>
        <dd>
          {APP_VERSION} · schema {SCHEMA_VERSION}
        </dd>
        <dt>In this journal</dt>
        <dd>
          {counts.entries} {counts.entries === 1 ? "entry" : "entries"}, {counts.convictions} {counts.convictions === 1 ? "conviction" : "convictions"}
        </dd>
      </dl>
      <p className="small faint">No analytics, no telemetry, no accounts.</p>
    </section>
  );
}
