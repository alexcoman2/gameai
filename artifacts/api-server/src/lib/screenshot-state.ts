export interface ScreenshotState {
  imageData: string | null;
  capturedAt: string | null;
  available: boolean;
}

// Server-side screenshot state. Historically populated by a screenshot-desktop
// polling loop driven by autoCapture/screenshotInterval settings; that loop
// was retired when watch mode took over the "continuous frames" use case.
// The getter/setter are kept because chat.ts and the /screenshot route still
// import them. In practice the renderer now sends screenshots inline with
// each chat request (manual camera button or watchScreenshot), so the
// server-side latest is always { available: false } at runtime — chat.ts
// falls through that branch cleanly.
let latestScreenshot: ScreenshotState = {
  imageData: null,
  capturedAt: null,
  available: false,
};

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
