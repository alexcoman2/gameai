import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import * as http from "http";
import * as path from "path";

const SERVER_PORT = 8765;
let mainWindow: BrowserWindow | null = null;
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
      const req = http.get(`http://localhost:${port}/api/healthz`, (res) => {
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
      // Points to the hosted Replit API server. The local server acts as a
      // proxy for chat and never needs an Anthropic API key.
      NEXUS_LINK_API_URL:
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
    title: "AI Gaming Companion",
    show: false,
    backgroundColor: "#0f0f0f",
    autoHideMenuBar: true,
  });

  void mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Background capture: when the user alt-tabs to NEXUS_LINK, capture the
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

app.whenReady().then(() => {
  startServer()
    .then(() => {
      createWindow();
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
