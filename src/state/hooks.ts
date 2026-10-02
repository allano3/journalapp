import { useCallback, useEffect, useRef, useState } from "react";
import type { Journal } from "../storage/db";
import { journal } from "../storage/db";
import type { Settings } from "../domain/types";
import { changes, type ChangeTopic } from "./events";

/**
 * Run a synchronous repository query and re-run it whenever one of `topics` changes.
 * `deps` are ordinary React deps (ids, dates, filters).
 */
export function useQuery<T>(fn: (j: Journal) => T, deps: unknown[], topics: ChangeTopic[]): T {
  const j = journal();
  const [, force] = useState(0);
  const ref = useRef<T | undefined>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const key = JSON.stringify(deps);
  const lastKey = useRef<string | null>(null);
  if (lastKey.current !== key) {
    lastKey.current = key;
    ref.current = fn(j);
  }
  useEffect(() => {
    return changes.subscribe((t) => {
      if (!topics.includes(t)) return;
      ref.current = fnRef.current(j);
      force((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j, topics.join(",")]);
  return ref.current as T;
}

/** Same as useQuery for async loaders; `null` while loading. */
export function useAsyncQuery<T>(fn: (j: Journal) => Promise<T>, deps: unknown[], topics: ChangeTopic[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const j = journal();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fnRef
      .current(j)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [j, key, tick]);
  useEffect(() => {
    return changes.subscribe((t) => {
      if (topics.includes(t)) setTick((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.join(",")]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useQuery((j) => j.settings.get(), [], ["settings"]);
  const update = useCallback((patch: Partial<Settings>) => {
    journal().settings.update(patch);
  }, []);
  return [settings, update];
}

/** Debounced callback that always invokes the latest function. */
export function useDebounced<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  return useCallback(
    (...args: A) => {
      clearTimeout(timer.current ?? undefined);
      timer.current = setTimeout(() => ref.current(...args), ms);
    },
    [ms],
  );
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}
