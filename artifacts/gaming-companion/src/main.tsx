import { createRoot } from "react-dom/client";
import { Router as WouterRouter } from "wouter";
import App from "./App";
import "./index.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Diagnostic — surfaces in DevTools Console. Tells us definitively whether
// the page is being served from the local Electron server (127.0.0.1) or
// somehow loaded from the hosted Replit URL.
// eslint-disable-next-line no-console
console.log(
  "[Unstuck] page origin:",
  window.location.origin,
  "| href:",
  window.location.href,
  "| basePath:",
  basePath || "(none)",
);

createRoot(document.getElementById("root")!).render(
  <WouterRouter base={basePath}>
    <App />
  </WouterRouter>
);
