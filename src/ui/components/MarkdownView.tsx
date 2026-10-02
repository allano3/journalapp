import { useMemo } from "react";
import { renderMarkdown } from "../../domain/markdown";

/** Read-only rendering of user markdown with the journal typography. */
export function MarkdownView({ markdown, className = "" }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  return <div className={`prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
