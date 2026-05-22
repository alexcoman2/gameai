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
  isElectron: true as const,
});
