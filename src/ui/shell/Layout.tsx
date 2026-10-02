import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useShell } from "./ShellContext";
import { useQuery, useSettings } from "../../state/hooks";
import { IconAsk, IconConvictions, IconJournal, IconReview, IconSearch, IconSettings, IconToday } from "./icons";
import { formatShort, fromISODate, todayISO } from "../../domain/dates";
import { scheduleIndexSync } from "../../ai/embeddings";
import { journal } from "../../storage/db";
import { changes } from "../../state/events";

const DOW = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function useThemeAttributes(): void {
  const [settings] = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    root.dataset.font = settings.journalFont;
    root.dataset.size = settings.fontSize;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme, settings.journalFont, settings.fontSize]);
}

/** Keep the local semantic index in step with writes, when AI is enabled. */
function useIndexSync(): void {
  const [settings] = useSettings();
  useEffect(() => {
    if (!settings.ai.enabled) return;
    const j = journal();
    scheduleIndexSync(j, 1500);
    return changes.subscribe((t) => {
      if (t === "entries" || t === "convictions") scheduleIndexSync(j);
    });
  }, [settings.ai.enabled, settings.ai.embeddingModel, settings.ai.ollamaUrl]);
}

function RecentDates() {
  const today = todayISO();
  const recent = useQuery((j) => j.entries.list({ kind: "daily", limit: 10 }), [], ["entries"]);
  const location = useLocation();
  return (
    <div className="sidebar-dates">
      {recent.map((e) => (
        <NavLink key={e.id} to={`/entry/${e.id}`} className={location.pathname === `/entry/${e.id}` ? "active" : ""}>
          <span>{e.entryDate === today ? "Today" : formatShort(e.entryDate)}</span>
          <span className="dow">{DOW.format(fromISODate(e.entryDate))}</span>
        </NavLink>
      ))}
    </div>
  );
}

export function Layout() {
  useThemeAttributes();
  useIndexSync();
  const { aside, focus } = useShell();
  const [settings] = useSettings();

  return (
    <div className="shell" data-aside={aside ? "true" : "false"} data-focus={focus ? "true" : "false"}>
      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          Journal
          <small>Private · Local only</small>
        </div>
        <div className="nav">
          <NavLink to="/" end>
            <IconToday /> Today
          </NavLink>
          <NavLink to="/journal">
            <IconJournal /> Journal
          </NavLink>
          <NavLink to="/search">
            <IconSearch /> Search
          </NavLink>
          <NavLink to="/convictions">
            <IconConvictions /> Convictions
          </NavLink>
        </div>
        <div className="nav nav-group">
          <div className="label">Reflection</div>
          <NavLink to="/review">
            <IconReview /> Weekly review
          </NavLink>
          {settings.ai.enabled && (
            <NavLink to="/ask">
              <IconAsk /> Ask my journal
            </NavLink>
          )}
        </div>
        <RecentDates />
        <div className="sidebar-foot nav">
          <NavLink to="/settings">
            <IconSettings /> Settings
          </NavLink>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>

      {aside && <aside className="aside">{aside}</aside>}

      <nav className="tabbar" aria-label="Primary">
        <NavLink to="/" end>
          <IconToday /> Today
        </NavLink>
        <NavLink to="/journal">
          <IconJournal /> Journal
        </NavLink>
        <NavLink to="/search">
          <IconSearch /> Search
        </NavLink>
        <NavLink to="/convictions">
          <IconConvictions /> Convictions
        </NavLink>
      </nav>
    </div>
  );
}
