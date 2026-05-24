# Releasing the Unstuck Windows app

The hosted web app at `game-companion-ai.replit.app` updates automatically on
every Replit deploy. The Windows `.exe` is a separate bundle that has to be
rebuilt and re-shipped any time the **frontend** (gaming-companion) or the
**Electron main/preload** code changes.

Backend-only changes (anything under `artifacts/api-server`) reach existing
Electron users immediately because the desktop app proxies API calls to the
hosted server — no rebuild needed.

## When you need to rebuild the installer

Rebuild if you changed any of:

- `artifacts/gaming-companion/**` (renderer / React app)
- `artifacts/electron-app/**` (main process, preload, overlay)
- shared packages consumed by either of the above (`lib/**`, `packages/**`)
- `VITE_*` environment values baked into the renderer at build time

Skip the rebuild if you only changed `artifacts/api-server/**` or pure docs.

## Release checklist

1. **Bump the version** in `artifacts/electron-app/package.json`
   (e.g. `2.0.48` → `2.0.49`). The auto-updater compares this string, so
   forgetting to bump means clients never pull the new build.
2. **Pull latest `main`** on the Windows build machine.
3. **Set the Clerk publishable key** in the shell — the build refuses to run
   without it, because a missing key produces a silently-blank renderer:
   ```powershell
   $env:VITE_CLERK_PUBLISHABLE_KEY = "pk_live_..."
   ```
   (Use the same value as production — the `pk_live_…` from your Clerk
   dashboard for the Unstuck tenant.)
4. **Install deps & build everything** from the workspace root:
   ```powershell
   pnpm install
   pnpm --filter @workspace/electron-app run build-all
   ```
   `build-all` runs the full pipeline: api-server build → React frontend
   build → Electron main/preload bundle.
5. **Package the installer**:
   ```powershell
   pnpm --filter @workspace/electron-app run dist:win
   ```
   Output lands in `artifacts/electron-app/dist-release/`:
   - `Unstuck-win64-portable.zip` — portable build, no install required
   - any signed `.exe` installer if `electron-builder.yml` is configured for it
6. **Smoke-test the new build locally** before publishing:
   - Launch the unpacked exe from `dist-release/win-unpacked/`.
   - Sign in, open Settings → confirm the new Billing & Subscription card
     and Danger Zone are visible.
   - If you have a test PayPal sub, click Cancel and confirm the toast is
     a friendly message (never raw JSON).
7. **Upload** `Unstuck-win64-portable.zip` (and any installer) to your
   release host — GitHub Releases, your download CDN, or wherever the
   auto-updater feed reads from.
8. **Tag the release** in git: `git tag v2.0.49 && git push --tags`.

## Why the Replit container can't build the `.exe`

`electron-builder` needs Windows tooling (and a code-signing cert) to produce
a real signed Windows installer. The Linux container here can build the JS
bundles fine, but the final `.exe` step must run on Windows. Do that on your
own machine or a Windows CI runner.

## What's in the current release vs. shipped client

| Change                                            | Hosted web | Electron `.exe` |
| ------------------------------------------------- | ---------- | --------------- |
| API: DELETE `/api/me`, sanitized PayPal errors    | live now   | live now (proxy) |
| Settings → Billing & Subscription card            | live now   | needs rebuild   |
| Settings → Danger Zone (delete account)           | live now   | needs rebuild   |
| `isSubscriptionActive` gating on Upgrade button   | live now   | needs rebuild   |
| Legal page PayPal-primary language                | live now   | needs rebuild   |

Anything in the "needs rebuild" rows will not appear in your installed
desktop app until you ship `2.0.48`.
