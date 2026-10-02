import { useEffect, type ReactNode } from "react";
import { IconClose } from "../shell/icons";

/** Centered modal sheet. Escape or backdrop click closes. */
export function Sheet({ title, onClose, children, wide = false }: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" style={wide ? { maxWidth: "48rem" } : undefined}>
        <div className="row-between" style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem" }}>{title}</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
            <IconClose width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
