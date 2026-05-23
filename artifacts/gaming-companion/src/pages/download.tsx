import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Download,
  Monitor,
  Eye,
  Mic,
  Zap,
  Shield,
  Gamepad2,
} from "lucide-react";
import { SITE_CONFIG } from "@/lib/site-config";

// Where the Windows installer lives. Override at build time with
// VITE_INSTALLER_URL — e.g. a GitHub Releases asset URL once the
// app is published there. Default points at a static file under
// /public/downloads/ so dropping the .exe in that folder Just Works.
const INSTALLER_URL =
  (import.meta.env.VITE_INSTALLER_URL as string | undefined) ??
  "/downloads/Unstuck-Setup.exe";

// Shown next to the download button. Override at build time so the
// landing page reflects whatever build the installer was cut from
// without touching code.
const INSTALLER_VERSION =
  (import.meta.env.VITE_INSTALLER_VERSION as string | undefined) ?? "2.0.35";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: Eye,
    title: "Watch Mode",
    body:
      "Unstuck quietly observes your screen every few seconds and proactively offers tips when you stall — no need to ask.",
  },
  {
    icon: Gamepad2,
    title: "Game-aware",
    body:
      "Detects what you're playing from window titles and on-screen cues, then tailors every answer to that game's mechanics.",
  },
  {
    icon: Mic,
    title: "Voice in and out",
    body:
      "Push-to-talk through the overlay and natural spoken replies, so you never have to look away from your game.",
  },
  {
    icon: Zap,
    title: "Always-on overlay",
    body:
      "A frameless overlay window that floats above fullscreen games and stays hidden until you summon it with a hotkey.",
  },
  {
    icon: Shield,
    title: "Private by default",
    body:
      "Screenshots are sent only when you ask a question. No background telemetry of your gameplay, ever.",
  },
  {
    icon: Monitor,
    title: "Light on your rig",
    body:
      "Idle CPU usage measured in single digits. Won't tank your frame rate during a clutch moment.",
  },
];

export function DownloadPage() {
  // Tiny detection so Mac/Linux visitors get a friendlier message than
  // a Windows .exe staring them in the face. We still let them download
  // it — sometimes people queue installers for their gaming PC from a
  // different machine.
  const [platform, setPlatform] = useState<"windows" | "mac" | "linux" | "other">("other");
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) setPlatform("windows");
    else if (ua.includes("mac")) setPlatform("mac");
    else if (ua.includes("linux") || ua.includes("x11")) setPlatform("linux");
    else setPlatform("other");
  }, []);

  return (
    <div className="flex-1 w-full">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 max-w-5xl mx-auto w-full text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-primary">
          {SITE_CONFIG.productName} for Windows
        </p>
        <h1 className="mt-3 text-5xl md:text-6xl font-bold font-mono tracking-wider text-foreground">
          Get unstuck.
          <br />
          <span className="text-primary">Without leaving the game.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          An AI gaming companion that watches your screen and answers
          questions out loud — boss fights, puzzles, builds, quests,
          anything. Runs as a quiet overlay you summon with a hotkey.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href={INSTALLER_URL}
            download
            data-testid="button-download-installer"
            className="inline-flex items-center justify-center gap-3 rounded-md bg-primary px-8 py-4 text-base font-mono uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            <Download className="h-5 w-5" />
            Download for Windows
          </a>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            v{INSTALLER_VERSION} · 64-bit · ~120 MB
          </p>
          {platform === "mac" && (
            <p className="mt-2 text-xs text-amber-400/90">
              Heads up — you're on macOS. The installer is Windows-only for
              now. A Mac build is on the roadmap.
            </p>
          )}
          {platform === "linux" && (
            <p className="mt-2 text-xs text-amber-400/90">
              Heads up — you're on Linux. The installer is Windows-only for
              now. A Linux build hasn't been prioritized yet — let us know if
              you'd use one.
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          <Link href="/pricing" className="hover:text-primary">
            Pricing
          </Link>
          <span>·</span>
          <Link href="/library" className="hover:text-primary">
            Supported games
          </Link>
          <span>·</span>
          <Link href="/about" className="hover:text-primary">
            About
          </Link>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────── */}
      <section className="border-t border-border/40 bg-card/30 px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-xs font-mono uppercase tracking-widest text-primary">
            What you get
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureTile key={f.title} feature={f} />
            ))}
          </div>
        </div>
      </section>

      {/* ── How to install ────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs font-mono uppercase tracking-widest text-primary">
            Install in 30 seconds
          </h2>
          <ol className="mt-6 space-y-4 text-sm text-foreground/90">
            <Step
              n={1}
              title="Download the installer"
              body="Hit the button above. Windows might warn you about an unverified publisher — click 'More info' then 'Run anyway'."
            />
            <Step
              n={2}
              title="Run Unstuck-Setup.exe"
              body="Standard wizard. Installs to your user profile, no admin password needed. Adds a Start Menu shortcut and (optionally) launches at login."
            />
            <Step
              n={3}
              title="Sign in"
              body="On first launch you'll be asked to sign in. New accounts start on the free tier — 25 chats and 30 minutes of Watch Mode per month, no card required."
            />
            <Step
              n={4}
              title="Press your hotkey in-game"
              body="Default is Ctrl+Shift+U to show the overlay, Ctrl+Shift+Space for push-to-talk. Both rebindable in Settings."
            />
          </ol>
        </div>
      </section>

      {/* ── System requirements ───────────────────────────────────────── */}
      <section className="border-t border-border/40 bg-card/30 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs font-mono uppercase tracking-widest text-primary">
            System requirements
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2 text-sm">
            <ReqBlock
              label="Minimum"
              items={[
                "Windows 10 (64-bit) or newer",
                "4 GB RAM free",
                "300 MB disk space",
                "Always-on internet connection",
              ]}
            />
            <ReqBlock
              label="Recommended"
              items={[
                "Windows 11 (64-bit)",
                "8 GB+ RAM free during gaming",
                "Dedicated GPU (any modern card)",
                "Microphone for push-to-talk",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs font-mono uppercase tracking-widest text-primary">
            Common questions
          </h2>
          <div className="mt-6 space-y-6 text-sm">
            <Faq
              q="Is Unstuck a cheat? Will I get banned?"
              a="No. Unstuck only reads pixels from your own screen — same thing your monitor does. It never injects into the game process, reads memory, or sends inputs. That said, every multiplayer game has its own rules; check yours before using it competitively."
            />
            <Faq
              q="Does it work offline?"
              a="No. The AI runs in the cloud, so Unstuck needs an internet connection. Game detection and the overlay still work without one, but you won't be able to ask questions."
            />
            <Faq
              q="What about my data?"
              a="Screenshots are sent only when you ask a question, never in the background. We don't sell data, don't train models on your gameplay, and you can delete your account at any time from Settings."
            />
            <Faq
              q="Why does Windows warn about the publisher?"
              a="Code-signing certificates cost money and we haven't paid for one yet. The installer is built from the open repo so you can verify what it does. Once we hit a revenue threshold we'll buy a cert and the warning will go away."
            />
            <Faq
              q="Mac / Linux build?"
              a="Windows-first because that's where most PC gaming happens. Mac is on the roadmap; Linux will follow if there's demand."
            />
          </div>
        </div>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────────── */}
      <section className="border-t border-border/40 px-6 py-20 text-center">
        <h2 className="text-3xl font-bold font-mono tracking-wider">
          Ready to stop alt-tabbing?
        </h2>
        <a
          href={INSTALLER_URL}
          download
          className="mt-8 inline-flex items-center justify-center gap-3 rounded-md bg-primary px-8 py-4 text-base font-mono uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
        >
          <Download className="h-5 w-5" />
          Download for Windows
        </a>
        <p className="mt-4 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          v{INSTALLER_VERSION} · Free to try · No credit card
        </p>
      </section>
    </div>
  );
}

function FeatureTile({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="mt-3 text-sm font-mono uppercase tracking-wider text-primary">
        {feature.title}
      </h3>
      <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
        {feature.body}
      </p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-mono text-primary">
        {n}
      </span>
      <div>
        <div className="font-mono uppercase tracking-wider text-sm text-foreground">
          {title}
        </div>
        <p className="mt-1 text-sm text-foreground/80 leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

function ReqBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-5">
      <div className="text-xs font-mono uppercase tracking-widest text-primary">
        {label}
      </div>
      <ul className="mt-3 space-y-1 text-foreground/85">
        {items.map((it) => (
          <li key={it}>• {it}</li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <div className="font-mono uppercase tracking-wider text-sm text-foreground">
        {q}
      </div>
      <p className="mt-2 text-foreground/80 leading-relaxed">{a}</p>
    </div>
  );
}
