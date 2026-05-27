import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gameRouter from "./game.js";
import screenshotRouter from "./screenshot.js";
import chatRouter from "./chat.js";
import voiceRouter from "./voice.js";
import watchRouter from "./watch.js";
import settingsRouter from "./settings.js";
import sessionsRouter from "./sessions.js";
// sessionsRouter is mounted on every deployment mode (see below).
// Hosted uses Postgres scoped by Clerk userId, proxy forwards to hosted,
// dev uses the legacy fs store.
import billingRouter from "./billing.js";
import adminRouter from "./admin.js";
import meRouter from "./me.js";
import profilesRouter from "./profiles.js";
import gamesLibraryRouter from "./games-library.js";
import { IS_LOCAL_ROUTES_ENABLED } from "../lib/server-mode.js";

const router: IRouter = Router();

// Always available, on every deployment mode.
router.use(healthRouter);
router.use(chatRouter);
router.use(voiceRouter);
router.use(watchRouter);
router.use(billingRouter);
router.use(adminRouter);
router.use(meRouter);
router.use(profilesRouter);
router.use(gamesLibraryRouter);
// Sessions are now DB-backed on hosted (per-account, requireAuth) and
// pass-through on proxy/dev, so the router is safe to mount everywhere.
router.use(sessionsRouter);

// Per-machine local routes. Disabled on the hosted server because they expose
// shared per-process filesystem/memory state (captured screenshots, config
// file, currently-running games) that would otherwise be readable across
// all hosted users.
if (IS_LOCAL_ROUTES_ENABLED) {
  router.use(gameRouter);
  router.use(screenshotRouter);
  router.use(settingsRouter);
}

export default router;
