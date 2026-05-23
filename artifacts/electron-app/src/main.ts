import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as path from "path";

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

let SERVER_PORT = 8765;
const SERVER_PORT_MAX = 8785;
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

function findAvailablePort(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > end) {
        reject(new Error(`no free port in range ${start}-${end}`));
        return;
      }
      const tester = net.createServer();
      tester.once("error", () => tryPort(port + 1));
      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, SERVER_HOST);
    };
    tryPort(start);
  });
}

async function startServer(): Promise<void> {
  const { serverEntry, staticDir } = getResourcePaths();

  // Find a free port — handles the case where a stale server from a previous
  // launch still holds 8765.
  SERVER_PORT = await findAvailablePort(SERVER_PORT, SERVER_PORT_MAX);

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

  void mainWindow.loadURL(`http://${SERVER_HOST}:${SERVER_PORT}`);

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

app.whenReady().then(() => {
  setupLogFile();
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
