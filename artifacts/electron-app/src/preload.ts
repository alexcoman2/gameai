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

  // Open a URL in the user's default OS browser instead of inside the
  // Electron BrowserWindow. Used for PayPal checkout so the user gets
  // their real browser's WebAuthn provider (Windows Hello, saved cards,
  // etc.) instead of Chromium's "insert USB security key" fallback.
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("open-external", url),

  isElectron: true as const,
});
