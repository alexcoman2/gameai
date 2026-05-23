import { createRoot } from "react-dom/client";
import { Router as WouterRouter } from "wouter";
import App from "./App";
import "./index.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <WouterRouter base={basePath}>
    <App />
  </WouterRouter>
);
