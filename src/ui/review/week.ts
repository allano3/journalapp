import type { Journal } from "../../storage/db";
import type { EntrySummary, ISODate, PrayerStatus } from "../../domain/types";
import type { ConvictionListItem } from "../../storage/repos/convictions";
import { markdownToPlain, truncate } from "../../domain/text";
import { weekRange } from "../../ai/weekly";

export interface WeekPrayer {
  entryId: string;
  blockId: string;
  date: ISODate;
  text: string;
  status: PrayerStatus;
}

export interface WeekAction {
  entryId: string;
  blockId: string;
  date: ISODate;
  text: string;
  done: boolean;
}

/** Everything the week holds, gathered without any AI: the raw material of a review. */
export interface WeekSynthesis {
  from: ISODate;
  to: ISODate;
  /** Oldest first. */
  entries: EntrySummary[];
  created: ConvictionListItem[];
  changed: ConvictionListItem[];
  /** Convictions whose review date falls inside the week. */
  due: ConvictionListItem[];
  prayers: WeekPrayer[];
  actions: WeekAction[];
}

export const PRAYER_STATUS_LABELS: Record<PrayerStatus, string> = {
  ongoing: "ongoing",
  resolved: "resolved",
  answered: "answered",
  no_longer_relevant: "no longer relevant",
};

export function collectWeek(j: Journal, weekStart: ISODate): WeekSynthesis {
  const { from, to, fromTs, toTs } = weekRange(weekStart);
  const entries = j.entries.list({ from, to }).reverse();
  // "Recorded this week" shows the statement as it was first written, not the later revision.
  const created = j.convictions.createdBetween(fromTs, toTs).map((c) => {
    const original = j.convictions.get(c.id)?.versions[0];
    return original ? { ...c, statement: original.statement, status: original.status, confidence: original.confidence } : c;
  });
  const changed = j.convictions.changedBetween(fromTs, toTs).filter((c) => !created.some((x) => x.id === c.id));
  const due = j.convictions.list().filter((c) => c.reviewDate !== null && c.reviewDate >= from && c.reviewDate <= to);

  const prayers: WeekPrayer[] = [];
  const actions: WeekAction[] = [];
  for (const summary of entries) {
    const entry = j.entries.get(summary.id);
    if (!entry) continue;
    for (const b of entry.blocks) {
      if (b.type === "prayer") {
        const items = Array.isArray(b.metadata.prayerItems) ? b.metadata.prayerItems : [];
        const seen = new Set<string>();
        for (const line of b.content.split("\n")) {
          const m = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
          if (!m) continue;
          const text = markdownToPlain(m[1]).trim();
          if (text.length === 0 || seen.has(text)) continue;
          seen.add(text);
          prayers.push({ entryId: entry.id, blockId: b.id, date: entry.entryDate, text, status: items.find((p) => p.text.trim() === text)?.status ?? "ongoing" });
        }
        for (const p of items) {
          const text = p.text.trim();
          if (text.length === 0 || seen.has(text)) continue;
          seen.add(text);
          prayers.push({ entryId: entry.id, blockId: b.id, date: entry.entryDate, text, status: p.status });
        }
      } else if (b.type === "action") {
        const named = typeof b.metadata.action === "string" ? b.metadata.action.trim() : "";
        const plain = markdownToPlain(b.content).replace(/\s+/g, " ").trim();
        const text = named.length > 0 ? (plain.length > 0 && plain !== named ? `${named} — ${truncate(plain, 160)}` : named) : truncate(plain, 200);
        if (text.length === 0) continue;
        actions.push({ entryId: entry.id, blockId: b.id, date: entry.entryDate, text, done: b.metadata.done === true });
      }
    }
  }
  return { from, to, entries, created, changed, due, prayers, actions };
}
