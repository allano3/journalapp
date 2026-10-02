/**
 * Core domain types. Pure data; no UI, no storage imports.
 * Dates: `entry_date` and `review_date` are ISO calendar dates (YYYY-MM-DD).
 * Timestamps (`created_at`, `updated_at`) are ISO 8601 UTC strings.
 */

export type ISODate = string; // YYYY-MM-DD
export type ISOTimestamp = string; // 2026-01-14T09:12:00.000Z

export type EntryKind = "daily" | "note";

export type BlockType =
  | "freewrite"
  | "reflection"
  | "sleep"
  | "dream"
  | "gratitude"
  | "reading"
  | "prayer"
  | "conviction"
  | "decision"
  | "action"
  | "generic";

export const BLOCK_TYPES: readonly BlockType[] = [
  "freewrite",
  "reflection",
  "sleep",
  "dream",
  "gratitude",
  "reading",
  "prayer",
  "conviction",
  "decision",
  "action",
  "generic",
];

/** Structured extras stored alongside a block's markdown. All optional. */
export interface BlockMetadata {
  /** Template section this block was created from (see domain/template.ts). */
  section?: string;
  /** sleep: 1–5 subjective quality */
  sleepQuality?: number;
  /** sleep: approximate hours */
  sleepHours?: number;
  /** reading */
  source?: string;
  reference?: string;
  /** prayer item states keyed by the item's line text hash or index */
  prayerItems?: PrayerItem[];
  /** action: done flag */
  done?: boolean;
  [key: string]: unknown;
}

export type PrayerStatus = "ongoing" | "resolved" | "answered" | "no_longer_relevant";

export interface PrayerItem {
  text: string;
  status: PrayerStatus;
}

export interface Block {
  id: string;
  entryId: string;
  type: BlockType;
  /** Markdown. The user's text. Never modified by AI code. */
  content: string;
  position: number;
  metadata: BlockMetadata;
}

export interface Entry {
  id: string;
  entryDate: ISODate;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  title: string;
  kind: EntryKind;
  favorite: boolean;
  sourceDevice: string;
  tags: string[];
  blocks: Block[];
}

/** Lightweight entry row for lists (no blocks). */
export interface EntrySummary {
  id: string;
  entryDate: ISODate;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  title: string;
  kind: EntryKind;
  favorite: boolean;
  tags: string[];
  /** First ~200 chars of the first non-empty block, plain text. */
  preview: string;
  wordCount: number;
}

export type ConvictionKind = "conviction" | "decision";

export type ConvictionStatus =
  | "active"
  | "reconsidering"
  | "superseded"
  | "completed"
  | "archived";

export const CONVICTION_STATUSES: readonly ConvictionStatus[] = [
  "active",
  "reconsidering",
  "superseded",
  "completed",
  "archived",
];

export type Confidence = 1 | 2 | 3 | 4 | 5;

/** Append-only. A new version is written for every change. */
export interface ConvictionVersion {
  id: string;
  convictionId: string;
  versionNo: number;
  createdAt: ISOTimestamp;
  statement: string;
  context: string;
  reasoning: string;
  confidence: Confidence | null;
  evidence: string;
  uncertainties: string;
  /** "What would change my mind?" */
  changeTriggers: string;
  costOfIgnoring: string;
  nextAction: string;
  /** "If ___ happens, I will ___." */
  ifThen: { condition: string; action: string } | null;
  reviewDate: ISODate | null;
  status: ConvictionStatus;
  /** The user's own note on why this version differs from the previous one. */
  changeNote: string;
}

export interface Conviction {
  id: string;
  kind: ConvictionKind;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  sourceEntryId: string | null;
  sourceBlockId: string | null;
  current: ConvictionVersion;
  versions: ConvictionVersion[]; // ascending by versionNo
  /** Explicit links the user made to later entries. */
  linkedEntryIds: string[];
}

export interface ConvictionLink {
  convictionId: string;
  entryId: string;
  note: string;
  createdAt: ISOTimestamp;
}

export interface WeeklyReview {
  id: string;
  /** Monday of the week, YYYY-MM-DD */
  weekStart: ISODate;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  /** User's own writing (markdown). */
  content: string;
  /** Local-AI draft. Always displayed as AI material; never merged silently. */
  aiDraft: string | null;
  aiDraftModel: string | null;
  aiDraftCreatedAt: ISOTimestamp | null;
}

/** Derived artifacts produced by local AI; never confused with user text. */
export interface AiArtifact {
  id: string;
  kind: "summary" | "suggestion" | "comparison";
  ownerType: "entry" | "conviction";
  ownerId: string;
  model: string;
  content: string;
  createdAt: ISOTimestamp;
  /** For suggestions: dismissed/accepted */
  state: "pending" | "accepted" | "dismissed";
}

export interface TemplateSection {
  /** Stable key, e.g. "open", "yesterday", "sleep" */
  key: string;
  blockType: BlockType;
  /** Understated label shown above the writing area */
  label: string;
  /** The single primary prompt, shown as placeholder */
  prompt: string;
  /** Secondary prompts, hidden until requested */
  secondaryPrompts: string[];
  enabled: boolean;
}

export type Theme = "system" | "light" | "dark";
export type JournalFont = "serif" | "sans";

export interface AiSettings {
  enabled: boolean;
  ollamaUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export interface Settings {
  theme: Theme;
  journalFont: JournalFont;
  fontSize: "small" | "medium" | "large";
  template: TemplateSection[];
  ai: AiSettings;
  resurfacingEnabled: boolean;
  /** PBKDF2 passcode record, or null when the lock is off. */
  lock: { salt: string; hash: string; iterations: number } | null;
  deviceName: string;
}

export interface SearchFilters {
  from?: ISODate;
  to?: ISODate;
  blockTypes?: BlockType[];
  tags?: string[];
  favoritesOnly?: boolean;
  /** Include conviction records in results */
  includeConvictions?: boolean;
  /** Restrict to entries only (exclude convictions) */
  entriesOnly?: boolean;
}

export interface SearchHit {
  kind: "block" | "conviction";
  /** Entry id for blocks; conviction id for convictions */
  id: string;
  entryId: string | null;
  blockId: string | null;
  blockType: BlockType | null;
  /** The record's calendar date */
  date: ISODate;
  title: string;
  /** Highlighted snippet (plain text with «» marks around matches) or raw excerpt */
  snippet: string;
  score: number;
  tags: string[];
  favorite: boolean;
}

export interface SearchGroup {
  /** e.g. "2026-03" */
  key: string;
  label: string;
  hits: SearchHit[];
}
