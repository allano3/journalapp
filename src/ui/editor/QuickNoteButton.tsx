import { useNavigate } from "react-router-dom";
import { journal } from "../../storage/db";
import { todayISO } from "../../domain/dates";
import { IconPlus } from "../shell/icons";

/** Creates a note entry for today (outside the daily template) and opens it. */
export function QuickNoteButton({ className = "btn btn-quiet" }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const entry = journal().entries.create({ entryDate: todayISO(), kind: "note" });
        navigate(`/entry/${entry.id}`);
      }}
    >
      <IconPlus width={16} height={16} /> Quick note
    </button>
  );
}
