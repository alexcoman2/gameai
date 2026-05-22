import { useState, useRef, useEffect } from "react";
import { 
  useDetectGame, getDetectGameQueryKey,
  useCaptureScreenshot,
  useSendChatMessage,
  useGetSettings, getGetSettingsQueryKey,
  useGetLatestScreenshot, getGetLatestScreenshotQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Camera, Send, Loader2, Maximize2, X, MessageSquare, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useChat } from "@/context/chat-context";

export default function Home() {
  const { messages, addMessage, clearMessages, gameNameOverride, setGameNameOverride } = useChat();
  const [input, setInput] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
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

  const captureMutation = useCaptureScreenshot();
  const sendMutation = useSendChatMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  const toDataUrl = (base64: string) =>
    base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;

  const handleCapture = async () => {
    try {
      const result = await captureMutation.mutateAsync();
      if (result.imageData) {
        setPendingScreenshot(toDataUrl(result.imageData));
        setIncludeScreenshot(true);
      }
    } catch (e) {
      console.error("Failed to capture screenshot", e);
    }
  };

  const handleNewSession = async () => {
    setIsClearing(true);
    try {
      await fetch("/api/chat/clear", { method: "POST" });
    } catch (e) {
      console.error("Failed to clear server conversation history", e);
    } finally {
      clearMessages();
      setIsClearing(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;

    const latestImgData = latestScreenshot?.imageData ? toDataUrl(latestScreenshot.imageData) : null;
    const sentScreenshot = includeScreenshot ? (pendingScreenshot || latestImgData) : null;

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
    
    const currentIncludeScreenshot = includeScreenshot;
    setIncludeScreenshot(false);
    setPendingScreenshot(null);

    try {
      const response = await sendMutation.mutateAsync({
        data: {
          message: messageContent,
          gameName: gameNameOverride.trim() || gameDetection?.gameName || gameDetection?.processName,
          includeScreenshot: currentIncludeScreenshot
        }
      });

      addMessage({
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
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

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 h-[calc(100vh-73px)]">
      {/* Chat History */}
      <Card className="flex-1 flex flex-col min-h-0 border-border rounded-none bg-card/50 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
        
        {messages.length > 0 && (
          <div className="flex justify-end px-4 pt-3 pb-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleNewSession}
              disabled={isClearing}
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-none h-7 px-2 gap-1.5"
            >
              {isClearing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              New Session
            </Button>
          </div>
        )}

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
            messages.map((msg) => (
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
            ))
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

      {/* Input Area */}
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
            <Input
              value={gameNameOverride}
              onChange={(e) => setGameNameOverride(e.target.value)}
              placeholder={gameDetection?.gameName || gameDetection?.processName || "Auto-detect active..."}
              className="h-7 text-xs font-mono rounded-none bg-background border-border focus-visible:border-primary placeholder:text-muted-foreground/40 placeholder:text-[10px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
