import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gameRouter from "./game.js";
import screenshotRouter from "./screenshot.js";
import chatRouter from "./chat.js";
import watchRouter from "./watch.js";
import settingsRouter from "./settings.js";
import sessionsRouter from "./sessions.js";
import billingRouter from "./billing.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gameRouter);
router.use(screenshotRouter);
router.use(chatRouter);
router.use(watchRouter);
router.use(settingsRouter);
router.use(sessionsRouter);
router.use(billingRouter);

export default router;
