import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  session,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as path from "path";

// ── Third-party cookie restrictions ────────────────────────────────────────
// clerk-js runs at http://127.0.0.1:8765 and makes credentialed XHRs to the
// proxy host (https://game-companion-ai.replit.app/api/__clerk/*). Those are
// cross-site, so Chromium's tracking-protection / third-party cookie
// phaseout (TrackingProtection3pcd and friends) blocks both sending the
// proxy host's cookies on the request AND storing Set-Cookie on the
// response. Without those cookies clerk-js can never refresh the session
// and the local page stays signed out. This is a single-user desktop app
// with one specific cross-origin target it controls — there is no tracking
// concern — so disable the relevant Chromium features.
app.commandLine.appendSwitch(
  "disable-features",
  "TrackingProtection3pcd,ThirdPartyStoragePartitioning,PrivacySandboxAdsAPIs",
);

// ── Single-instance lock ───────────────────────────────────────────────────
// Prevents the "EADDRINUSE 127.0.0.1:8765" crash that happens when the user
// re-launches Unstuck before the previous instance's utilityProcess has
// fully released the port. If we don't get the lock, focus the existing
// window (handled below) and exit immediately.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Locked to a single fixed port. The origin (http://127.0.0.1:8765) is part
// of Clerk's cookie scope — if the port shifts between launches, the user's
// sign-in is silently lost. Anything stale on this port is killed at startup
// (see ensurePortFree).
const SERVER_PORT = 8765;
// The bundled api-server binds to 127.0.0.1 (IPv4) in proxy mode. We MUST
// use the literal "127.0.0.1" here too — on Windows, "localhost" resolves
// to IPv6 (::1) first, the server isn't listening on ::1, every probe is
// refused, waitForServer times out at 20s, and the app silently quits.
// That's exactly the "process appears in task manager then disappears
// after a few seconds" symptom.
const SERVER_HOST = "127.0.0.1";
const OVERLAY_HOTKEY_PRIMARY = "Control+Shift+Space";
const OVERLAY_HOTKEY_FALLBACK = "Alt+Space";
const OVERLAY_WIDTH = 440;
const OVERLAY_HEIGHT = 560;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let serverProcess: UtilityProcess | null = null;
let lastGameScreenshot: string | null = null;
let backgroundCaptureTimer: ReturnType<typeof setInterval> | null = null;
let logStream: fs.WriteStream | null = null;
let logFilePath = "";
const recentServerOutput: string[] = [];

// ── Diagnostics ────────────────────────────────────────────────────────────
// Packaged Electron apps on Windows have no visible stdout/stderr. When the
// bundled server crashes, the user sees the process disappear from Task
// Manager with no clue what happened. We fix that by:
//   1. Mirroring everything the api-server writes to a real log file in
//      app.getPath("logs"), and keeping the last ~200 lines in memory.
//   2. If startup fails (server times out OR crashes early), pop a dialog
//      showing the last lines + a button to open the full log file.
//   3. Catching uncaught exceptions/rejections in the main process and
//      surfacing them the same way before quitting.

function setupLogFile(): void {
  try {
    const logsDir = app.getPath("logs");
    fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, "unstuck.log");
    logStream = fs.createWriteStream(logFilePath, { flags: "a" });
    const stamp = new Date().toISOString();
    logStream.write(
      `\n\n========== Unstuck launched ${stamp} (v${app.getVersion()}, ${process.platform} ${process.arch}) ==========\n`,
    );
  } catch {
    // Disk full / permissions denied — log silently to avoid an infinite
    // failure loop. The fallback dialog below will still fire.
  }
}

function appendServerLog(chunk: string): void {
  logStream?.write(chunk);
  // Keep last ~200 lines in memory for the failure dialog.
  recentServerOutput.push(chunk);
  if (recentServerOutput.length > 200) {
    recentServerOutput.splice(0, recentServerOutput.length - 200);
  }
}

function showStartupFailureDialog(reason: string): void {
  const tail = recentServerOutput.join("").split("\n").slice(-30).join("\n");
  const detail = [
    `Unstuck could not start its background service.`,
    ``,
    `Reason: ${reason}`,
    ``,
    `Last server output:`,
    tail || "(no output captured)",
    ``,
    `Full log: ${logFilePath || "(unavailable)"}`,
  ].join("\n");
  const choice = dialog.showMessageBoxSync({
    type: "error",
    title: "Unstuck failed to start",
    message: "Unstuck failed to start.",
    detail,
    buttons: logFilePath
      ? ["Open log folder", "Quit"]
      : ["Quit"],
    defaultId: 0,
    cancelId: logFilePath ? 1 : 0,
    noLink: true,
  });
  if (logFilePath && choice === 0) {
    void shell.showItemInFolder(logFilePath);
  }
}

function getResourcePaths(): { serverEntry: string; staticDir: string } {
  if (app.isPackaged) {
    return {
      serverEntry: path.join(process.resourcesPath, "server", "index.mjs"),
      staticDir: path.join(process.resourcesPath, "public"),
    };
  }
  return {
    serverEntry: path.resolve(
      __dirname,
      "../../../artifacts/api-server/dist/index.mjs"
    ),
    staticDir: path.resolve(
      __dirname,
      "../../../artifacts/gaming-companion/dist/public"
    ),
  };
}

function waitForServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const maxAttempts = 40;
    let attempts = 0;

    const check = () => {
      const req = http.get(`http://${SERVER_HOST}:${port}/api/healthz`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", () => retry());
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      attempts++;
      if (attempts >= maxAttempts) {
        reject(new Error("Server failed to become ready after 20 seconds"));
      } else {
        setTimeout(check, 500);
      }
    };

    setTimeout(check, 1000);
  });
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, SERVER_HOST);
  });
}

async function ensurePortFree(port: number): Promise<void> {
  if (await isPortFree(port)) return;
  appendServerLog(
    `[main] port ${port} is in use — killing whatever owns it\n`,
  );
  if (process.platform === "win32") {
    try {
      // Find PIDs listening on the port and force-kill them.
      const out = execFileSync(
        "cmd",
        ["/c", `netstat -ano -p tcp | findstr :${port}`],
        { encoding: "utf8", windowsHide: true },
      );
      const pids = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/LISTENING\s+(\d+)/);
        if (m) pids.add(m[1]);
      }
      for (const pid of pids) {
        try {
          execFileSync("taskkill", ["/F", "/T", "/PID", pid], {
            stdio: "ignore",
            windowsHide: true,
          });
          appendServerLog(`[main] killed stale process pid=${pid}\n`);
        } catch {
          // ignore
        }
      }
    } catch {
      // netstat found nothing or failed — fall through to retry
    }
  }
  // Wait briefly for the OS to release the socket.
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(port)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Port ${port} is still in use after attempting to free it. ` +
      `Open Task Manager, end any "Unstuck" processes, and try again.`,
  );
}

async function startServer(): Promise<void> {
  const { serverEntry, staticDir } = getResourcePaths();

  // Lock to the fixed port. Cookies (Clerk sign-in) are scoped to the
  // exact origin, so the port must be identical across launches.
  await ensurePortFree(SERVER_PORT);

  appendServerLog(
    `[main] starting api-server\n  entry: ${serverEntry}\n  static: ${staticDir}\n  exists: ${fs.existsSync(serverEntry)}\n`,
  );

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `api-server bundle missing at expected path: ${serverEntry}`,
    );
  }

  serverProcess = utilityProcess.fork(serverEntry, [], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: "production",
      STATIC_DIR: staticDir,
      AUTH_MODE: "proxy",
      UNSTUCK_API_URL:
        process.env.UNSTUCK_API_URL ||
        process.env.NEXUS_LINK_API_URL ||
        "https://game-companion-ai.replit.app",
    },
    stdio: "pipe",
  });

  // Pipe server stdout/stderr to disk so we can actually see what went wrong
  // on a user's machine. utilityProcess exposes these as Readable streams
  // when stdio is "pipe".
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    appendServerLog(`[server stdout] ${chunk.toString("utf8")}`);
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    appendServerLog(`[server stderr] ${chunk.toString("utf8")}`);
  });

  let earlyExit: { code: number | null } | null = null;
  serverProcess.on("exit", (code) => {
    appendServerLog(`[main] server process exited with code ${code}\n`);
    if (code !== 0 && code !== null) {
      earlyExit = { code };
    }
  });

  // If the server dies before becoming ready, fail fast with that error
  // instead of waiting out the full 20s timeout.
  const earlyExitPromise = new Promise<never>((_resolve, reject) => {
    const check = setInterval(() => {
      if (earlyExit) {
        clearInterval(check);
        reject(
          new Error(
            `server process exited with code ${earlyExit.code} before becoming ready`,
          ),
        );
      }
    }, 200);
    // Stop watching after the wait window closes.
    setTimeout(() => clearInterval(check), 25_000);
  });

  await Promise.race([waitForServer(SERVER_PORT), earlyExitPromise]);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Unstuck",
    show: false,
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: true,
  });

  const mainUrl = `http://${SERVER_HOST}:${SERVER_PORT}`;
  appendServerLog(`[main] mainWindow.loadURL → ${mainUrl}\n`);

  // Hard diagnostic: log every navigation, every load failure, and every
  // window-open attempt. If anything ever sends us off-origin (e.g. away
  // from 127.0.0.1:8765 to the hosted Replit URL) it will be recorded here
  // with the source URL, the destination URL, and the reason.
  mainWindow.webContents.on("did-start-loading", () => {
    appendServerLog(`[main] webContents did-start-loading\n`);
  });
  mainWindow.webContents.on(
    "did-navigate",
    (_evt, url, httpResponseCode, httpStatusText) => {
      appendServerLog(
        `[main] did-navigate url=${url} code=${httpResponseCode} status=${httpStatusText}\n`,
      );
    },
  );
  mainWindow.webContents.on("did-navigate-in-page", (_evt, url) => {
    appendServerLog(`[main] did-navigate-in-page url=${url}\n`);
  });
  // Safety net: if Clerk (or anything else) sends us to the hosted Replit
  // origin for a non-API page, rewrite the navigation back to the local
  // server so the Electron window stays on http://127.0.0.1:8765. We MUST
  // still allow /api/__clerk/* callbacks through — those endpoints set the
  // Clerk session cookies (proxied) before the final redirect home.
  const HOSTED_ORIGIN = "https://game-companion-ai.replit.app";
  const rewriteHostedToLocal = (
    rawUrl: string,
  ): string | null => {
    if (!rawUrl.startsWith(HOSTED_ORIGIN)) return null;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }
    // Leave Clerk proxy callbacks (and any other /api/ endpoint that must
    // stay on the hosted origin to set/read cookies) untouched.
    if (parsed.pathname.startsWith("/api/")) return null;
    const local = new URL(mainUrl);
    local.pathname = parsed.pathname;
    local.search = parsed.search;
    local.hash = parsed.hash;
    return local.toString();
  };
  mainWindow.webContents.on("will-redirect", (evt, url) => {
    appendServerLog(`[main] will-redirect → ${url}\n`);
    const rewritten = rewriteHostedToLocal(url);
    if (rewritten) {
      appendServerLog(
        `[main] rewriting hosted→local: ${url} → ${rewritten}\n`,
      );
      evt.preventDefault();
      void mainWindow?.loadURL(rewritten);
      return;
    }
    // Any redirect that lands on the local origin: pull a full snapshot
    // of every Clerk cookie from the proxy host onto the local origin
    // BEFORE the page loads, so clerk-js initializes against a coherent
    // state. We can't gate this on webContents.getURL() containing the
    // proxy host — during a chained redirect that getter still returns
    // the last fully-loaded page (e.g. /sign-in), not the intermediate
    // hosted URLs. The sync is cheap and idempotent, so just always run
    // it on redirect-to-local.
    if (url.startsWith(mainUrl)) {
      evt.preventDefault();
      void syncAllClerkCookiesFromProxy().finally(() => {
        void mainWindow?.loadURL(url);
      });
    }
  });
  mainWindow.webContents.on("will-navigate", (evt, url) => {
    appendServerLog(`[main] will-navigate → ${url}\n`);
    const rewritten = rewriteHostedToLocal(url);
    if (rewritten) {
      appendServerLog(
        `[main] rewriting hosted→local: ${url} → ${rewritten}\n`,
      );
      evt.preventDefault();
      void mainWindow?.loadURL(rewritten);
    }
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_evt, errorCode, errorDescription, validatedURL, isMainFrame) => {
      appendServerLog(
        `[main] did-fail-load mainFrame=${isMainFrame} url=${validatedURL} code=${errorCode} desc=${errorDescription}\n`,
      );
    },
  );
  mainWindow.webContents.setWindowOpenHandler((details) => {
    appendServerLog(`[main] window-open intercepted url=${details.url}\n`);
    return { action: "deny" };
  });

  void mainWindow.loadURL(mainUrl);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    // The overlay window is `skipTaskbar: true` and often hidden, so the
    // user has no way to close it manually. If we leave it open after the
    // main window closes, `window-all-closed` never fires, the app never
    // quits, and all the Electron child processes (including the server)
    // stay running. Explicitly destroy it here.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
  });

  // Background capture: when the user alt-tabs to Unstuck, capture the
  // game screen in the background so watch observations still see the game.
  mainWindow.on("blur", () => {
    if (backgroundCaptureTimer) return;
    backgroundCaptureTimer = setInterval(async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 1920, height: 1080 },
        });
        if (sources.length > 0) {
          lastGameScreenshot = sources[0].thumbnail.toDataURL();
        }
      } catch {
        // Silent fail
      }
    }, 2000);
  });

  mainWindow.on("focus", () => {
    if (backgroundCaptureTimer) {
      clearInterval(backgroundCaptureTimer);
      backgroundCaptureTimer = null;
    }
  });
}

// ── Overlay window ──────────────────────────────────────────────────────────
// Frameless, always-on-top, semi-transparent companion window. Toggled by a
// global hotkey so the user can pop chat over their game mid-fight without
// alt-tabbing to the main app. Lives independently of the main window but
// shares the same renderer origin (localhost:SERVER_PORT) so it picks up the
// same Clerk session / cookies / localStorage automatically.

function createOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  const primary = screen.getPrimaryDisplay();
  const { width: screenW } = primary.workAreaSize;
  const x = Math.max(0, screenW - OVERLAY_WIDTH - 24);
  const y = 24;

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  void overlayWindow.loadURL(`http://${SERVER_HOST}:${SERVER_PORT}/overlay`);

  // NOTE: Intentionally NO `blur` → hide. The whole point of the overlay is
  // that the user can click back into their game while a response streams in
  // and still glance at it. The window is alwaysOnTop "screen-saver" so it
  // stays visible above fullscreen apps anyway. Dismissal is explicit: the
  // hotkey, the close button, or Esc while focused.

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

// Show the overlay, deferring until `ready-to-show` if the window's first
// page load hasn't completed yet. Prevents a white flash on the first hotkey
// press after launch.
function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const reveal = () => {
    overlayWindow?.show();
    overlayWindow?.focus();
    overlayWindow?.webContents.send("overlay-shown");
  };
  if (overlayWindow.webContents.isLoading()) {
    overlayWindow.once("ready-to-show", reveal);
  } else {
    reveal();
  }
}

function toggleOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
    showOverlay();
    return;
  }
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    showOverlay();
  }
}

function registerOverlayHotkeys(): void {
  // Register BOTH bindings when available. Some fullscreen games intercept
  // one of them at a low level (e.g. Ctrl+Shift+Space), so giving the user
  // two ways in means they're never stranded without a way to summon the
  // overlay.
  globalShortcut.register(OVERLAY_HOTKEY_PRIMARY, toggleOverlay);
  globalShortcut.register(OVERLAY_HOTKEY_FALLBACK, toggleOverlay);
}

process.on("uncaughtException", (err) => {
  appendServerLog(`[main] uncaughtException: ${err.stack ?? String(err)}\n`);
  if (app.isReady()) showStartupFailureDialog(`uncaughtException: ${err.message}`);
});
process.on("unhandledRejection", (reason) => {
  appendServerLog(`[main] unhandledRejection: ${String(reason)}\n`);
});

// Clerk's OAuth callback lands on the hosted proxy host
// (game-companion-ai.replit.app) and sets cookies scoped there. Our app
// runs at http://127.0.0.1:8765, so document.cookie at that origin can't
// see them and Clerk reports "signed out". Mirror Clerk-related cookies
// from the hosted proxy host onto the local origin inside Electron's
// shared cookie store so the local app sees the session.
function installClerkCookieMirror(): void {
  const cookies = session.defaultSession.cookies;
  const PROXY_HOST_SUFFIX = "game-companion-ai.replit.app";
  const LOCAL_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
  // Clerk cookies: __client, __session, __client_uat, __clerk_db_jwt,
  // and any __refresh_* / __session_* variants. Mirror anything that
  // looks Clerk-shaped so we don't have to chase new names.
  const isClerkCookie = (name: string): boolean =>
    name.startsWith("__client") ||
    name.startsWith("__session") ||
    name.startsWith("__refresh") ||
    name.startsWith("__clerk");

  const mirrorCookie = async (
    cookie: Electron.Cookie,
    cause: string,
    removed: boolean,
  ): Promise<void> => {
    if (!isClerkCookie(cookie.name)) return;
    const domain = cookie.domain ?? "";
    if (!domain.endsWith(PROXY_HOST_SUFFIX)) return;
    try {
      if (removed) {
        // Chromium fires `removed=true` with cause="overwrite" whenever the
        // same cookie is re-set (e.g. once for ".game-companion-ai.replit.app"
        // and once for "game-companion-ai.replit.app"). If we mirror that as
        // an actual delete on the local origin we wipe the session we just
        // installed. Only mirror genuine removals.
        if (cause !== "explicit" && cause !== "expired") {
          return;
        }
        await cookies.remove(LOCAL_URL, cookie.name);
        appendServerLog(
          `[main] clerk cookie mirror: removed ${cookie.name} on local (cause=${cause})\n`,
        );
        return;
      }
      await cookies.set({
        url: LOCAL_URL,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || "/",
        httpOnly: cookie.httpOnly,
        // http://127.0.0.1 cannot accept Secure cookies; force off.
        secure: false,
        // SameSite=None requires Secure; downgrade to Lax for localhost.
        sameSite: cookie.sameSite === "no_restriction" ? "lax" : cookie.sameSite,
        expirationDate: cookie.expirationDate,
      });
      appendServerLog(
        `[main] clerk cookie mirror: set ${cookie.name} on local (from ${domain})\n`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(
        `[main] clerk cookie mirror: failed for ${cookie.name}: ${msg}\n`,
      );
    }
  };

  // One-shot: copy any cookies already in the store (re-launch case).
  void syncAllClerkCookiesFromProxy();

  // Live: mirror every future change.
  cookies.on("changed", (_evt, cookie, cause, removed) => {
    void mirrorCookie(cookie, cause, removed);
  });
}

// Bulk pull: snapshot every Clerk cookie currently scoped to the proxy
// host and re-set it on the local origin. Used at startup and after the
// OAuth round-trip lands back on http://127.0.0.1:8765 — at that moment
// the per-event listener has only seen Set-Cookie for __client (the only
// header in the final callback response), but clerk-js on the local
// page needs __client_uat* and __session* to recognize the user as
// signed in. Pulling everything in one shot guarantees a coherent snap-
// shot regardless of which individual events fired or were missed.
async function syncAllClerkCookiesFromProxy(): Promise<void> {
  const cookies = session.defaultSession.cookies;
  const PROXY_HOST_SUFFIX = "game-companion-ai.replit.app";
  const LOCAL_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
  const isClerkCookie = (name: string): boolean =>
    name.startsWith("__client") ||
    name.startsWith("__session") ||
    name.startsWith("__refresh") ||
    name.startsWith("__clerk");
  try {
    const existing = await cookies.get({ domain: PROXY_HOST_SUFFIX });
    let synced = 0;
    for (const c of existing) {
      if (!isClerkCookie(c.name)) continue;
      try {
        await cookies.set({
          url: LOCAL_URL,
          name: c.name,
          value: c.value,
          path: c.path || "/",
          httpOnly: c.httpOnly,
          secure: false,
          sameSite:
            c.sameSite === "no_restriction" ? "lax" : c.sameSite,
          expirationDate: c.expirationDate,
        });
        synced++;
      } catch {
        // Skip individual failures; continue the rest of the snapshot.
      }
    }
    appendServerLog(
      `[main] clerk cookie mirror: full sync copied ${synced} cookies to local\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendServerLog(`[main] clerk cookie mirror: full sync failed: ${msg}\n`);
  }
}

app.whenReady().then(() => {
  setupLogFile();
  // One-time cache eviction: v2.0.20 forwarded a 307 HTML response for
  // /api/__clerk/npm/.../clerk.browser.js verbatim, and the browser
  // cached that HTML body. On subsequent launches the cached entry
  // satisfied conditional requests with a 304, the script tag re-loaded
  // the HTML, and clerk-js refused to initialize with "Unexpected
  // token <" → failed_to_load_clerk_js → every authed route 401s. The
  // server-side fix shipped in v2.0.21+ never gets a chance to run
  // unless the poisoned cache entry is evicted. Clear it on startup;
  // it's a one-time cost on each launch and trivially small for an
  // Electron app of this size.
  void session.defaultSession.clearCache().catch((err) => {
    appendServerLog(
      `[main] clearCache failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  });
  installClerkCookieMirror();
  startServer()
    .then(() => {
      createWindow();
      createOverlayWindow();
      registerOverlayHotkeys();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(`[main] startServer failed: ${msg}\n`);
      showStartupFailureDialog(msg);
      app.quit();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// If the user launches Unstuck while it's already running, focus the existing
// window instead of letting a second copy try (and fail) to bind the port.
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

function killServerProcess(): void {
  if (!serverProcess) return;
  const pid = serverProcess.pid;
  try {
    serverProcess.kill();
  } catch {
    // ignore
  }
  // Belt-and-suspenders: on Windows, utilityProcess.kill() can return before
  // the child actually dies, leaving the server bound to its port and
  // blocking the next launch. Tree-kill the PID synchronously as a fallback
  // so all spawned children die too.
  if (typeof pid === "number" && pid > 0) {
    if (process.platform === "win32") {
      try {
        // /F = force, /T = whole process tree
        execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        // ignore — process already gone
      }
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  }
  serverProcess = null;
}

app.on("before-quit", () => {
  killServerProcess();
});

// Last-ditch cleanup if the app exits via an uncaught error path that
// bypasses before-quit.
process.on("exit", () => {
  killServerProcess();
});

ipcMain.handle("capture-screenshot", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (sources.length === 0) throw new Error("No screen sources found");
  const dataUrl = sources[0].thumbnail.toDataURL();
  return dataUrl;
});

ipcMain.handle("get-last-game-screenshot", () => {
  return lastGameScreenshot;
});

ipcMain.handle("toggle-always-on-top", () => {
  if (mainWindow) {
    const next = !mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(next, "screen-saver");
    return next;
  }
  return false;
});

ipcMain.handle("get-always-on-top", () => {
  return mainWindow?.isAlwaysOnTop() ?? false;
});

ipcMain.handle("set-always-on-top", (_event, value: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value, "screen-saver");
    return true;
  }
  return false;
});

// ── Overlay IPC ─────────────────────────────────────────────────────────────

ipcMain.handle("overlay-hide", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
    return true;
  }
  return false;
});

ipcMain.handle("overlay-open-main", () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return true;
  }
  return false;
});

ipcMain.handle("overlay-get-hotkey", () => {
  // Report whichever binding actually registered, so the UI can show the
  // correct hint text.
  if (globalShortcut.isRegistered(OVERLAY_HOTKEY_PRIMARY)) {
    return OVERLAY_HOTKEY_PRIMARY;
  }
  if (globalShortcut.isRegistered(OVERLAY_HOTKEY_FALLBACK)) {
    return OVERLAY_HOTKEY_FALLBACK;
  }
  return null;
});
