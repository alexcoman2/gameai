import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import * as http from "http";
import * as path from "path";

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

async function startServer(): Promise<void> {
  const { serverEntry, staticDir } = getResourcePaths();

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

  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server process exited with code ${code}`);
    }
  });

  await waitForServer(SERVER_PORT);
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

app.whenReady().then(() => {
  startServer()
    .then(() => {
      createWindow();
      createOverlayWindow();
      registerOverlayHotkeys();
    })
    .catch((err: unknown) => {
      console.error("Failed to start backend server:", err);
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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
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
