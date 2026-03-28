"use client";

import { Client as LangGraphClient } from "@langchain/langgraph-sdk/client";

import { getLangGraphBaseURL } from "../config";

import { sanitizeRunStreamOptions } from "./stream-mode";

function createCompatibleClient(isMock?: boolean): LangGraphClient {
  const client = new LangGraphClient({
    apiUrl: getLangGraphBaseURL(isMock),
    onRequest: (_url, init) => {
      return { ...init, credentials: "include" as RequestCredentials };
    },
  });

  const originalRunStream = client.runs.stream.bind(client.runs);
  client.runs.stream = ((threadId, assistantId, payload) =>
    originalRunStream(
      threadId,
      assistantId,
      sanitizeRunStreamOptions(payload),
    )) as typeof client.runs.stream;

  const originalJoinStream = client.runs.joinStream.bind(client.runs);
  client.runs.joinStream = ((threadId, runId, options) =>
    originalJoinStream(
      threadId,
      runId,
      sanitizeRunStreamOptions(options),
    )) as typeof client.runs.joinStream;

  return client;
}

let _realClient: LangGraphClient | null = null;
let _mockClient: LangGraphClient | null = null;

export function getAPIClient(isMock?: boolean): LangGraphClient {
  if (isMock) {
    _mockClient ??= createCompatibleClient(true);
    return _mockClient;
  }
  _realClient ??= createCompatibleClient(false);
  return _realClient;
}
