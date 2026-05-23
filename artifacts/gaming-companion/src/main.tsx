import { createRoot } from "react-dom/client";
import { Router as WouterRouter } from "wouter";
import { Sentry } from "@/lib/sentry";
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
  <Sentry.ErrorBoundary
    fallback={({ error }) => (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#fff", background: "#111", minHeight: "100vh" }}>
        <h1 style={{ color: "#ef4444" }}>Something went wrong.</h1>
        <p>The error has been reported. Please reload the app.</p>
        <pre style={{ marginTop: 16, color: "#888", fontSize: 12 }}>
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    )}
  >
    <WouterRouter base={basePath}>
      <App />
    </WouterRouter>
  </Sentry.ErrorBoundary>
);
