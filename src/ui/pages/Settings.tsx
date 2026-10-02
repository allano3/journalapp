import { AppearanceSection } from "../settings/AppearanceSection";
import { ReflectionSection, TemplateEditor } from "../settings/TemplateEditor";
import { PrivacySection } from "../settings/PrivacySection";
import { LockSection } from "../settings/LockSection";
import { DataSection } from "../settings/DataSection";
import { AboutSection } from "../settings/AboutSection";
import { AiSettingsSection } from "../ai/AiSettingsSection";
import "../settings/settings.css";

export function SettingsPage() {
  return (
    <div className="page settings-page">
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>
      <AppearanceSection />
      <TemplateEditor />
      <ReflectionSection />
      <section className="settings-section">
        <div className="label">Local AI</div>
        <AiSettingsSection />
      </section>
      <PrivacySection />
      <LockSection />
      <DataSection />
      <AboutSection />
    </div>
  );
}
