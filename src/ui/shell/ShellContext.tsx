import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ShellState {
  aside: ReactNode | null;
  setAside: (node: ReactNode | null) => void;
  focus: boolean;
  setFocus: (on: boolean) => void;
}

export const ShellContext = createContext<ShellState>({
  aside: null,
  setAside: () => {},
  focus: false,
  setFocus: () => {},
});

export function ShellProvider({ children }: { children: ReactNode }) {
  const [aside, setAside] = useState<ReactNode | null>(null);
  const [focus, setFocus] = useState(false);
  return <ShellContext.Provider value={{ aside, setAside, focus, setFocus }}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  return useContext(ShellContext);
}

/**
 * Mount `node` in the contextual right sidebar while the calling page is mounted.
 * Pass `null` to leave the aside empty (the layout collapses it).
 */
export function useAside(node: ReactNode | null, deps: unknown[]): void {
  const { setAside } = useShell();
  useEffect(() => {
    setAside(node);
    return () => setAside(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
