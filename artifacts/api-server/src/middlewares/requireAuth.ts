import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { getOrCreateUser } from "../lib/usage.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized — please sign in." });
      return;
    }
    req.userId = userId;

    let email: string | null = null;
    try {
      const u = await clerkClient.users.getUser(userId);
      email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      // Best-effort email lookup
    }
    req.userEmail = email;

    await getOrCreateUser(userId, email);
    next();
  } catch (e) {
    res.status(500).json({ error: `Auth check failed: ${e instanceof Error ? e.message : String(e)}` });
  }
}
