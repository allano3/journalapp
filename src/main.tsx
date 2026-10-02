import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { isTauri } from "./storage/blobstore.tauri";
import "./ui/styles/global.css";
import "./ui/styles/shell.css";

// Installable, offline-capable web app. The desktop/mobile Tauri shell serves files
// itself, so the service worker is only registered when running in a real browser.
if (!isTauri() && "serviceWorker" in navigator) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
