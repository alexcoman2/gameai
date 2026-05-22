import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDetectGame, getDetectGameQueryKey,
  useCaptureScreenshot,
  useSendChatMessage,
  useGetSettings, getGetSettingsQueryKey,
  useGetLatestScreenshot, getGetLatestScreenshotQueryKey,
  useListSessions, getListSessionsQueryKey,
  useCreateSession,
  useDeleteSession,
  useRenameSession,
  useClearSession,
  useGetSessionMessages, getGetSessionMessagesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Camera, Send, Loader2, Maximize2, X, MessageSquare,
  Plus, Trash2, Pencil, Check, MessagesSquare, ChevronRight, Pin, PinOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useChat } from "@/context/chat-context";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const queryClient = useQueryClient();
  const {
    messages, setMessages, addMessage,
    activeSessionId, setActiveSessionId,
    gameNameOverride, setGameNameOverride,
  } = useChat();

  const [input, setInput] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null);
  const [electronAutoScreenshot, setElectronAutoScreenshot] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const historyLoadedRef = useRef<Set<string>>(new Set());
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  const isElectron = !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;

  const prevHighConfGameRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as Window & { electronAPI?: { getAlwaysOnTop?: () => Promise<boolean> } }).electronAPI;
    api?.getAlwaysOnTop?.().then(setAlwaysOnTop).catch(() => {});
  }, [isElectron]);

  const handleToggleAlwaysOnTop = async () => {
    const api = (window as Window & { electronAPI?: { toggleAlwaysOnTop?: () => Promise<boolean> } }).electronAPI;
    try {
      const next = await api?.toggleAlwaysOnTop?.();
      if (typeof next === "boolean") setAlwaysOnTop(next);
    } catch {
    }
  };

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const { data: gameDetection } = useDetectGame({
    query: {
      refetchInterval: 10000,
      queryKey: getDetectGameQueryKey()
    }
  });

  const { data: latestScreenshot } = useGetLatestScreenshot({
    query: {
      refetchInterval: settings?.autoCapture ? settings.screenshotInterval * 1000 : false,
      queryKey: getGetLatestScreenshotQueryKey(),
      enabled: settings?.autoCapture === true
    }
  });

  const { data: sessions = [], isLoading: isLoadingSessions } = useListSessions({
    query: { queryKey: getListSessionsQueryKey() }
  });

  const { data: sessionMessagesData } = useGetSessionMessages(
    activeSessionId ?? "",
    {
      query: {
        enabled: !!activeSessionId,
        queryKey: getGetSessionMessagesQueryKey(activeSessionId ?? ""),
      }
    }
  );

  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();
  const renameSessionMutation = useRenameSession();
  const clearSessionMutation = useClearSession();
  const captureMutation = useCaptureScreenshot();
  const sendMutation = useSendChatMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  useEffect(() => {
    if (sessionInitialized || isLoadingSessions) return;
    // If we already have an active session (e.g. returning from Settings page),
    // just mark initialized without switching sessions.
    if (activeSessionId) {
      setSessionInitialized(true);
      return;
    }
    if (sessions.length === 0) {
      createSessionMutation.mutate(
        { data: { name: "Session 1" } },
        {
          onSuccess: (session) => {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            setActiveSessionId(session.id);
            setMessages([]);
            setSessionInitialized(true);
          }
        }
      );
    } else {
      setActiveSessionId(sessions[0].id);
      setSessionInitialized(true);
    }
  }, [isLoadingSessions, sessions, activeSessionId]);

  useEffect(() => {
    if (!sessionMessagesData || !activeSessionId) return;
    const mapped = sessionMessagesData.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
      screenshot: m.screenshot ?? null,
    }));

    const alreadyLoaded = historyLoadedRef.current.has(activeSessionId);
    if (!alreadyLoaded && mapped.length > 0) {
      historyLoadedRef.current.add(activeSessionId);
      setMessages([
        ...mapped,
        {
          id: `divider-${activeSessionId}-${Date.now()}`,
          role: "divider" as const,
          content: new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          screenshot: null,
        },
      ]);
    } else {
      setMessages(mapped);
    }
  }, [sessionMessagesData, activeSessionId]);

  const toDataUrl = (base64: string) =>
    base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;

  type ElectronAPI = {
    isElectron?: boolean;
    captureScreenshot?: () => Promise<string>;
    getAlwaysOnTop?: () => Promise<boolean>;
    toggleAlwaysOnTop?: () => Promise<boolean>;
  };
  const electronAPI = (window as Window & { electronAPI?: ElectronAPI }).electronAPI;

  // Electron auto-capture: run a timer in the frontend using desktopCapturer via IPC.
  // This replaces the server-side screenshot-desktop approach entirely.
  useEffect(() => {
    if (!isElectron || !settings?.autoCapture || !electronAPI?.captureScreenshot) return;
    const intervalMs = (settings.screenshotInterval || 30) * 1000;
    const capture = async () => {
      try {
        const dataUrl = await electronAPI.captureScreenshot!();
        if (dataUrl) setElectronAutoScreenshot(dataUrl);
      } catch {
        // Silent fail — screen capture may be denied
      }
    };
    capture(); // Capture immediately on enable
    const timer = setInterval(capture, intervalMs);
    return () => clearInterval(timer);
  }, [isElectron, settings?.autoCapture, settings?.screenshotInterval]);

  const handleCapture = async () => {
    if (isElectron && electronAPI?.captureScreenshot) {
      // Electron: use desktopCapturer via IPC — no server roundtrip needed
      try {
        const dataUrl = await electronAPI.captureScreenshot();
        if (dataUrl) {
          setPendingScreenshot(dataUrl);
          setIncludeScreenshot(true);
        }
      } catch (e) {
        console.error("Failed to capture screenshot via Electron", e);
      }
    } else {
      // Web fallback: use server-side capture endpoint
      try {
        const result = await captureMutation.mutateAsync();
        if (result.imageData) {
          setPendingScreenshot(toDataUrl(result.imageData));
          setIncludeScreenshot(true);
        }
      } catch (e) {
        console.error("Failed to capture screenshot", e);
      }
    }
  };

  const handleSwitchSession = (id: string) => {
    if (id === activeSessionId) {
      setSessionsOpen(false);
      return;
    }
    setActiveSessionId(id);
    setMessages([]);
    queryClient.invalidateQueries({ queryKey: getGetSessionMessagesQueryKey(id) });
    setSessionsOpen(false);
  };

  const handleCreateSession = () => {
    const name = newSessionName.trim() || `Session ${sessions.length + 1}`;
    setCreatingSession(true);
    createSessionMutation.mutate(
      { data: { name } },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setActiveSessionId(session.id);
          setMessages([]);
          setNewSessionName("");
          setCreatingSession(false);
          setSessionsOpen(false);
        },
        onError: () => setCreatingSession(false),
      }
    );
  };

  const handleDeleteSession = (id: string) => {
    deleteSessionMutation.mutate(
      { sessionId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          if (id === activeSessionId) {
            const remaining = sessions.filter((s) => s.id !== id);
            if (remaining.length > 0) {
              setActiveSessionId(remaining[0].id);
              queryClient.invalidateQueries({ queryKey: getGetSessionMessagesQueryKey(remaining[0].id) });
            } else {
              createSessionMutation.mutate(
                { data: { name: "Session 1" } },
                {
                  onSuccess: (session) => {
                    queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
                    setActiveSessionId(session.id);
                    setMessages([]);
                  }
                }
              );
            }
          }
        }
      }
    );
  };

  const handleStartRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const handleCommitRename = (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    renameSessionMutation.mutate(
      { sessionId: id, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setRenamingId(null);
        }
      }
    );
  };

  const handleClearSession = async () => {
    if (!activeSessionId) return;
    clearSessionMutation.mutate(
      { sessionId: activeSessionId },
      {
        onSuccess: () => {
          setMessages([]);
          queryClient.invalidateQueries({ queryKey: getGetSessionMessagesQueryKey(activeSessionId) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        }
      }
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;

    // Electron: use IPC-captured screenshot; Web: fall back to server-side capture
    const latestImgData = isElectron
      ? electronAutoScreenshot
      : (latestScreenshot?.imageData ? toDataUrl(latestScreenshot.imageData) : null);
    // Auto-include latest screenshot when auto-capture is on, or when user manually toggled
    const autoCapturing = settings?.autoCapture && !!latestImgData;
    const sentScreenshot = (includeScreenshot || autoCapturing) ? (pendingScreenshot || latestImgData) : null;
    const shouldSendScreenshot = !!(includeScreenshot || autoCapturing);

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      screenshot: sentScreenshot
    };

    addMessage(userMessage);
    const messageContent = input;
    setInput("");

    setIncludeScreenshot(false);
    setPendingScreenshot(null);

    try {
      const response = await sendMutation.mutateAsync({
        data: {
          message: messageContent,
          gameName: gameNameOverride.trim() || gameDetection?.gameName || gameDetection?.processName,
          // In Electron, send the screenshot image directly so the server never
          // needs to do a local capture lookup. On web, rely on includeScreenshot.
          ...(isElectron && sentScreenshot
            ? { imageData: sentScreenshot, includeScreenshot: false }
            : { includeScreenshot: shouldSendScreenshot }),
          sessionId: activeSessionId,
        }
      });

      addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });

      if (activeSessionId) {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      }
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } }; message?: string };
      const errMsg =
        apiErr?.response?.data?.error ||
        apiErr?.message ||
        "Communication link failed. Unable to reach AI core.";

      addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `ERROR: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
  };

  useEffect(() => {
    if (gameDetection?.confidence === "high" && gameDetection.gameName) {
      const detected = gameDetection.gameName;
      if (prevHighConfGameRef.current !== detected) {
        prevHighConfGameRef.current = detected;
        if (gameNameOverride.trim() && gameNameOverride.trim() !== detected) {
          setGameNameOverride("");
        }
      }
    }
  }, [gameDetection?.confidence, gameDetection?.gameName, gameNameOverride, setGameNameOverride]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 h-[calc(100vh-73px)]">
      <Card className="flex-1 flex flex-col min-h-0 border-border rounded-none bg-card/50 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <Sheet open={sessionsOpen} onOpenChange={setSessionsOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-none h-7 px-2 gap-1.5"
              >
                <MessagesSquare className="w-3 h-3" />
                {activeSession ? (
                  <span className="max-w-[120px] truncate">{activeSession.name}</span>
                ) : (
                  <span>Sessions</span>
                )}
                <ChevronRight className="w-3 h-3" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 bg-background border-border rounded-none p-0 font-mono flex flex-col">
              <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
                <SheetTitle className="font-mono text-xs uppercase tracking-widest text-primary">
                  Conversations
                </SheetTitle>
              </SheetHeader>

              <div className="px-3 py-3 border-b border-border">
                <div className="flex gap-2">
                  <Input
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="New session name..."
                    className="h-7 text-xs font-mono rounded-none bg-background border-border focus-visible:border-primary placeholder:text-muted-foreground/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateSession();
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateSession}
                    disabled={creatingSession}
                    className="h-7 px-3 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-xs uppercase tracking-widest"
                  >
                    {creatingSession ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {isLoadingSessions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                    <MessageSquare className="w-6 h-6 mb-2" />
                    <p className="text-[10px] uppercase tracking-widest">No sessions</p>
                  </div>
                ) : (
                  sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const isRenaming = renamingId === session.id;
                    return (
                      <div
                        key={session.id}
                        className={`group flex items-center gap-2 px-3 py-2.5 border-b border-border/50 cursor-pointer transition-colors ${
                          isActive
                            ? "bg-primary/10 border-l-2 border-l-primary"
                            : "hover:bg-muted/30 border-l-2 border-l-transparent"
                        }`}
                        onClick={() => !isRenaming && handleSwitchSession(session.id)}
                      >
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="h-6 text-xs font-mono rounded-none bg-background border-primary focus-visible:ring-0 px-1"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCommitRename(session.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                            />
                          ) : (
                            <p className={`text-xs font-mono truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                              {session.name}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                              {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
                            </span>
                            <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
                              · {formatBytes(session.diskUsageBytes)}
                            </span>
                            {session.gameContext && (
                              <span className="text-[9px] text-primary/50 uppercase tracking-wider truncate max-w-[80px]">
                                · {session.gameContext}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {isRenaming ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-none hover:bg-primary/20 hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCommitRename(session.id);
                              }}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-none hover:bg-primary/20 hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartRename(session.id, session.name);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-none hover:bg-destructive/20 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(session.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-1">
            {isElectron && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleToggleAlwaysOnTop}
                title={alwaysOnTop ? "Always-on-top: ON" : "Always-on-top: OFF"}
                className={`font-mono text-[10px] uppercase tracking-widest rounded-none h-7 px-2 gap-1.5 ${
                  alwaysOnTop
                    ? "text-primary bg-primary/10 hover:bg-primary/20 hover:text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                }`}
              >
                {alwaysOnTop ? (
                  <Pin className="w-3 h-3" />
                ) : (
                  <PinOff className="w-3 h-3" />
                )}
                {alwaysOnTop ? "On Top" : "On Top"}
              </Button>
            )}

            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearSession}
                disabled={clearSessionMutation.isPending}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-none h-7 px-2 gap-1.5"
              >
                {clearSessionMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
                Clear
              </Button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-6"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50">
              <MessageSquare className="w-12 h-12 mb-2" />
              <p className="font-mono text-sm tracking-widest uppercase">Comm channel open. Awaiting input.</p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.role === "divider") {
                return (
                  <div key={msg.id} className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-border/50" />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 whitespace-nowrap">
                      session resumed · {msg.content} · {msg.timestamp}
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}
                >
                  <div className={`flex items-center gap-2 mb-1 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="font-mono text-xs font-bold uppercase text-primary/80">
                      {msg.role === "user" ? "OPERATOR" : "AI_CORE"}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">{msg.timestamp}</span>
                  </div>

                  <div className={`p-4 font-mono text-sm leading-relaxed border ${
                    msg.role === "user"
                      ? "bg-primary/5 border-primary/20 text-foreground"
                      : "bg-secondary/50 border-border text-foreground"
                  }`}>
                    {msg.screenshot && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="mb-3 relative group cursor-pointer border border-border overflow-hidden">
                            <img src={msg.screenshot} alt="Captured game screenshot" className="w-full max-w-sm h-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute inset-0 bg-background/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Maximize2 className="w-6 h-6 text-primary" />
                            </div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl w-[90vw] h-[90vh] p-0 bg-background border-primary/30 rounded-none flex items-center justify-center">
                          <VisuallyHidden>
                            <DialogTitle>Screenshot Details</DialogTitle>
                          </VisuallyHidden>
                          <img src={msg.screenshot} alt="Captured game screenshot" className="max-w-full max-h-full object-contain" />
                        </DialogContent>
                      </Dialog>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              );
            })
          )}

          {sendMutation.isPending && (
            <div className="flex flex-col max-w-[85%] mr-auto items-start">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold uppercase text-primary/80">
                  AI_CORE
                </span>
              </div>
              <div className="p-4 font-mono text-sm bg-secondary/50 border border-border flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Processing telemetry...</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {(pendingScreenshot || latestScreenshot?.imageData) && includeScreenshot && (
          <div className="flex items-center gap-3 p-3 bg-card border border-primary/30 font-mono text-sm">
            <div className="w-12 h-8 bg-secondary border border-border flex items-center justify-center overflow-hidden">
              <img src={pendingScreenshot || (latestScreenshot?.imageData ? toDataUrl(latestScreenshot.imageData) : "")} alt="thumb" className="w-full h-full object-cover opacity-70" />
            </div>
            <span className="text-primary tracking-widest uppercase flex-1">
              Visual data attached {pendingScreenshot ? "(Manual)" : "(Auto)"}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => {
              setIncludeScreenshot(false);
              setPendingScreenshot(null);
            }} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-none">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ENTER COMMAND OR QUERY..."
            className="flex-1 font-mono rounded-none border-border focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 bg-card/50 h-12 placeholder:tracking-widest"
            disabled={sendMutation.isPending}
          />
          <Button
            type="submit"
            disabled={!input.trim() || sendMutation.isPending}
            className="h-12 px-6 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono uppercase tracking-wider transition-all"
          >
            <Send className="w-4 h-4 mr-2" />
            Execute
          </Button>
        </form>

        <div className="flex flex-col gap-2 p-3 bg-card/50 border border-border">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCapture}
              disabled={captureMutation.isPending}
              className="rounded-none font-mono uppercase tracking-wider text-xs border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              {captureMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Camera className="w-4 h-4 mr-2" />
              )}
              Capture Now
            </Button>

            <div className="flex items-center gap-2">
              <Switch
                id="include-screenshot"
                checked={includeScreenshot}
                onCheckedChange={setIncludeScreenshot}
                className="data-[state=checked]:bg-primary"
              />
              <Label htmlFor="include-screenshot" className="font-mono text-xs uppercase tracking-widest text-muted-foreground cursor-pointer">
                Attach to next message
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">Game Override:</span>
            <div className="relative flex-1 flex items-center">
              <Input
                value={gameNameOverride}
                onChange={(e) => setGameNameOverride(e.target.value)}
                placeholder={gameDetection?.gameName || gameDetection?.processName || "Auto-detect active..."}
                className="h-7 text-xs font-mono rounded-none bg-background border-border focus-visible:border-primary placeholder:text-muted-foreground/40 placeholder:text-[10px] pr-6"
              />
              {gameNameOverride.trim() && (
                <button
                  type="button"
                  onClick={() => setGameNameOverride("")}
                  className="absolute right-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  title="Clear override"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {gameDetection?.detected && gameDetection.source && (
              <span
                className={`shrink-0 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
                  gameDetection.source === "local"
                    ? "text-emerald-400/80 border-emerald-400/30 bg-emerald-400/5"
                    : gameDetection.source === "steam-api"
                    ? "text-sky-400/80 border-sky-400/30 bg-sky-400/5"
                    : "text-blue-400/80 border-blue-400/30 bg-blue-400/5"
                }`}
                title={
                  gameDetection.source === "local"
                    ? "Identified from local game process table"
                    : gameDetection.source === "steam-api"
                    ? "Identified via Steam Web API"
                    : "Identified via Steam Store search"
                }
              >
                {gameDetection.source === "local"
                  ? "Local"
                  : gameDetection.source === "steam-api"
                  ? "Steam API"
                  : "Steam"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
