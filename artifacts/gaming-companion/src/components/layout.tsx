import { Link, useLocation } from "wouter";
import { Settings, MessageSquare, Crosshair, LogIn, LogOut, Crown, Activity, Shield } from "lucide-react";
import { Show, useUser, useClerk } from "@clerk/react";
import { useDetectGame, getDetectGameQueryKey } from "@workspace/api-client-react";
import { useGameContext } from "@/context/game-context";
import { useMe } from "@/hooks/use-me";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AuthPill() {
  const { user } = useUser();
  const { signOut } = useClerk();
  return (
    <>
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="flex items-center gap-2 px-3 py-2 border border-primary/40 text-primary text-xs font-mono uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <LogIn className="w-4 h-4" />
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider hidden sm:inline">
            {user?.primaryEmailAddress?.emailAddress ?? user?.id?.slice(0, 8)}
          </span>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
            title="Sign out"
            className="p-2 border border-transparent text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </Show>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { effectiveGameName } = useGameContext();
  const { me } = useMe();

  // Game detection + the Settings page rely on Electron-only features
  // (process scanning, screenshot capture, hotkeys, overlay window). On the
  // public website neither makes sense — game detection would always say
  // "AWAITING TARGET" and Settings exposes desktop-only toggles. Hide both
  // when we're not running inside the desktop app.
  const isElectron = !!(window as Window & {
    electronAPI?: { isElectron?: boolean };
  }).electronAPI?.isElectron;

  const { data: gameDetection, isLoading: isDetecting } = useDetectGame({
    query: {
      refetchInterval: 10000,
      queryKey: getDetectGameQueryKey(),
      enabled: isElectron,
    }
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* HUD Header — fixed at top because the page itself doesn't scroll
          (only the chat list inside <main> does), so we don't need sticky. */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 border border-primary/30 bg-primary/10 text-primary">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono tracking-wider text-primary">UNSTUCK</h1>
            {isElectron && (
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mt-1">
              <span>STATUS:</span>
              {isDetecting ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-yellow-400">DETECTING...</span>
                </div>
              ) : gameDetection?.detected ? (
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    gameDetection.confidence === 'high' ? 'bg-primary animate-pulse' :
                    gameDetection.confidence === 'medium' ? 'bg-yellow-400' : 'bg-gray-500'
                  }`} />
                  <span className="text-foreground">{gameDetection.gameName || gameDetection.processName}</span>
                  {gameDetection.source && (
                    <span
                      className={`px-1 py-px text-[9px] border leading-none ${
                        gameDetection.source === 'local'
                          ? 'text-emerald-400/80 border-emerald-400/30'
                          : gameDetection.source === 'steam-api'
                          ? 'text-sky-400/80 border-sky-400/30'
                          : 'text-blue-400/80 border-blue-400/30'
                      }`}
                      title={
                        gameDetection.source === 'local'
                          ? 'Identified from local game process table'
                          : gameDetection.source === 'steam-api'
                          ? 'Identified via Steam Web API'
                          : 'Identified via Steam Store search'
                      }
                    >
                      {gameDetection.source === 'local'
                        ? 'LOCAL'
                        : gameDetection.source === 'steam-api'
                        ? 'STEAM API'
                        : 'STEAM'}
                    </span>
                  )}
                </div>
              ) : effectiveGameName ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-foreground">{effectiveGameName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full" />
                  <span>AWAITING TARGET</span>
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <Link href="/" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <MessageSquare className="w-5 h-5" />
          </Link>
          <Link href="/usage" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/usage" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} title="Usage & limits">
            <Activity className="w-5 h-5" />
          </Link>
          <Link href="/upgrade" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/upgrade" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} title="Plans & billing">
            <Crown className="w-5 h-5" />
          </Link>
          {isElectron && (
            <Link href="/settings" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/settings" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
              <Settings className="w-5 h-5" />
            </Link>
          )}
          {me?.isAdmin && (
            <Link
              href="/admin/usage"
              title="Admin · cross-user usage"
              className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/admin/usage" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              <Shield className="w-5 h-5" />
            </Link>
          )}
          <div className="w-px h-6 bg-border" />
          <AuthPill />
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        {children}
      </main>

      {/* Footer — required for Paddle live-mode verification (must surface
          Terms / Privacy / Refund links from every page on the public site). */}
      <footer className="border-t border-border bg-card/50 px-6 py-4 text-[11px] font-mono uppercase tracking-widest text-muted-foreground flex flex-wrap items-center justify-between gap-3 shrink-0">
        <span>© {new Date().getFullYear()} Unstuck</span>
        <nav className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/about" className="hover:text-primary">About</Link>
          <Link href="/library" className="hover:text-primary">Library</Link>
          <Link href="/pricing" className="hover:text-primary">Pricing</Link>
          <Link href="/legal/terms" className="hover:text-primary">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-primary">Privacy</Link>
          <Link href="/legal/refund" className="hover:text-primary">Refunds</Link>
        </nav>
      </footer>
    </div>
  );
}
