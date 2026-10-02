import type { TemplateSection, BlockType } from "./types";

/**
 * The default daily template. Every section is optional. Order and enablement are
 * user-configurable from Settings; the keys are stable so saved blocks keep their
 * section association when the template changes.
 */
export const DEFAULT_TEMPLATE: TemplateSection[] = [
  {
    key: "open",
    blockType: "freewrite",
    label: "Open",
    prompt: "What is most on my mind?",
    secondaryPrompts: [],
    enabled: true,
  },
  {
    key: "yesterday",
    blockType: "reflection",
    label: "Looking back",
    prompt: "What from yesterday is still with me?",
    secondaryPrompts: [
      "What happened?",
      "What stood out?",
      "Was there anything surprising?",
      "What am I still thinking about?",
      "Is there anything I would handle differently?",
    ],
    enabled: true,
  },
  {
    key: "sleep",
    blockType: "sleep",
    label: "Sleep & morning",
    prompt: "Dreams remembered, first thoughts after waking, anything that seemed important in the night.",
    secondaryPrompts: [
      "What did I dream?",
      "What was the first thing I thought about?",
      "Did anything feel unusually important this morning?",
    ],
    enabled: true,
  },
  {
    key: "gratitude",
    blockType: "gratitude",
    label: "Gratitude",
    prompt: "What am I grateful for right now?",
    secondaryPrompts: ["Why does this matter to me?"],
    enabled: true,
  },
  {
    key: "reading",
    blockType: "reading",
    label: "Reading",
    prompt: "What stood out?",
    secondaryPrompts: [
      "What do I think it means?",
      "What do I want to remember?",
      "Does it change anything about how I should act?",
    ],
    enabled: true,
  },
  {
    key: "prayer",
    blockType: "prayer",
    label: "Prayer",
    prompt: "What should I pray about?",
    secondaryPrompts: [],
    enabled: true,
  },
  {
    key: "conviction",
    blockType: "conviction",
    label: "Convictions & decisions",
    prompt: "Did anything today become clear enough that you don't want your future self to casually forget it?",
    secondaryPrompts: [],
    enabled: true,
  },
  {
    key: "closing",
    blockType: "action",
    label: "Closing",
    prompt: "What do I want to carry into today?",
    secondaryPrompts: ["One concrete action."],
    enabled: true,
  },
];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  freewrite: "Open",
  reflection: "Looking back",
  sleep: "Sleep & morning",
  dream: "Dream",
  gratitude: "Gratitude",
  reading: "Reading",
  prayer: "Prayer",
  conviction: "Conviction",
  decision: "Decision",
  action: "Closing",
  generic: "Note",
};

/** Merge a stored template with the defaults so new sections appear for old settings. */
export function normalizeTemplate(stored: TemplateSection[] | undefined): TemplateSection[] {
  if (!stored || stored.length === 0) return DEFAULT_TEMPLATE.map((s) => ({ ...s }));
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const merged: TemplateSection[] = stored
    .filter((s) => DEFAULT_TEMPLATE.some((d) => d.key === s.key))
    .map((s) => {
      const d = DEFAULT_TEMPLATE.find((x) => x.key === s.key)!;
      return { ...d, ...s, secondaryPrompts: s.secondaryPrompts ?? d.secondaryPrompts };
    });
  for (const d of DEFAULT_TEMPLATE) if (!byKey.has(d.key)) merged.push({ ...d });
  return merged;
}
