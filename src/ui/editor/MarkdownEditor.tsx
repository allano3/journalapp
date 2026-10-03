import { useEffect, useRef, type CSSProperties } from "react";
import { EditorState, EditorSelection, type StateCommand } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt, drawSelection } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, indentMore, indentLess } from "@codemirror/commands";
import { markdown, markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import "./editor.css";

export interface MarkdownEditorProps {
  value: string;
  onChange(v: string): void;
  placeholder: string;
  autoFocus?: boolean;
  minLines?: number;
  id?: string;
}

/**
 * Live markdown styling. Marks (`#`, `*`, `>`, `-`) stay visible but dimmed so the
 * text still reads like writing, not like code. `processingInstruction` is listed
 * last so its colour wins over inherited heading/emphasis colours.
 */
const journalHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.45em", fontWeight: "600", lineHeight: "1.3" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "600", lineHeight: "1.35" },
  { tag: tags.heading3, fontSize: "1.08em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
  { tag: tags.quote, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: tags.link, textDecoration: "underline", textDecorationColor: "var(--border-strong)", textUnderlineOffset: "0.15em" },
  { tag: tags.url, color: "var(--accent-ink)", textDecoration: "none" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--bg-sunken)", borderRadius: "3px" },
  { tag: tags.contentSeparator, color: "var(--text-faint)" },
  { tag: tags.atom, color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: "0.85em" },
  { tag: tags.labelName, color: "var(--text-muted)" },
  { tag: tags.string, color: "var(--text-muted)" },
  { tag: tags.processingInstruction, color: "var(--text-faint)", fontWeight: "400", fontStyle: "normal", textDecoration: "none" },
]);

const paperTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--journal-font)",
    fontSize: "var(--journal-size)",
    lineHeight: "var(--journal-leading)",
    overflow: "visible",
  },
  ".cm-content": { padding: "0", caretColor: "var(--text)", overflowWrap: "anywhere" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--text-faint)", fontFamily: "var(--journal-font)", fontStyle: "italic" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)", borderLeftWidth: "1.5px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--selection)",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

/** Wrap the selection (or the word at the cursor) in `mark`; unwrap if already wrapped. */
function wrapWith(mark: string): StateCommand {
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        const line = state.doc.lineAt(from);
        const before = line.text.slice(0, from - line.from).match(/[\p{L}\p{N}'’]+$/u)?.[0].length ?? 0;
        const after = line.text.slice(to - line.from).match(/^[\p{L}\p{N}'’]+/u)?.[0].length ?? 0;
        from -= before;
        to += after;
      }
      const n = mark.length;
      const wrapped =
        from - n >= 0 && to + n <= state.doc.length && state.sliceDoc(from - n, from) === mark && state.sliceDoc(to, to + n) === mark;
      if (wrapped) {
        return {
          changes: [
            { from: from - n, to: from },
            { from: to, to: to + n },
          ],
          range: EditorSelection.range(from - n, to - n),
        };
      }
      const inner = state.sliceDoc(from, to);
      if (inner.length >= 2 * n && inner.startsWith(mark) && inner.endsWith(mark)) {
        return {
          changes: { from, to, insert: inner.slice(n, inner.length - n) },
          range: EditorSelection.range(from, to - 2 * n),
        };
      }
      return {
        changes: [
          { from, insert: mark },
          { from: to, insert: mark },
        ],
        range: EditorSelection.range(from + n, to + n),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

/** `[text](url)`: selected text becomes the label and the cursor lands inside the parentheses. */
const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^https?:\/\/\S+$/.test(text)) {
      return {
        changes: { from: range.from, to: range.to, insert: `[](${text})` },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const insert = `[${text}](url)`;
    const urlStart = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/;

function onListLine(state: EditorState): boolean {
  return state.selection.ranges.every((r) => {
    const from = state.doc.lineAt(r.from).number;
    const to = state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) if (!LIST_LINE.test(state.doc.line(n).text)) return false;
    return true;
  });
}

/** Tab only captures focus when it has something to do (a list item to indent). */
const indentListItem: StateCommand = (target) => onListLine(target.state) && indentMore(target);
const dedentListItem: StateCommand = (target) => onListLine(target.state) && indentLess(target);

const journalKeymap = keymap.of([
  { key: "Mod-b", run: wrapWith("**") },
  { key: "Mod-i", run: wrapWith("*") },
  { key: "Mod-k", run: insertLink },
  { key: "Enter", run: insertNewlineContinueMarkup },
  { key: "Backspace", run: deleteMarkupBackward },
  { key: "Tab", run: indentListItem },
  { key: "Shift-Tab", run: dedentListItem },
  ...historyKeymap,
  ...defaultKeymap,
]);

/**
 * CodeMirror disables the platform's writing aids by default
 * (`autocorrect="off" spellcheck="false" autocapitalize="off"`). For prose journalling —
 * especially on a phone keyboard — they are wanted, so they are turned back on here.
 */
const nativeWritingAids = EditorView.contentAttributes.of({
  autocorrect: "on",
  autocapitalize: "sentences",
  spellcheck: "true",
  enterkeyhint: "enter",
});

const staticExtensions = [
  history(),
  drawSelection(),
  EditorView.lineWrapping,
  markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false }),
  syntaxHighlighting(journalHighlight),
  paperTheme,
  nativeWritingAids,
  journalKeymap,
];

/**
 * Height to keep clear below the caret. The software keyboard is excluded from
 * `visualViewport`, but iOS draws its form assistant (the floating "‹ › ✓" pill) *over*
 * the page without shrinking the viewport, so that band has to be reserved by hand.
 */
const CARET_CLEARANCE = 76;
const CARET_HEADROOM = 24;

/**
 * Scroll the page so the caret stays inside the part of the screen the keyboard and its
 * accessory bar leave visible. CodeMirror's own `scrollIntoView` only knows the layout
 * viewport, which does not change when the keyboard opens, so it considers a caret
 * hidden behind the keyboard to be perfectly visible.
 */
function keepCaretVisible(view: EditorView): void {
  if (!view.hasFocus) return;
  const caret = view.coordsAtPos(view.state.selection.main.head);
  if (!caret) return;
  const vv = window.visualViewport;
  const top = (vv?.offsetTop ?? 0) + CARET_HEADROOM;
  const bottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) - CARET_CLEARANCE;
  const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top ? caret.top - top : 0;
  if (delta !== 0) window.scrollBy({ top: delta, behavior: "auto" });
}

export function MarkdownEditor({ value, onChange, placeholder, autoFocus = false, minLines = 3, id }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged || u.selectionSet) requestAnimationFrame(() => keepCaretVisible(u.view));
      if (!u.docChanged) return;
      const next = u.state.doc.toString();
      valueRef.current = next;
      onChangeRef.current(next);
    });
    const v = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions: [staticExtensions, placeholderExt(placeholder), listener] }),
      parent,
    });
    view.current = v;
    if (autoFocus) v.focus();
    // The keyboard opening or closing resizes the visual viewport without moving the page.
    const onViewport = () => keepCaretVisible(v);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      v.destroy();
      view.current = null;
    };
    // The view is created once; placeholder changes are rare (template edits) and remount via `key` upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder]);

  // External value changes (prompt insertion, reload from storage) are applied as a
  // transaction; identical text is a no-op so re-renders never disturb the caret.
  useEffect(() => {
    const v = view.current;
    if (!v || value === valueRef.current) return;
    valueRef.current = value;
    const current = v.state.doc.toString();
    if (current === value) return;
    v.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: EditorSelection.cursor(Math.min(v.state.selection.main.head, value.length)),
    });
  }, [value]);

  return <div ref={host} id={id} className="md-editor" style={{ "--editor-min-lines": String(minLines) } as CSSProperties} />;
}
