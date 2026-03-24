import type { Message } from "@langchain/langgraph-sdk";

import { generateDemoResponse } from "../../../_lib/demo-engine";
import { loadDemoThread, saveDemoThread } from "../../../_lib/demo-seed-loader";

function uniqueArtifacts(paths: string[]) {
  return Array.from(new Set(paths));
}

type ReplyRequest = {
  message?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const threadId = (await params).thread_id;
  const body = ((await request.json().catch(() => ({}))) ?? {}) as ReplyRequest;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const thread = loadDemoThread(threadId);
  const humanMessage: Message = {
    id: `mock-human-${Date.now()}`,
    type: "human",
    content: [{ type: "text", text: message }],
    additional_kwargs: {},
  };

  const response = generateDemoResponse(thread, message);
  const demoState = thread.values.demo ?? {
    scenarioId: "ops" as const,
    taskId: "ops-quarterly-ppt",
    followupIds: undefined,
    suggestions: [],
  };
  const nextThread = {
    ...thread,
    updated_at: new Date().toISOString(),
    values: {
      ...thread.values,
      messages: [...thread.values.messages, humanMessage, ...response.messages],
      artifacts: response.appendArtifacts
        ? uniqueArtifacts([
            ...(thread.values.artifacts ?? []),
            ...(response.artifacts ?? []),
          ])
        : response.artifacts ?? thread.values.artifacts ?? [],
      todos: response.todos ?? thread.values.todos ?? [],
      demo: {
        scenarioId: demoState.scenarioId,
        taskId: demoState.taskId,
        followupIds: demoState.followupIds,
        suggestions: response.suggestions ?? thread.values.demo?.suggestions ?? [],
      },
    },
  };

  saveDemoThread(threadId, nextThread);
  return Response.json({ thread: nextThread, response });
}
