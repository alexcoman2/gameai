import { createContext, useContext, useState } from "react";

interface GameContextValue {
  effectiveGameName: string | null;
  setEffectiveGameName: (name: string | null) => void;
}

const GameContext = createContext<GameContextValue>({
  effectiveGameName: null,
  setEffectiveGameName: () => {},
});

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [effectiveGameName, setEffectiveGameName] = useState<string | null>(null);
  return (
    <GameContext.Provider value={{ effectiveGameName, setEffectiveGameName }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  return useContext(GameContext);
}
