import type { Message } from "@langchain/langgraph-sdk";

import type { AgentThreadState } from "./types";

export interface WorkspaceThreadLike {
  messages: Message[];
  values: AgentThreadState;
  isLoading: boolean;
  isThreadLoading: boolean;
  stop: () => Promise<void>;
}
