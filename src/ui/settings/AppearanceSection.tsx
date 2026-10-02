import type { JournalFont, Settings, Theme } from "../../domain/types";
import { useSettings } from "../../state/hooks";
import { Segmented } from "./Segmented";

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const FONTS: { value: JournalFont; label: string }[] = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
];
const SIZES: { value: Settings["fontSize"]; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export function AppearanceSection() {
  const [settings, update] = useSettings();
  return (
    <section className="settings-section">
      <div className="label">Appearance</div>
      <div className="settings-row">
        <span className="settings-row-name">Theme</span>
        <Segmented label="Theme" value={settings.theme} options={THEMES} onChange={(theme) => update({ theme })} />
      </div>
      <div className="settings-row">
        <span className="settings-row-name">Journal font</span>
        <Segmented label="Journal font" value={settings.journalFont} options={FONTS} onChange={(journalFont) => update({ journalFont })} />
      </div>
      <div className="settings-row">
        <span className="settings-row-name">Text size</span>
        <Segmented label="Text size" value={settings.fontSize} options={SIZES} onChange={(fontSize) => update({ fontSize })} />
      </div>
      <p className="prose settings-sample" aria-hidden="true">
        The quick brown fox jumps over the lazy dog, and the morning is quiet.
      </p>
    </section>
  );
}
