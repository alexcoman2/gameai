/**
 * Full build pipeline for the Electron desktop app.
 * Builds all dependencies (api-server + frontend) then bundles the Electron app.
 *
 * Run from the workspace root:
 *   pnpm --filter @workspace/electron-app run build-all
 *
 * Or from the electron-app directory:
 *   node pipeline.mjs
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");

// On Windows, pnpm is installed as pnpm.cmd — use shell:true so the OS
// resolves .cmd/.bat files correctly on all platforms.
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
      ...opts,
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command failed with exit code ${code}: ${cmd} ${args.join(" ")}`
          )
        );
      }
    });
    proc.on("error", reject);
  });
}

async function main() {
  console.log("\n=== Step 1: Build API server ===");
  await run(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "build"],
    { cwd: workspaceRoot }
  );

  console.log("\n=== Step 2: Build React frontend ===");
  await run(
    "pnpm",
    ["--filter", "@workspace/gaming-companion", "run", "build"],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        PORT: "20618",
        BASE_PATH: "/",
        NODE_ENV: "production",
      },
    }
  );

  console.log("\n=== Step 3: Build Electron main process ===");
  await run("node", ["build.mjs"], { cwd: __dirname });

  console.log("\n✓ All build steps complete.\n");
  console.log("Run `pnpm dist` (or `node dist.mjs`) to package the app.");
}

main().catch((err) => {
  console.error("\n✗ Build failed:", err.message);
  process.exit(1);
});
