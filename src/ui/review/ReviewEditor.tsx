import { useLayoutEffect, useRef } from "react";
import { WEEKLY_REVIEW_QUESTIONS } from "../../ai/prompts";
import "./review.css";

/**
 * "Your review": the writer's own markdown for the week. Controlled; the page owns
 * the text and its autosave so the AI draft can be appended to the same state.
 */
export function ReviewEditor({ content, onChange, saved }: { content: string; onChange: (next: string) => void; saved: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const insertHeading = (question: string) => {
    const base = content.trimEnd();
    const next = `${base.length > 0 ? `${base}\n\n` : ""}## ${question}\n\n`;
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  };

  return (
    <section className="review-section">
      <div className="label">Your review</div>
      <div className="review-prompts" aria-label="Questions to consider">
        {WEEKLY_REVIEW_QUESTIONS.map((q) => (
          <button key={q} type="button" onClick={() => insertHeading(q)} title="Add this question to your review">
            {q}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="review-editor"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write about the week in your own words…"
        aria-label="Weekly review"
        spellCheck
      />
      <div className="review-saved">{saved ? (content.trim().length > 0 ? "Saved" : "") : "Saving…"}</div>
    </section>
  );
}
