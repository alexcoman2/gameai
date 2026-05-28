import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  toggleAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke("toggle-always-on-top"),
  getAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke("get-always-on-top"),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke("set-always-on-top", value),
  captureScreenshot: (): Promise<string> =>
    ipcRenderer.invoke("capture-screenshot"),
  getLastGameScreenshot: (): Promise<string | null> =>
    ipcRenderer.invoke("get-last-game-screenshot"),

  // Overlay-specific IPC. Available in every renderer but only meaningful
  // when running inside the overlay BrowserWindow.
  overlayHide: (): Promise<boolean> => ipcRenderer.invoke("overlay-hide"),
  overlayOpenMain: (): Promise<boolean> =>
    ipcRenderer.invoke("overlay-open-main"),
  overlayGetHotkey: (): Promise<string | null> =>
    ipcRenderer.invoke("overlay-get-hotkey"),
  overlayGetPttHotkey: (): Promise<string | null> =>
    ipcRenderer.invoke("overlay-get-ptt-hotkey"),
  overlayGetHandsFreeHotkey: (): Promise<string | null> =>
    ipcRenderer.invoke("overlay-get-handsfree-hotkey"),
  onOverlayShown: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("overlay-shown", listener);
    return () => ipcRenderer.removeListener("overlay-shown", listener);
  },
  onPttToggle: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("overlay-ptt-toggle", listener);
    // Tell main that a listener is live — main may have queued PTT
    // presses captured before the renderer mounted.
    ipcRenderer.send("overlay-ptt-ready");
    return () => ipcRenderer.removeListener("overlay-ptt-toggle", listener);
  },
  onHandsFreeToggle: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("overlay-handsfree-toggle", listener);
    ipcRenderer.send("overlay-handsfree-ready");
    return () =>
      ipcRenderer.removeListener("overlay-handsfree-toggle", listener);
  },

  // Fired by the main process when the mirrored __session cookie on the
  // local origin transitions (sign-in or sign-out). The overlay listens
  // and hard-reloads so clerk-js re-initializes against the new cookie
  // state instead of holding its stale in-memory snapshot.
  onAuthChanged: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("auth-changed", listener);
    return () => ipcRenderer.removeListener("auth-changed", listener);
  },

  // Open a URL in the user's default OS browser instead of inside the
  // Electron BrowserWindow. Used for PayPal checkout so the user gets
  // their real browser's WebAuthn provider (Windows Hello, saved cards,
  // etc.) instead of Chromium's "insert USB security key" fallback.
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("open-external", url),

  // Authoritative view of the Clerk cookie jar from the main process.
  // The renderer can't see HttpOnly cookies like __session via
  // document.cookie, so the overlay's auto-reload self-heal asks main.
  getCookieAuthState: (): Promise<{
    hasSession: boolean;
    hasClient: boolean;
    uat: string | null;
  }> => ipcRenderer.invoke("get-cookie-auth-state"),

  isElectron: true as const,
});
