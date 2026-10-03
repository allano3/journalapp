import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { isTauri } from "./storage/blobstore.tauri";
import { flushPending } from "./storage/db";
import "./ui/styles/global.css";
import "./ui/styles/shell.css";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * A new build has activated. Its files are already cached, so the update is applied on
 * the next launch no matter what; reloading now is only to pick it up sooner. Never do
 * that mid-sentence: wait until the user is not writing, and flush pending writes first.
 */
function reloadWhenIdle(): void {
  const attempt = () => {
    if (document.documentElement.dataset.typing === "true") return;
    clearInterval(timer);
    void flushPending().then(() => window.location.reload());
  };
  const timer = setInterval(attempt, 2000);
  attempt();
}

// Installable, offline-capable web app. The desktop/mobile Tauri shell serves files
// itself, so the service worker is only registered when running in a real browser.
if (!isTauri() && "serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onNeedReload: reloadWhenIdle,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // The browser only looks for a new worker on navigation, which an installed app
      // resumed from the background may not do for days. Check hourly and whenever the
      // app comes back to the foreground.
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
