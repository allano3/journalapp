import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { openJournal } from "./storage/db";
import { ShellProvider } from "./ui/shell/ShellContext";
import { Layout } from "./ui/shell/Layout";
import { LockGate } from "./ui/security/LockGate";
import { TodayPage } from "./ui/pages/Today";
import { EntryPage } from "./ui/pages/EntryPage";
import { JournalPage } from "./ui/pages/Journal";
import { SearchPage } from "./ui/pages/Search";
import { ConvictionsPage } from "./ui/pages/Convictions";
import { ConvictionDetailPage } from "./ui/pages/ConvictionDetail";
import { ConvictionNewPage } from "./ui/pages/ConvictionNew";
import { WeeklyReviewPage } from "./ui/pages/WeeklyReview";
import { AskPage } from "./ui/pages/Ask";
import { SettingsPage } from "./ui/pages/Settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    openJournal()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div className="splash">Could not open the journal: {error}</div>;
  if (!ready) return <div className="splash">Opening your journal…</div>;

  return (
    <HashRouter>
      <ShellProvider>
        <LockGate>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<TodayPage />} />
              <Route path="entry/:id" element={<EntryPage />} />
              <Route path="journal" element={<JournalPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="convictions" element={<ConvictionsPage />} />
              <Route path="convictions/new" element={<ConvictionNewPage />} />
              <Route path="convictions/:id" element={<ConvictionDetailPage />} />
              <Route path="review" element={<WeeklyReviewPage />} />
              <Route path="review/:weekStart" element={<WeeklyReviewPage />} />
              <Route path="ask" element={<AskPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </LockGate>
      </ShellProvider>
    </HashRouter>
  );
}
