import { useState, useRef, useEffect } from "react";
import { useGameContext } from "@/context/game-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDetectGame, getDetectGameQueryKey,
  useCaptureScreenshot,
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
  Eye, EyeOff, Radio, Minimize2, Mic, MicOff, Volume2, VolumeX,
} from "lucide-react";
import { useLocation } from "wouter";
import { useMe } from "@/hooks/use-me";
import {
  createVoiceRecorder, speak, cancelSpeech, primeTtsPlayback, VOICE_ERROR_EVENT,
  isTtsEnabled, setTtsEnabled, isLikelyHallucination,
  isHandsFreeEnabled, setHandsFreeEnabled, HANDS_FREE_LS_KEY, TTS_ENABLED_LS_KEY,
  VOICE_BLOCKED_EVENT,
} from "@/lib/voice";
import { publishWatchState } from "@/lib/watch-state";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useChat } from "@/context/chat-context";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/hooks/use-toast";
import { checkUsageWarnings } from "@/lib/usage-warnings";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function compressScreenshot(dataUrl: string, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
  const [watchMode, setWatchMode] = useState(false);
  const [watchScreenshot, setWatchScreenshot] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsOn, setTtsOn] = useState(isTtsEnabled());
  const [handsFree, setHandsFree] = useState(isHandsFreeEnabled());
  // Plan gate: voice mode (STT/TTS/hands-free) is a paid feature. The
  // server enforces this with a 403 on /api/voice/*, but we also need to
  // disable the buttons in the UI so free users don't waste a mic-permission
  // prompt and a recording just to see a "voice not allowed" toast.
  const { me } = useMe();
  const [, navigate] = useLocation();
  const voiceLocked = !me || me.plan === "free";
  const goUpgrade = () => navigate("/upgrade");
  // Refs that the rearm setTimeout / TTS onAllDone callback (both fire
  // outside React render) need to read fresh — closure values would be
  // stale by the time they run.
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;
  const isTranscribingRef = useRef(isTranscribing);
  isTranscribingRef.current = isTranscribing;
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null);

  const toggleMic = async () => {
    // Unlock browser audio playback under user activation so the TTS reply
    // (which arrives seconds later, outside the user-gesture window) can play.
    primeTtsPlayback();
    if (isTranscribing) return;
    if (isRecording) {
      try {
        setIsRecording(false);
        setIsTranscribing(true);
        const text = await recorderRef.current!.stopAndTranscribe();
        if (text && !isLikelyHallucination(text)) {
          // End-to-end voice: auto-send the transcript instead of dumping it
          // into the composer. If the user has typed something into the
          // composer already, prepend that so we don't silently lose it.
          const composed = input.trim() ? `${input.trim()} ${text}` : text;
          setInput("");
          void handleSend(composed);
        } else {
          toast({
            title: "No speech detected",
            description: "I didn't catch any words. Try again a bit louder or closer to the mic.",
          });
        }
      } catch (err) {
        toast({
          title: "Voice input failed",
          description: err instanceof Error ? err.message : "Microphone or transcription error.",
          variant: "destructive",
        });
      } finally {
        setIsTranscribing(false);
      }
      return;
    }
    try {
      recorderRef.current = createVoiceRecorder();
      await recorderRef.current.start({
        onAutoStop: (reason) => {
          if (reason === "no-speech") {
            try { recorderRef.current?.cancel(); } catch { /* ignore */ }
            setIsRecording(false);
            toast({
              title: "No speech detected",
              description: "I didn't catch any words. Try again a bit louder or closer to the mic.",
            });
            return;
          }
          // Silence-after-speech: fall through to the normal stop+transcribe
          // path. toggleMicRef ensures we use the latest closure so the
          // transcript lands in the current `input` state.
          void toggleMicRef.current();
        },
      });
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access microphone.";
      toast({ title: "Microphone error", description: msg, variant: "destructive" });
    }
  };

  // Ref to the latest toggleMic so VAD's onAutoStop (captured at start time)
  // calls the current closure, not a stale one with stale `input` state.
  const toggleMicRef = useRef(toggleMic);
  toggleMicRef.current = toggleMic;

  const toggleTts = () => {
    const next = !ttsOn;
    setTtsOn(next);
    setTtsEnabled(next);
    if (!next) cancelSpeech();
    // Prime audio under the toggle click — guarantees the very first
    // reply after enabling TTS can play even if the user never clicked
    // the mic (typed message + TTS-on path).
    else primeTtsPlayback();
  };

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    setHandsFreeEnabled(next);
    if (next) {
      // Silent hands-free is useless — auto-enable TTS so the assistant
      // talks back, and prime audio under this click for the first reply.
      if (!ttsOn) {
        setTtsOn(true);
        setTtsEnabled(true);
      }
      primeTtsPlayback();
      // If idle, start listening immediately so the user can just talk.
      if (!sending && !isRecording && !isTranscribing) {
        void toggleMicRef.current();
      }
    } else {
      // Going back to tap-to-talk should silence a hot mic too.
      if (isRecording) {
        try { recorderRef.current?.cancel(); } catch { /* ignore */ }
        setIsRecording(false);
      }
    }
  };

  // Cross-window sync: when the overlay flips TTS or hands-free, mirror
  // it in the main window (same origin, same localStorage).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TTS_ENABLED_LS_KEY) {
        const next = e.newValue === "1";
        setTtsOn(next);
        if (!next) cancelSpeech();
        return;
      }
      if (e.key === HANDS_FREE_LS_KEY) {
        setHandsFree(e.newValue === "1");
        return;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Release the mic + cancel TTS on unmount so an in-progress recording
  // doesn't keep the mic light on after you navigate away.
  useEffect(() => {
    return () => {
      try { recorderRef.current?.cancel(); } catch { /* ignore */ }
      cancelSpeech();
    };
  }, []);

  // Listen for the voice-blocked event dispatched from voice.ts when both
  // OpenAI Audio playback and browser speechSynthesis fall through silently
  // (autoplay policy). Show a single dismissable toast — otherwise users see
  // no feedback at all and assume voice mode is broken.
  useEffect(() => {
    const onBlocked = () => {
      toast({
        title: "Voice reply blocked by browser",
        description: "Click anywhere in the window to allow audio playback, then send your next message.",
        variant: "destructive",
      });
    };
    const onError = (e: Event) => {
      const reason = (e as CustomEvent<string>).detail || "Voice reply failed";
      toast({
        title: "Voice reply unavailable",
        description: reason,
        variant: "destructive",
      });
    };
    window.addEventListener(VOICE_BLOCKED_EVENT, onBlocked);
    window.addEventListener(VOICE_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(VOICE_BLOCKED_EVENT, onBlocked);
      window.removeEventListener(VOICE_ERROR_EVENT, onError);
    };
  }, [toast]);
  const [watchLog, setWatchLog] = useState<{ time: string; note: string; event?: string | null; confidence?: number | null; visibleText?: string | null }[]>([]);
  const [visionDetectedGame, setVisionDetectedGame] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

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
        // Poll for new messages so chats sent from the overlay window
        // show up here without the user having to click back into main.
        // 2.5s feels live without hammering the server. Background tab
        // polling stays off (react-query default) to save battery.
        refetchInterval: 2500,
        refetchOnWindowFocus: true,
      }
    }
  );

  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();
  const renameSessionMutation = useRenameSession();
  const clearSessionMutation = useClearSession();
  const captureMutation = useCaptureScreenshot();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    if (sessionInitialized || isLoadingSessions) return;
    // If we already have an active session (e.g. returning from Settings page),
    // just mark initialized without switching sessions.
    if (activeSessionId) {
      setSessionInitialized(true);
      return;
    }
    if (sessions.length === 0) {
      // Guard against repeated POSTs: if a previous create attempt is still
      // in flight, or has already errored, do NOT fire another one. Without
      // this, a failing /api/sessions endpoint would be hammered indefinitely
      // (one POST per refetch of the empty sessions list).
      if (createSessionMutation.isPending || createSessionMutation.isError) {
        return;
      }
      createSessionMutation.mutate(
        { data: { name: "Session 1" } },
        {
          onSuccess: (session) => {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            setActiveSessionId(session.id);
            setMessages([]);
            setSessionInitialized(true);
          },
          onError: (err) => {
            // Surface the failure so the user can see why the sidebar is
            // empty instead of silently spamming the network tab.
            // eslint-disable-next-line no-console
            console.error("[Unstuck] failed to create default session:", err);
            setSessionInitialized(true);
          },
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
    if (!alreadyLoaded) {
      historyLoadedRef.current.add(activeSessionId);
      if (mapped.length > 0) {
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
      return;
    }

    // Subsequent refetch (from polling, focus, or invalidation). Merge new
    // server messages into existing state WITHOUT clobbering local-only
    // items (the session divider, in-flight optimistic sends added by
    // handleSend before sendMutation resolves). For each new server message:
    //   - if a local optimistic copy exists (same role+content, non-server
    //     id), replace it in-place with the server version so the user's
    //     message doesn't jump position when the server's authoritative
    //     copy arrives. This also prevents duplication.
    //   - otherwise append (likely a message sent from the overlay window).
    setMessages((prev) => {
      const serverIdSet = new Set(mapped.map((m) => m.id));
      const prevServerIds = new Set(
        prev.filter((m) => serverIdSet.has(m.id)).map((m) => m.id)
      );
      const newServerMessages = mapped.filter((m) => !prevServerIds.has(m.id));
      if (newServerMessages.length === 0) return prev;

      const next = [...prev];
      for (const sm of newServerMessages) {
        // Find a local optimistic message with matching role+content that
        // isn't itself a server message. Match the EARLIEST such entry so
        // user-then-assistant pairs reconcile in order.
        const dupIdx = next.findIndex(
          (m) =>
            m.role === sm.role &&
            m.content === sm.content &&
            !serverIdSet.has(m.id)
        );
        if (dupIdx >= 0) {
          next[dupIdx] = sm;
        } else {
          next.push(sm);
        }
      }
      return next;
    });
  }, [sessionMessagesData, activeSessionId, setMessages]);

  const toDataUrl = (base64: string) =>
    base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;

  type ElectronAPI = {
    isElectron?: boolean;
    captureScreenshot?: () => Promise<string>;
    getLastGameScreenshot?: () => Promise<string | null>;
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

  // Watch mode: two-tier loop.
  // Tier 1 — screenshot refresh at watchInterval (fast, no AI calls).
  // Tier 2 — observation every 90s: sends screenshot to Claude Haiku for a
  //           1-sentence game state note, appended to watchLog (max 15 entries).
  //           watchLog is included in every chat message so Claude knows what
  //           has been happening between conversations.
  useEffect(() => {
    if (!isElectron || !watchMode || !electronAPI?.captureScreenshot) return;
    const SCREENSHOT_MS = 5_000;
    const OBSERVE_MS = 5_000;
    let active = true;
    let lastObserveAt = 0;

    const tick = async () => {
      if (!active) return;
      try {
        const dataUrl = await electronAPI.captureScreenshot!();
        if (!dataUrl || !active) return;
        setWatchScreenshot(dataUrl);

        const now = Date.now();
        if (now - lastObserveAt >= OBSERVE_MS) {
          lastObserveAt = now;
          const gameName =
            (window as Window & { __gameNameOverride__?: string }).__gameNameOverride__ ||
            undefined;
          try {
            // Prefer the last screenshot captured while the window was NOT focused
            // (i.e. when the game was visible fullscreen) over the current screen
            // which would show the Unstuck overlay after an alt-tab.
            const gameScreenshot = await electronAPI.getLastGameScreenshot?.() ?? null;
            const raw = gameScreenshot || dataUrl;
            const observeWith = await compressScreenshot(raw);
            const res = await authFetch("/api/chat/watch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageData: observeWith, gameName }),
            });
            // Stop Watch immediately on cap/auth/rate-limit so we don't
            // hammer the server every 5s forever.
            if ((res.status === 402 || res.status === 401 || res.status === 429) && active) {
              let reason = "Watch stopped.";
              try {
                const data = (await res.json()) as { error?: string };
                if (data?.error) reason = data.error;
              } catch {
                // body may be empty
              }
              active = false;
              setWatchMode(false);
              toast({
                title: res.status === 402 ? "Usage limit reached" : "Watch stopped",
                description: reason,
                variant: "destructive",
              });
              return;
            }
            if (res.ok && active) {
              const data = (await res.json()) as {
                observation: string | null;
                gameName: string | null;
                event?: string | null;
                confidence?: number | null;
                visibleText?: string | null;
              };
              if (data.observation) {
                const entry = {
                  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  note: data.observation,
                  event: data.event ?? null,
                  confidence: data.confidence ?? null,
                  visibleText: data.visibleText ?? null,
                };
                // Keep last ~5 minutes of context (60 entries at 5s intervals)
                setWatchLog((prev) => [...prev.slice(-59), entry]);
              }
              if (data.gameName) {
                setVisionDetectedGame(data.gameName);
              }
              // Watch ticks accumulate ~12 minutes/hour of allowance — fire
              // 80%/100% warnings here too so users see them in real time.
              void checkUsageWarnings(toast);
            }
          } catch {
            // Silent fail — observation is best-effort
          }
        }
      } catch {
        // Silent fail — screen capture may be denied
      }
    };

    tick();
    const timer = setInterval(tick, SCREENSHOT_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isElectron, watchMode]);

  // Mirror watch state (mode + log) to localStorage so the overlay window
  // can include it in its own chat requests. Both windows share origin so
  // they share localStorage. Without this, overlay chats had no watch
  // context and the model defaulted to "Watch Mode is OFF".
  useEffect(() => {
    publishWatchState(watchMode, watchLog);
  }, [watchMode, watchLog]);

  // Refresh the "updatedAt" heartbeat every 20s while watch is on so the
  // overlay's staleness check doesn't expire the mode flag mid-session
  // (e.g. when no new observations have been recorded recently).
  useEffect(() => {
    if (!watchMode) return;
    const id = setInterval(() => publishWatchState(true, watchLog), 20_000);
    return () => clearInterval(id);
  }, [watchMode, watchLog]);

  // Keep game name accessible to the watch effect without re-creating the interval
  useEffect(() => {
    (window as Window & { __gameNameOverride__?: string }).__gameNameOverride__ =
      gameNameOverride.trim() ||
      visionDetectedGame ||
      gameDetection?.gameName ||
      gameDetection?.processName ||
      undefined;
  }, [gameNameOverride, visionDetectedGame, gameDetection?.gameName, gameDetection?.processName]);

  const { setEffectiveGameName } = useGameContext();
  useEffect(() => {
    const resolved =
      gameNameOverride.trim() ||
      visionDetectedGame ||
      gameDetection?.gameName ||
      gameDetection?.processName ||
      null;
    setEffectiveGameName(resolved);
  }, [gameNameOverride, visionDetectedGame, gameDetection?.gameName, gameDetection?.processName, setEffectiveGameName]);

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

  const handleSend = async (eOrOverride?: React.FormEvent | string) => {
    // Voice path auto-sends the transcript by passing a string here, bypassing
    // the composer. Form submit path passes the event. This mirrors the
    // override pattern already used by overlay.tsx for PTT auto-send.
    const override =
      typeof eOrOverride === "string" ? eOrOverride : undefined;
    if (eOrOverride && typeof eOrOverride !== "string") {
      eOrOverride.preventDefault();
    }
    const messageText = (override ?? input).trim();
    if (!messageText || sending) return;
    void import("@/lib/posthog").then(({ trackEvent }) =>
      trackEvent("chat_message_sent", {
        game: gameNameOverride.trim() || visionDetectedGame || gameDetection?.gameName || gameDetection?.processName || null,
        watchMode,
        hasScreenshot: !!(includeScreenshot || (settings?.autoCapture || (isElectron && watchMode))),
        platform: isElectron ? "electron" : "web",
        ttsOn,
      }),
    );
    // Prime audio under the submit gesture so the TTS reply that arrives
    // seconds later can play (browser autoplay policy).
    if (ttsOn) primeTtsPlayback();
    setSending(true);

    // Hands-free re-arm (mirrors overlay.tsx): fire the mic exactly once
    // per turn whether the trigger came from TTS finishing playback
    // (preferred when ttsOn) or from the request finishing without TTS.
    // The `rearmed` closure guard prevents double-firing if both paths
    // race on a very short reply.
    let rearmed = false;
    const rearmIfHandsFree = () => {
      if (rearmed) return;
      if (!handsFreeRef.current) return;
      rearmed = true;
      // Small delay so the audio device fully releases and React state
      // (sending=false) has a tick to settle before toggleMic runs.
      setTimeout(() => {
        if (!handsFreeRef.current) return;
        if (isRecordingRef.current || isTranscribingRef.current) return;
        void toggleMicRef.current();
      }, 250);
    };

    // Electron: use IPC-captured screenshot; Web: fall back to server-side capture
    const latestImgData = isElectron
      ? (watchMode && watchScreenshot ? watchScreenshot : electronAutoScreenshot)
      : (latestScreenshot?.imageData ? toDataUrl(latestScreenshot.imageData) : null);
    // Auto-include latest screenshot when auto-capture/watch is on, or when user manually toggled
    const autoCapturing = (settings?.autoCapture || (isElectron && watchMode)) && !!latestImgData;
    const sentScreenshot = (includeScreenshot || autoCapturing) ? (pendingScreenshot || latestImgData) : null;
    const shouldSendScreenshot = !!(includeScreenshot || autoCapturing);

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      screenshot: sentScreenshot
    };

    addMessage(userMessage);
    const messageContent = messageText;
    // Only clear the composer when the send came from typed input — the voice
    // auto-send path never touched it and the user may have parked a
    // half-finished follow-up question there.
    if (override === undefined) setInput("");

    setIncludeScreenshot(false);
    setPendingScreenshot(null);

    // Streaming send. Append empty assistant turn, mutate as deltas arrive.
    const assistantId = (Date.now() + 1).toString();
    const assistantTimestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: assistantTimestamp,
    });

    try {
      const { streamChatMessage } = await import("@/lib/chat-stream");
      // If TTS is on, create a sentence-streaming speaker so audio starts
      // playing as soon as the first sentence is generated instead of
      // waiting for the full reply (saves ~3-4s of dead air).
      const { createSentenceSpeaker } = await import("@/lib/voice");
      const speaker = ttsOn
        ? createSentenceSpeaker({ onAllDone: rearmIfHandsFree })
        : null;
      const result = await streamChatMessage(
        {
          message: messageContent,
          gameName: gameNameOverride.trim() || visionDetectedGame || gameDetection?.gameName || gameDetection?.processName,
          ...(isElectron && sentScreenshot
            ? { imageData: sentScreenshot, includeScreenshot: false }
            : { includeScreenshot: shouldSendScreenshot }),
          sessionId: activeSessionId,
          ...(watchLog.length > 0 ? { watchLog } : {}),
          ...(isElectron ? { watchMode } : {}),
        },
        {
          onDelta: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + chunk } : m
              )
            );
            speaker?.feed(chunk);
          },
        }
      );

      const finalReply = result.reply || "";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: finalReply } : m))
      );
      speaker?.end();

      if (activeSessionId) {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      }

      void checkUsageWarnings(toast);
    } catch (err: unknown) {
      // Stop any in-flight sentence-TTS work so we don't keep speaking a
      // reply the user never actually received.
      try {
        const { cancelSpeech } = await import("@/lib/voice");
        cancelSpeech();
      } catch { /* ignore */ }
      const errMsg = err instanceof Error ? err.message : "Communication link failed. Unable to reach AI core.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `ERROR: ${errMsg}` } : m
        )
      );
    } finally {
      setSending(false);
      // Non-TTS hands-free path: no speaker callback will ever fire, so
      // trigger the rearm here. When ttsOn this is a no-op because the
      // speaker.onAllDone path already flipped the `rearmed` guard
      // (or will shortly, gated by the same guard).
      if (!ttsOn) rearmIfHandsFree();
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
    <div className={`flex-1 flex flex-col min-h-0 ${compact ? "p-1 gap-1" : "p-4 md:p-6 gap-4"}`}>
      <Card className="flex-1 flex flex-col min-h-0 border-border rounded-none bg-card/50 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

        <div className="flex items-center justify-between gap-2 flex-wrap px-4 pt-3 pb-0 min-w-0">
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

          <div className="flex items-center gap-1 flex-wrap justify-end min-w-0">
            {isElectron && (
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWatchMode((v) => {
                      if (v) { setVisionDetectedGame(null); }
                      const next = !v;
                      void import("@/lib/posthog").then(({ trackEvent }) =>
                        trackEvent("watch_mode_toggled", { enabled: next }),
                      );
                      return next;
                    });
                  }}
                  title={watchMode ? "Watch mode: ON — capturing and observing every 5s" : "Watch mode: OFF"}
                  className={`font-mono text-[10px] uppercase tracking-widest rounded-none h-7 px-2 gap-1.5 ${
                    watchMode
                      ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 hover:text-amber-400"
                      : "text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
                  }`}
                >
                  {watchMode ? (
                    <Radio className="w-3 h-3 animate-pulse" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  Watch
                </Button>
              </div>
            )}

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

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCompact((v) => !v)}
              title={compact ? "Compact mode: ON — click to expand" : "Compact mode: OFF — click to shrink for overlay"}
              className={`font-mono text-[10px] uppercase tracking-widest rounded-none h-7 px-2 gap-1.5 ${
                compact
                  ? "text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 hover:text-cyan-400"
                  : "text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/10"
              }`}
            >
              <Minimize2 className="w-3 h-3" />
              {compact ? "Mini" : "Mini"}
            </Button>

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
          className={`flex-1 overflow-y-auto ${compact ? "p-2 space-y-2" : "p-4 space-y-6"}`}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50">
              <MessageSquare className={compact ? "w-6 h-6 mb-1" : "w-12 h-12 mb-2"} />
              <p className={`font-mono tracking-widest uppercase ${compact ? "text-[10px]" : "text-sm"}`}>Comm channel open. Awaiting input.</p>
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
                  <div className={`flex items-center gap-2 ${compact ? "mb-0" : "mb-1"} ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <span className={`font-mono font-bold uppercase text-primary/80 ${compact ? "text-[9px]" : "text-xs"}`}>
                      {msg.role === "user" ? "OPERATOR" : "AI_CORE"}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">{msg.timestamp}</span>
                  </div>

                  <div className={`font-mono border ${compact ? "p-2 text-[11px] leading-snug" : "p-4 text-sm leading-relaxed"} ${
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

          {sending && (
            <div className="flex flex-col max-w-[85%] mr-auto items-start">
              <div className={`flex items-center gap-2 ${compact ? "mb-0" : "mb-1"}`}>
                <span className={`font-mono font-bold uppercase text-primary/80 ${compact ? "text-[9px]" : "text-xs"}`}>
                  AI_CORE
                </span>
              </div>
              <div className={`font-mono bg-secondary/50 border border-border flex items-center gap-3 text-muted-foreground ${compact ? "p-2 text-[11px]" : "p-4 text-sm"}`}>
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
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

        <form onSubmit={handleSend} className="flex flex-wrap gap-2 min-w-0">
          <Button
            type="button"
            onClick={() => (voiceLocked ? goUpgrade() : void toggleMic())}
            disabled={isTranscribing || sending}
            title={
              voiceLocked
                ? "Voice input is a Pro feature — click to upgrade"
                : isRecording ? "Stop & transcribe" : "Speak"
            }
            className={`rounded-none font-mono uppercase tracking-wider transition-all ${
              voiceLocked
                ? "bg-secondary/40 text-muted-foreground border border-border opacity-60 hover:opacity-80 cursor-pointer"
                : isRecording
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
                : "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
            } ${compact ? "h-8 px-2" : "h-12 px-3"}`}
          >
            {isTranscribing ? (
              <Loader2 className={compact ? "w-3 h-3 animate-spin" : "w-4 h-4 animate-spin"} />
            ) : isRecording ? (
              <MicOff className={compact ? "w-3 h-3" : "w-4 h-4"} />
            ) : (
              <Mic className={compact ? "w-3 h-3" : "w-4 h-4"} />
            )}
          </Button>
          <Button
            type="button"
            onClick={() => (voiceLocked ? goUpgrade() : toggleTts())}
            title={
              voiceLocked
                ? "Voice replies are a Pro feature — click to upgrade"
                : ttsOn ? "Voice replies ON — click to mute" : "Voice replies OFF — click to enable"
            }
            className={`rounded-none font-mono uppercase tracking-wider transition-all border ${
              voiceLocked
                ? "bg-secondary/40 text-muted-foreground border-border opacity-60 hover:opacity-80"
                : ttsOn
                ? "bg-primary/15 text-primary border-primary/40 hover:bg-primary/25"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            } ${compact ? "h-8 px-2" : "h-12 px-3"}`}
          >
            {ttsOn && !voiceLocked ? (
              <Volume2 className={compact ? "w-3 h-3" : "w-4 h-4"} />
            ) : (
              <VolumeX className={compact ? "w-3 h-3" : "w-4 h-4"} />
            )}
          </Button>
          <Button
            type="button"
            onClick={() => (voiceLocked ? goUpgrade() : toggleHandsFree())}
            title={
              voiceLocked
                ? "Hands-free voice chat is a Pro feature — click to upgrade"
                : handsFree
                ? "Hands-free voice chat ON — mic re-arms after each reply. Click to stop."
                : "Hands-free voice chat OFF — click to start a continuous voice conversation"
            }
            className={`rounded-none font-mono uppercase tracking-wider transition-all border ${
              voiceLocked
                ? "bg-secondary/40 text-muted-foreground border-border opacity-60 hover:opacity-80"
                : handsFree
                ? "bg-primary/15 text-primary border-primary/40 hover:bg-primary/25 animate-pulse"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            } ${compact ? "h-8 px-2" : "h-12 px-3"}`}
          >
            <Radio className={compact ? "w-3 h-3" : "w-4 h-4"} />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? "LISTENING..." : isTranscribing ? "TRANSCRIBING..." : "ENTER COMMAND OR QUERY..."}
            className={`flex-1 min-w-[160px] font-mono rounded-none border-border focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 bg-card/50 placeholder:tracking-widest ${compact ? "h-8 text-xs" : "h-12"}`}
            disabled={sending || isRecording || isTranscribing}
          />
          <Button
            type="submit"
            disabled={!input.trim() || sending}
            className={`rounded-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono uppercase tracking-wider transition-all ${compact ? "h-8 px-3" : "h-12 px-6"}`}
          >
            <Send className={compact ? "w-3 h-3" : "w-4 h-4 mr-2"} />
            {!compact && "Execute"}
          </Button>
        </form>

        {!compact && <div className="flex flex-col gap-2 p-3 bg-card/50 border border-border min-w-0">
          <div className="flex items-center gap-4 flex-wrap min-w-0">
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

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">Game Override:</span>
            <div className="relative flex-1 min-w-[140px] flex items-center">
              <Input
                value={gameNameOverride}
                onChange={(e) => setGameNameOverride(e.target.value)}
                placeholder={visionDetectedGame || gameDetection?.gameName || gameDetection?.processName || "Auto-detect active..."}
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
            {visionDetectedGame && !gameNameOverride.trim() && (
              <span
                className="shrink-0 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border text-violet-400/80 border-violet-400/30 bg-violet-400/5"
                title={`Identified via screen vision: "${visionDetectedGame}"`}
              >
                Vision
              </span>
            )}
            {!visionDetectedGame && gameDetection?.detected && gameDetection.source && (
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
        </div>}
      </div>
    </div>
  );
}
