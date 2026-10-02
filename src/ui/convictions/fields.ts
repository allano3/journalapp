import type { ConvictionKind, ConvictionStatus, ConvictionVersion, ISODate, ISOTimestamp } from "../../domain/types";
import { formatMedium, toISODate } from "../../domain/dates";
import type { VersionInput } from "../../storage/repos/convictions";

export const KIND_LABELS: Record<ConvictionKind, string> = {
  conviction: "Conviction",
  decision: "Decision",
};

export const STATUS_LABELS: Record<ConvictionStatus, string> = {
  active: "Active",
  reconsidering: "Reconsidering",
  superseded: "Superseded",
  completed: "Completed",
  archived: "Archived",
};

/** The fields a version carries, in the order the record reads top to bottom. */
export type FieldKey = Exclude<keyof VersionInput, "changeNote">;

export const FIELD_ORDER: readonly FieldKey[] = [
  "statement",
  "context",
  "reasoning",
  "confidence",
  "evidence",
  "uncertainties",
  "changeTriggers",
  "costOfIgnoring",
  "nextAction",
  "ifThen",
  "reviewDate",
  "status",
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  statement: "Statement",
  context: "Context",
  reasoning: "Reasoning",
  confidence: "Confidence",
  evidence: "Evidence",
  uncertainties: "Uncertainties",
  changeTriggers: "What would change my mind",
  costOfIgnoring: "Cost of ignoring this",
  nextAction: "Next action",
  ifThen: "Implementation intention",
  reviewDate: "Review date",
  status: "Status",
};

/** Prompt lines from the brief; shown as the understated label above each field in the form. */
export const FIELD_PROMPTS: Record<FieldKey, string> = {
  statement: "What do I currently believe or intend to do?",
  context: "What led me here?",
  reasoning: "Why does this seem right?",
  confidence: "Confidence",
  evidence: "Evidence or observations supporting it",
  uncertainties: "Uncertainties",
  changeTriggers: "What would change my mind?",
  costOfIgnoring: "Cost of ignoring this",
  nextAction: "Next action",
  ifThen: "Implementation intention",
  reviewDate: "Review date",
  status: "Status",
};

/** Local calendar date of a UTC timestamp, for the date formatters. */
export function tsDate(ts: ISOTimestamp): ISODate {
  return toISODate(new Date(ts));
}

/** Human-readable value of one field, "" when the field is empty. */
export function fieldText(v: VersionInput | ConvictionVersion, key: FieldKey): string {
  switch (key) {
    case "confidence":
      return v.confidence === null ? "" : `${v.confidence} of 5`;
    case "ifThen":
      if (!v.ifThen || (!v.ifThen.condition.trim() && !v.ifThen.action.trim())) return "";
      return `If ${v.ifThen.condition.trim() || "…"} happens, I will ${v.ifThen.action.trim() || "…"}`;
    case "reviewDate":
      return v.reviewDate ? formatMedium(v.reviewDate) : "";
    case "status":
      return STATUS_LABELS[v.status];
    default:
      return v[key].trim();
  }
}

export interface FieldChange {
  key: FieldKey;
  before: string;
  after: string;
}

/** Fields whose rendered value differs between two versions, in record order. */
export function diffVersions(prev: ConvictionVersion, next: ConvictionVersion): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of FIELD_ORDER) {
    const before = fieldText(prev, key);
    const after = fieldText(next, key);
    if (before !== after) out.push({ key, before, after });
  }
  return out;
}

/**
 * First body paragraph of a markdown block as plain text (used to prefill a statement
 * from a journal block). Headings are skipped: the sentence matters, not the title.
 */
export function firstParagraph(md: string): string {
  const para = md
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length > 0);
  if (!para) return "";
  return para
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}
