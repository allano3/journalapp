import { journal } from "../storage/db";
import { changes } from "../state/events";

/**
 * In-memory session lock. The passcode record lives in settings; whether the current
 * session is locked lives here and is never persisted. A fresh process starts locked;
 * `LockGate` ignores this state entirely when no passcode is set.
 */

export const DEFAULT_LOCK_AFTER_MINUTES = 10;
export const LOCK_AFTER_CHOICES: readonly number[] = [1, 5, 10, 30, 0]; // 0 = never

let locked = true;
const listeners = new Set<() => void>();
let lastActivity = Date.now();

function notify(): void {
  for (const l of listeners) l();
}

export function isLocked(): boolean {
  return locked;
}

export function lock(): void {
  if (locked) return;
  locked = true;
  notify();
}

export function unlock(): void {
  lastActivity = Date.now();
  if (!locked) return;
  locked = false;
  notify();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Minutes of inactivity before locking; 0 means never. */
export function getLockAfterMinutes(): number {
  const v = journal().settings.getFlag<number>("lockAfterMinutes");
  return typeof v === "number" && v >= 0 ? v : DEFAULT_LOCK_AFTER_MINUTES;
}

export function setLockAfterMinutes(minutes: number): void {
  journal().settings.setFlag("lockAfterMinutes", minutes);
  changes.emit("settings");
}

export function getLockOnHide(): boolean {
  return journal().settings.getFlag<boolean>("lockOnHide") === true;
}

export function setLockOnHide(on: boolean): void {
  journal().settings.setFlag("lockOnHide", on);
  changes.emit("settings");
}

const ACTIVITY_EVENTS: readonly (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
const CHECK_INTERVAL_MS = 15_000;

/**
 * Watch user activity and page visibility; lock when the configured idle time elapses
 * or the app is hidden (if enabled). Returns a disposer. Call only while a passcode is set.
 */
export function startAutoLock(): () => void {
  lastActivity = Date.now();
  const touch = () => {
    lastActivity = Date.now();
  };
  const check = () => {
    if (locked) return;
    const minutes = getLockAfterMinutes();
    if (minutes > 0 && Date.now() - lastActivity >= minutes * 60_000) lock();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (getLockOnHide()) lock();
    } else {
      // Returning after a long absence: apply the idle rule immediately rather than
      // showing content until the next interval tick.
      check();
    }
  };
  for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, touch, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  return () => {
    for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, touch);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(timer);
  };
}
