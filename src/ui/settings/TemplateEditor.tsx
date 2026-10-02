import type { TemplateSection } from "../../domain/types";
import { DEFAULT_TEMPLATE } from "../../domain/template";
import { useSettings } from "../../state/hooks";

/** Order, enablement, label and prompt of each daily section. Every change saves. */
export function TemplateEditor() {
  const [settings, update] = useSettings();
  const template = settings.template;

  const save = (next: TemplateSection[]) => update({ template: next });
  const patch = (index: number, p: Partial<TemplateSection>) => save(template.map((s, i) => (i === index ? { ...s, ...p } : s)));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= template.length) return;
    const next = template.slice();
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  return (
    <section className="settings-section">
      <div className="row-between">
        <div className="label">Daily template</div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => save(DEFAULT_TEMPLATE.map((s) => ({ ...s })))}>
          Reset to default
        </button>
      </div>
      <p className="small muted">Every section is optional while writing. Untick a section to leave it out of new days.</p>
      <ol className="template-list">
        {template.map((s, i) => (
          <li key={s.key} className={`template-item${s.enabled ? "" : " template-item-off"}`}>
            <label className="template-check">
              <input type="checkbox" checked={s.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} aria-label={`Include ${s.label}`} />
            </label>
            <div className="template-fields">
              <input
                className="input input-quiet template-label"
                value={s.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                aria-label="Section label"
                placeholder="Section label"
              />
              <input
                className="input input-quiet template-prompt"
                value={s.prompt}
                onChange={(e) => patch(i, { prompt: e.target.value })}
                aria-label="Prompt"
                placeholder="Prompt shown while the section is empty"
              />
            </div>
            <div className="template-move">
              <button type="button" className="btn btn-quiet btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.label} up`}>
                ↑
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={i === template.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${s.label} down`}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReflectionSection() {
  const [settings, update] = useSettings();
  return (
    <section className="settings-section">
      <div className="label">Reflection</div>
      <label className="settings-check">
        <input type="checkbox" checked={settings.resurfacingEnabled} onChange={(e) => update({ resurfacingEnabled: e.target.checked })} />
        <span>
          Resurface older entries
          <small className="muted">Show what you wrote on this day in earlier years, and convictions due for review.</small>
        </span>
      </label>
    </section>
  );
}
