"use client";

import { createContext, useContext } from "react";
import type { Actor } from "@/lib/api";

const OperatorActorContext = createContext<Actor | null>(null);

export function OperatorActorProvider({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  return (
    <OperatorActorContext.Provider value={actor}>
      {children}
    </OperatorActorContext.Provider>
  );
}

export function useOperatorActor(): Actor {
  const actor = useContext(OperatorActorContext);
  if (!actor) throw new Error("useOperatorActor must be used inside OperatorGate");
  return actor;
}
