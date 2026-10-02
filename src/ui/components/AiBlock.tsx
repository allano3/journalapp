import type { ReactNode } from "react";

/**
 * Every piece of AI-generated text in the app renders inside this wrapper so it can
 * never be mistaken for the user's own writing.
 */
export function AiBlock({ children, label = "Local AI", model, actions }: { children: ReactNode; label?: string; model?: string | null; actions?: ReactNode }) {
  return (
    <div className="ai-block">
      <div className="row-between">
        <div className="ai-tag">
          {label}
          {model ? <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.8 }}>· {model}</span> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
