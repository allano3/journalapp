import type { Confidence } from "../../domain/types";
import "./convictions.css";

const LEVELS: readonly Confidence[] = [1, 2, 3, 4, 5];

/**
 * Confidence as five small dots. Read-only without `onChange`; with it, clicking a dot
 * sets the level and clicking the current level clears it.
 */
export function ConfidenceDots({ value, onChange, size = "sm" }: { value: number | null; onChange?: (v: Confidence | null) => void; size?: "sm" | "md" }) {
  const label = value === null ? "Confidence not set" : `Confidence ${value} of 5`;
  if (!onChange) {
    return (
      <span className={`cv-dots cv-dots-${size}`} role="img" aria-label={label} title={label}>
        {LEVELS.map((n) => (
          <span key={n} className={value !== null && n <= value ? "cv-dot on" : "cv-dot"} />
        ))}
      </span>
    );
  }
  return (
    <span className={`cv-dots cv-dots-${size}`} role="radiogroup" aria-label={label}>
      {LEVELS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          title={value === n ? "Click again to clear" : `${n} of 5`}
          className={value !== null && n <= value ? "cv-dot on" : "cv-dot"}
          onClick={() => onChange(value === n ? null : n)}
        />
      ))}
    </span>
  );
}
