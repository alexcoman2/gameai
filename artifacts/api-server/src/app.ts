import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { loadConfig } from "./lib/config.js";
import { startAutoCapture } from "./lib/screenshot-state.js";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";
import { paddleWebhookHandler } from "./routes/paddle-webhook.js";
import path from "path";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (it streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Paddle webhook needs the raw body for signature verification — must be
// mounted before the global express.json() parser consumes it.
app.post(
  "/api/webhooks/paddle",
  express.raw({ type: "application/json" }),
  paddleWebhookHandler,
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

const staticDir = process.env["STATIC_DIR"];
if (staticDir) {
  app.use(express.static(staticDir));
  // Express 5 requires a named wildcard; regex avoids path-to-regexp v8 issues
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const config = loadConfig();
// Only run auto-capture in the local Electron context where a real display
// is available. STATIC_DIR is only set when serving the packaged desktop app.
// On the hosted Replit server there is no display and screenshot-desktop
// would crash the process.
const hasDisplay = !!process.env["STATIC_DIR"];
if (hasDisplay && config.autoCapture) {
  startAutoCapture(config.screenshotInterval);
  logger.info(
    { interval: config.screenshotInterval },
    "Auto screenshot capture started"
  );
}

export default app;
