import type { ISODate, ISOTimestamp } from "./types";

export function nowIso(): ISOTimestamp {
  return new Date().toISOString();
}

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** Parse YYYY-MM-DD as a local Date at midnight. */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(s: ISODate, months: number): ISODate {
  const d = fromISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** Monday of the week containing `s`. */
export function weekStart(s: ISODate): ISODate {
  const d = fromISODate(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

const LONG = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const MEDIUM = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });
const SHORT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatLong(s: ISODate): string {
  return LONG.format(fromISODate(s));
}
export function formatMedium(s: ISODate): string {
  return MEDIUM.format(fromISODate(s));
}
export function formatShort(s: ISODate): string {
  return SHORT.format(fromISODate(s));
}
export function formatMonthYear(s: ISODate | string): string {
  const [y, m] = s.split("-").map(Number);
  return MONTH_YEAR.format(new Date(y, m - 1, 1));
}
export function formatTime(ts: ISOTimestamp): string {
  return TIME.format(new Date(ts));
}

/** "today", "yesterday", "3 days ago", "2 months ago", "1 year ago" */
export function relativeDays(s: ISODate, today: ISODate = todayISO()): string {
  const n = daysBetween(s, today);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n === -1) return "tomorrow";
  if (n < 0) return `in ${-n} days`;
  if (n < 30) return `${n} days ago`;
  const months = Math.round(n / 30.4);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(n / 365);
  const rem = Math.round((n - years * 365) / 30.4);
  if (rem === 0 || years >= 3) return `${years} year${years === 1 ? "" : "s"} ago`;
  return `${years} year${years === 1 ? "" : "s"}, ${rem} month${rem === 1 ? "" : "s"} ago`;
}
