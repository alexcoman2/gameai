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
  onOverlayShown: (cb: () => void): (() => void) => {
    const listener = () => cb();
    ipcRenderer.on("overlay-shown", listener);
    return () => ipcRenderer.removeListener("overlay-shown", listener);
  },

  isElectron: true as const,
});
