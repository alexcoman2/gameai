import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { loadConfig } from "./lib/config.js";
import { startAutoCapture } from "./lib/screenshot-state.js";
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
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

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
if (config.autoCapture) {
  startAutoCapture(config.screenshotInterval);
  logger.info(
    { interval: config.screenshotInterval },
    "Auto screenshot capture started"
  );
}

export default app;
