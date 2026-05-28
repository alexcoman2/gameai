import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { IS_HOSTED } from "../lib/server-mode.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Desktop sign-in hand-back endpoint. Only meaningful on the hosted public
// deployment — that's where the real Clerk session cookies live after the
// user signs in inside their normal OS browser. The desktop app opens
// https://<hosted>/desktop/auth?state=<nonce> in the browser; once the user
// is signed in there, that page forwards the browser to this endpoint, which
// mints a short-lived single-use Clerk sign-in token and deep-links it back
// into the Electron app via the custom unstuck:// protocol.
//
// Mounted only on hosted: in proxy (Electron-bundled) mode the local server
// has no Clerk secret key and could not mint a token anyway.
if (IS_HOSTED) {
  router.get("/desktop/token", requireAuth, async (req, res) => {
    const userId = req.userId!;
    // Echo the caller-supplied opaque nonce straight back to the app so the
    // Electron main process can verify the ticket belongs to the sign-in it
    // initiated. We never interpret it server-side.
    const rawState = req.query.state;
    const state = typeof rawState === "string" ? rawState : "";
    try {
      const token = await clerkClient.signInTokens.createSignInToken({
        userId,
        // Short-lived: the app exchanges it immediately on deep-link receipt.
        expiresInSeconds: 60,
      });
      const params = new URLSearchParams();
      params.set("ticket", token.token);
      if (state) params.set("state", state);
      const deepLink = `unstuck://auth?${params.toString()}`;
      res.redirect(302, deepLink);
    } catch (e) {
      logger.error({ err: e, userId }, "Failed to mint desktop sign-in token");
      res
        .status(500)
        .send(
          "Could not complete desktop sign-in. Please close this tab and try again from the app.",
        );
    }
  });
}

export default router;
