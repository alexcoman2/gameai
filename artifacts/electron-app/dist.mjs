/**
 * Packaging script for AI Gaming Companion Electron app.
 *
 * On Windows: Produces a full NSIS installer (.exe) via electron-builder.
 * On Linux/macOS: Produces a portable ZIP archive of the unpacked Windows app.
 * electron-builder creates the win-unpacked directory successfully on Linux, but
 * the final NSIS step requires wine. The zip is extracted on Windows and run directly.
 *
 * Usage:
 *   node dist.mjs            — auto-detects platform
 *   node dist.mjs --win      — force NSIS installer (requires Windows or wine)
 */

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function accessAsync(p) {
  return fsp.access(p);
}

function runBuilder(args, env) {
  return new Promise((resolve) => {
    const builderBin = path.join(
      __dirname,
      "node_modules/.bin/electron-builder"
    );
    const proc = spawn(builderBin, args, {
      env,
      stdio: "inherit",
      shell: true,
    });
    proc.on("exit", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      console.error("Failed to spawn electron-builder:", err.message);
      resolve(1);
    });
  });
}

async function dirExists(p) {
  try {
    await accessAsync(p);
    return true;
  } catch {
    return false;
  }
}

async function zipDirectory(sourceDir, outputFile) {
  const { execFile } = await import("node:child_process");
  const execFileAsync = promisify(execFile);

  // Try system zip first
  try {
    await execFileAsync("zip", ["-r", outputFile, "."], { cwd: sourceDir });
    return;
  } catch {
    // zip not available, fall through
  }

  // Use Node.js streams as a fallback (tar.gz)
  const tarOutput = outputFile.replace(/\.zip$/, ".tar.gz");
  try {
    await execFileAsync("tar", ["-czf", tarOutput, "-C", sourceDir, "."], {
      cwd: sourceDir,
    });
    console.log(`  (Created tar.gz archive instead of zip)`);
    return;
  } catch {
    // tar not available
  }

  throw new Error(
    "Neither zip nor tar is available. Install zip or tar to create the archive."
  );
}

async function main() {
  const args = process.argv.slice(2);
  const forceWin = args.includes("--win");
  const isWindows = os.platform() === "win32";

  const distReleaseDir = path.join(__dirname, "dist-release");
  const winUnpackedDir = path.join(distReleaseDir, "win-unpacked");

  await fsp.mkdir(distReleaseDir, { recursive: true });

  const builderEnv = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  };

  if (forceWin || isWindows) {
    console.log("Building Windows NSIS installer...");
    const code = await runBuilder(["--win", "--x64"], builderEnv);
    if (code === 0) {
      console.log("\n✓ Windows installer created in dist-release/");
    } else {
      console.error("\n✗ electron-builder failed (exit code " + code + ")");
      process.exit(code);
    }
    return;
  }

  // On Linux/macOS: build the win-unpacked folder then zip it
  console.log(
    "Building Windows app (portable mode — NSIS requires wine on Linux)..."
  );
  const code = await runBuilder(["--win", "--x64", "--dir"], builderEnv);

  const unpacked = await dirExists(winUnpackedDir);
  if (!unpacked) {
    // Try without --dir flag (some versions ignore it)
    console.log("Retrying without --dir flag...");
    await runBuilder(["--win", "--x64"], {
      ...builderEnv,
      // The full build fails at signing, but win-unpacked is still created
    });
  }

  if (!(await dirExists(winUnpackedDir))) {
    console.error("✗ win-unpacked directory was not created. Packaging failed.");
    process.exit(1);
  }

  const zipOutput = path.join(
    distReleaseDir,
    "AI-Gaming-Companion-win32-x64.zip"
  );
  console.log(`\nCreating portable ZIP archive: ${zipOutput}`);

  try {
    await zipDirectory(winUnpackedDir, zipOutput);
    console.log("\n✓ Portable Windows app created:");
    console.log("  " + zipOutput);
    console.log(
      "\nTo install on Windows: extract the ZIP and run 'AI Gaming Companion.exe'"
    );
    console.log(
      "To build a proper NSIS installer: run this script on Windows.\n"
    );
  } catch (err) {
    console.error("✗ Failed to create ZIP:", err.message);
    console.log(
      "\nThe unpacked Windows app is ready at:\n  " + winUnpackedDir
    );
    console.log(
      "Manually compress it to create a distributable portable app.\n"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
