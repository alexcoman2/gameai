export interface ScreenshotState {
  imageData: string | null;
  capturedAt: string | null;
  available: boolean;
}

let latestScreenshot: ScreenshotState = {
  imageData: null,
  capturedAt: null,
  available: false,
};

let autoCapureTimer: ReturnType<typeof setInterval> | null = null;

export function getLatestScreenshot(): ScreenshotState {
  return latestScreenshot;
}

export function setLatestScreenshot(data: string, timestamp: string): void {
  latestScreenshot = {
    imageData: data,
    capturedAt: timestamp,
    available: true,
  };
}

export function startAutoCapture(intervalSeconds: number): void {
  if (autoCapureTimer) {
    clearInterval(autoCapureTimer);
    autoCapureTimer = null;
  }

  autoCapureTimer = setInterval(async () => {
    try {
      const screenshot = await import("screenshot-desktop");
      const imgBuffer = await screenshot.default();
      const base64 = imgBuffer.toString("base64");
      setLatestScreenshot(base64, new Date().toISOString());
    } catch {
      // Silent fail - screenshot may not work in all environments
    }
  }, intervalSeconds * 1000);
}

export function stopAutoCapture(): void {
  if (autoCapureTimer) {
    clearInterval(autoCapureTimer);
    autoCapureTimer = null;
  }
}
