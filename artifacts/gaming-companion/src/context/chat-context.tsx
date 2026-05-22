import { createContext, useContext, useState, ReactNode } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [gameNameOverride, setGameNameOverride] = useState("");

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
