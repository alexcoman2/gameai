import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Mirrored to localStorage so the overlay window (separate BrowserWindow, same
// origin, same localStorage) can pick up the active session and append its
// chats to the same conversation the main window is showing. Without this,
// overlay chats land in a hidden `globalHistory` bucket and never appear in
// the main chat list.
const ACTIVE_SESSION_LS_KEY = "unstuck:activeSessionId";

export interface Message {
  id: string;
  role: "user" | "assistant" | "divider";
  content: string;
  timestamp: string;
  screenshot?: string | null;
}

interface ChatContextValue {
  messages: Message[];
  setMessages: (msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  gameNameOverride: string;
  setGameNameOverride: (name: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [gameNameOverride, setGameNameOverride] = useState("");

  // Persist activeSessionId so the overlay window can read it.
  const setActiveSessionId = (id: string | null) => {
    setActiveSessionIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_SESSION_LS_KEY, id);
      else localStorage.removeItem(ACTIVE_SESSION_LS_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — fine, in-memory state still works.
    }
  };

  // Keep overlay in sync if main window changes session.
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(ACTIVE_SESSION_LS_KEY, activeSessionId);
      }
    } catch {
      // ignore
    }
  }, [activeSessionId]);

  const addMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);
  const clearMessages = () => setMessages([]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,
        clearMessages,
        activeSessionId,
        setActiveSessionId,
        gameNameOverride,
        setGameNameOverride,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
