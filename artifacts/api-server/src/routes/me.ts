import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getOrCreateUser } from "../lib/usage.js";
import { logger } from "../lib/logger.js";
import { IS_PROXY } from "../lib/server-mode.js";

const router: IRouter = Router();

const HOSTED_URL = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
const protect = IS_PROXY ? [] : [requireAuth];

async function proxyToHosted(req: Request, res: Response, path: string): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const upstream = await fetch(`${HOSTED_URL}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(502).json({ error: `Failed to reach me service: ${msg}` });
  }
}

// Minimal "who am I" — gives the frontend just enough to conditionally
// render admin-only UI without shipping the admin email list in the bundle.
router.get("/me", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/me");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const user = await getOrCreateUser(userId, email);
    res.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
    });
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to load /me");
    res.status(500).json({ error: "Failed to load user" });
  }
});

export default router;
