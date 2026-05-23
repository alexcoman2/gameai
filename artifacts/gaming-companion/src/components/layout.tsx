import { Link, useLocation } from "wouter";
import { Settings, MessageSquare, Crosshair, LogIn, LogOut, Crown } from "lucide-react";
import { Show, useUser, useClerk } from "@clerk/react";
import { useDetectGame, getDetectGameQueryKey } from "@workspace/api-client-react";
import { useGameContext } from "@/context/game-context";

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

  const { data: gameDetection, isLoading: isDetecting } = useDetectGame({
    query: {
      refetchInterval: 10000,
      queryKey: getDetectGameQueryKey(),
    }
  });

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden selection:bg-primary selection:text-primary-foreground">
      {/* HUD Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 border border-primary/30 bg-primary/10 text-primary">
            <Crosshair className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono tracking-wider text-primary">UNSTUCK</h1>
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
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <Link href="/" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <MessageSquare className="w-5 h-5" />
          </Link>
          <Link href="/upgrade" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/upgrade" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} title="Plans & billing">
            <Crown className="w-5 h-5" />
          </Link>
          <Link href="/settings" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/settings" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <Settings className="w-5 h-5" />
          </Link>
          <div className="w-px h-6 bg-border" />
          <AuthPill />
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        {children}
      </main>
    </div>
  );
}
