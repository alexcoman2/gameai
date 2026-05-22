import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import gameRouter from "./game.js";
import screenshotRouter from "./screenshot.js";
import chatRouter from "./chat.js";
import settingsRouter from "./settings.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gameRouter);
router.use(screenshotRouter);
router.use(chatRouter);
router.use(settingsRouter);

export default router;
