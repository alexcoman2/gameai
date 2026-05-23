import app from "./app";
import { logger } from "./lib/logger";
import { IS_PROXY, SERVER_MODE } from "./lib/server-mode";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// In proxy (Electron desktop) mode, bind to loopback only so no other
// machine on the user's network can reach this server. The desktop client
// is the only intended caller and it's always on the same host. In hosted/
// dev mode we keep the default (all interfaces) so Replit's proxy can
// reach the server.
const host = IS_PROXY ? "127.0.0.1" : "0.0.0.0";

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host, mode: SERVER_MODE }, "Server listening");
});
