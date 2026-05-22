import { Link, useLocation } from "wouter";
import { Settings, MessageSquare, Crosshair } from "lucide-react";
import { useDetectGame, getDetectGameQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

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
            <h1 className="text-xl font-bold font-mono tracking-wider text-primary">NEXUS_LINK</h1>
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
          <Link href="/settings" className={`p-2 border transition-colors hover:bg-primary hover:text-primary-foreground ${location === "/settings" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            <Settings className="w-5 h-5" />
          </Link>
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
