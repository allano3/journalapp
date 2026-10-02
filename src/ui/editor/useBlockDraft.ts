import { useCallback, useEffect, useRef, useState } from "react";
import type { Block, BlockMetadata, BlockType } from "../../domain/types";
import { journal } from "../../storage/db";

export interface BlockDraft {
  text: string;
  metadata: BlockMetadata;
  /** Id of the stored block, or null until the first change creates it. */
  blockId: string | null;
  setText(text: string): void;
  setMetadata(patch: BlockMetadata): void;
  /** Create the block now if it does not exist yet (used before linking to it). */
  ensureBlock(): string;
  /** Write any pending change immediately. */
  flush(): void;
}

const SAVE_DELAY = 500;

/**
 * Local draft of one block with debounced autosave. The block row is created lazily
 * on the first change (never on load), so untouched sections leave no empty rows.
 * External changes to the stored block (restore, another view) are adopted only when
 * nothing is pending here, so a re-query after our own save never reverts typing.
 */
export function useBlockDraft(entryId: string, block: Block | null, type: BlockType, initialMetadata: BlockMetadata): BlockDraft {
  const [text, setTextState] = useState(block?.content ?? "");
  const [metadata, setMetadataState] = useState<BlockMetadata>(block?.metadata ?? initialMetadata);
  const blockId = useRef<string | null>(block?.id ?? null);
  const lastSaved = useRef({ content: block?.content ?? "", meta: JSON.stringify(block?.metadata ?? initialMetadata) });
  const latest = useRef({ text, metadata });
  const pending = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const ensureBlock = useCallback((): string => {
    if (blockId.current) return blockId.current;
    const { text: content, metadata: meta } = latest.current;
    const created = journal().entries.addBlock(entryId, { type, content, metadata: meta });
    blockId.current = created.id;
    lastSaved.current = { content, meta: JSON.stringify(meta) };
    return created.id;
  }, [entryId, type]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!pending.current) return;
    pending.current = false;
    const { text: content, metadata: meta } = latest.current;
    const id = ensureBlock();
    const metaJson = JSON.stringify(meta);
    if (content === lastSaved.current.content && metaJson === lastSaved.current.meta) return;
    journal().entries.saveBlock(id, content, meta);
    lastSaved.current = { content, meta: metaJson };
  }, [ensureBlock]);

  const schedule = useCallback(() => {
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  const setText = useCallback(
    (next: string) => {
      latest.current = { ...latest.current, text: next };
      setTextState(next);
      if (!blockId.current) ensureBlock();
      schedule();
    },
    [ensureBlock, schedule],
  );

  const setMetadata = useCallback(
    (patch: BlockMetadata) => {
      const next = { ...latest.current.metadata, ...patch };
      latest.current = { ...latest.current, metadata: next };
      setMetadataState(next);
      if (!blockId.current) ensureBlock();
      schedule();
    },
    [ensureBlock, schedule],
  );

  // Adopt the stored block when it changed somewhere else and we have nothing unsaved.
  useEffect(() => {
    if (!block) return;
    blockId.current = block.id;
    if (pending.current) return;
    const metaJson = JSON.stringify(block.metadata);
    if (block.content !== lastSaved.current.content || metaJson !== lastSaved.current.meta) {
      lastSaved.current = { content: block.content, meta: metaJson };
      latest.current = { text: block.content, metadata: block.metadata };
      setTextState(block.content);
      setMetadataState(block.metadata);
    }
  }, [block]);

  // Flush on unmount so navigating away within the debounce window loses nothing.
  useEffect(() => flush, [flush]);

  return { text, metadata, blockId: blockId.current, setText, setMetadata, ensureBlock, flush };
}
