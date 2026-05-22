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
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  gameNameOverride: string;
  setGameNameOverride: (name: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameNameOverride, setGameNameOverride] = useState("");

  const addMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);
  const clearMessages = () => setMessages([]);

  return (
    <ChatContext.Provider value={{ messages, addMessage, clearMessages, gameNameOverride, setGameNameOverride }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
