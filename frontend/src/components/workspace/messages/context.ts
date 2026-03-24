import { createContext, useContext } from "react";

import type { WorkspaceThreadLike } from "@/core/threads/workspace-thread";

export interface ThreadContextType {
  thread: WorkspaceThreadLike;
  isMock?: boolean;
}

export const ThreadContext = createContext<ThreadContextType | undefined>(
  undefined,
);

export function useThread() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThread must be used within a ThreadContext");
  }
  return context;
}
