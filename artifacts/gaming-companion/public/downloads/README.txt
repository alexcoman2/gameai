Drop the built Windows installer here as `Unstuck-Setup.exe`.

The /download landing page links to /downloads/Unstuck-Setup.exe by
default. If you'd rather host the installer elsewhere (GitHub Releases,
S3, Cloudflare R2, etc.), set VITE_INSTALLER_URL at build time to that
URL and the page will link there instead — no code change needed.

Also bump VITE_INSTALLER_VERSION so the "v2.0.35" label on the page
reflects whatever build the installer was cut from.
