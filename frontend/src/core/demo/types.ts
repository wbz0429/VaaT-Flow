import type { Message } from "@langchain/langgraph-sdk";

import type { Todo } from "@/core/todos";

export type DemoScenarioId = "ops" | "dev" | "mgmt";

export interface DemoToolBadge {
  name: string;
  status?: "running" | "done";
}

export interface DemoArtifactHint {
  type: "ppt" | "chart" | "report" | "code";
  label: string;
}

export interface DemoPreviewMessage {
  role: "user" | "assistant";
  content: string;
  toolCall?: DemoToolBadge;
  artifact?: DemoArtifactHint;
  delay: number;
}

export interface DemoFollowupDefinition {
  id: string;
  label: string;
  aliases?: string[];
  userMessage: string;
}

export interface DemoTaskDefinition {
  id: string;
  scenarioId: DemoScenarioId;
  title: string;
  description: string;
  threadId: string;
  coverImage?: string;
  starterPrompt: string;
  tools: string[];
  preview: DemoPreviewMessage[];
  followups: DemoFollowupDefinition[];
}

export interface DemoScenarioDefinition {
  id: DemoScenarioId;
  label: string;
  description: string;
  icon: "megaphone" | "code" | "chart";
  tools: string[];
  tasks: DemoTaskDefinition[];
}

export interface DemoIndexTaskRecord {
  id: string;
  title: string;
  description: string;
  threadId: string;
  starterPrompt: string;
  tools: string[];
  followups: DemoFollowupDefinition[];
}

export interface DemoIndexScenarioRecord {
  id: DemoScenarioId;
  label: string;
  description: string;
  icon: DemoScenarioDefinition["icon"];
  tools: string[];
  tasks: DemoIndexTaskRecord[];
}

export interface DemoIndex {
  scenarios: DemoIndexScenarioRecord[];
}

export interface DemoThreadValues {
  title: string;
  messages: Message[];
  artifacts: string[];
  todos?: Todo[];
  demo?: {
    scenarioId: DemoScenarioId;
    taskId: string;
    followupIds?: string[];
    suggestions?: string[];
  };
}

export interface DemoThreadRecord {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  values: DemoThreadValues;
}

export interface DemoEngineResponse {
  messages: Message[];
  artifacts?: string[];
  todos?: Todo[];
  suggestions?: string[];
  appendArtifacts?: boolean;
  streamBatches?: Message[][];
}
