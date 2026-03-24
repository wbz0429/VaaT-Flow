import { demoTasksById } from "./scenarios";
import type { DemoThreadRecord } from "./types";

export function getTaskFollowupSuggestions(taskId?: string | null) {
  if (!taskId) {
    return [] as string[];
  }

  return (demoTasksById[taskId]?.followups ?? []).map((item) => item.userMessage);
}

export function getThreadFollowupSuggestions(thread?: DemoThreadRecord | null) {
  const taskId = thread?.values.demo?.taskId;
  const explicit = thread?.values.demo?.suggestions;
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  return getTaskFollowupSuggestions(taskId);
}
