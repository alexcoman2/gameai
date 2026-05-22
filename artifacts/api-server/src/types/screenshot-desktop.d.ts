declare module "screenshot-desktop" {
  interface ScreenshotOptions {
    screen?: number | string;
    filename?: string;
    format?: "png" | "jpg";
  }
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  export = screenshot;
}
