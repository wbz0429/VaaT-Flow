"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useUpdateSubtask } from "@/core/tasks/context";
import type { AgentThreadContext } from "@/core/threads";
import type { AgentThreadState } from "@/core/threads";
import type { WorkspaceThreadLike } from "@/core/threads/workspace-thread";
import type { Todo } from "@/core/todos";

import type { DemoThreadRecord } from "./types";

type DemoThreadSearchResult = DemoThreadRecord;

type DemoStreamOptions = {
  enabled?: boolean;
  threadId: string;
  context: Omit<
    AgentThreadContext,
    "thread_id" | "is_plan_mode" | "thinking_enabled" | "subagent_enabled"
  > & {
    mode: "flash" | "thinking" | "pro" | "ultra" | undefined;
    reasoning_effort?: "minimal" | "low" | "medium" | "high";
  };
  onStart?: (threadId: string) => void;
  onFinish?: (state: AgentThreadState) => void;
};

type MockStreamState = {
  messages: Message[];
  values: AgentThreadState;
  isLoading: boolean;
  isThreadLoading: boolean;
  error?: Error | null;
};

const EMPTY_VALUES: AgentThreadState = {
  title: "",
  messages: [],
  artifacts: [],
  todos: [],
};

async function postJson<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function loadMockThread(threadId: string) {
  const history = await postJson<DemoThreadRecord[] | DemoThreadRecord>(
    `/mock/api/threads/${threadId}/history`,
    { limit: 1 },
  );

  return Array.isArray(history) ? history[0] : history;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text: string, size = 24) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function getSingleTextContent(message: Message) {
  if (!Array.isArray(message.content) || message.content.length !== 1) {
    return null;
  }

  const firstPart = message.content[0];
  if (
    !firstPart ||
    typeof firstPart === "string" ||
    firstPart.type !== "text" ||
    typeof firstPart.text !== "string"
  ) {
    return null;
  }

  return firstPart.text;
}

function splitMessageForStreaming(message: Message) {
  const textContent = getSingleTextContent(message);
  if (message.type !== "ai" || !textContent || textContent.length < 80) {
    return [message];
  }

  const pieces = chunkText(textContent, 24);
  return pieces.map((_, index) => ({
    ...message,
    content: [{ type: "text" as const, text: pieces.slice(0, index + 1).join("") }],
  })) satisfies Message[];
}

function normalizeStreamBatches(messages: Message[][]) {
  return messages.flatMap((batch) => {
    const nextBatches: Message[][] = [];
    for (const message of batch) {
      const splitMessages = splitMessageForStreaming(message);
      if (splitMessages.length === 1) {
        if (nextBatches.length === 0) {
          nextBatches.push([]);
        }
        nextBatches[nextBatches.length - 1]!.push(splitMessages[0]!);
        continue;
      }

      splitMessages.forEach((splitMessage) => {
        nextBatches.push([splitMessage]);
      });
    }

    return nextBatches;
  });
}

function upsertMessage(messages: Message[], nextMessage: Message) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...messages, nextMessage];
  }

  return messages.map((message, index) =>
    index === existingIndex ? nextMessage : message,
  );
}

function uniquifyMessages(messages: Message[]) {
  const seen = new Map<string, number>();
  return messages.map((message) => {
    const baseId = message.id ?? `message-${Date.now()}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    return {
      ...message,
      id: count === 0 ? baseId : `${baseId}__${count + 1}`,
    };
  });
}

function buildThinkingPlaceholder(text: string): Message {
  return {
    id: `thinking-${Date.now()}`,
    type: "ai",
    content: [],
    additional_kwargs: {
      reasoning_content: text,
    },
  };
}

export function useMockThreadStream({
  enabled = true,
  threadId,
  context,
  onStart,
  onFinish,
}: DemoStreamOptions) {
  useUpdateSubtask();
  const [state, setState] = useState<MockStreamState>({
    messages: [],
    values: EMPTY_VALUES,
    isLoading: false,
    isThreadLoading: true,
    error: null,
  });
  const valuesRef = useRef<AgentThreadState>(EMPTY_VALUES);

  const hydrateFromRecord = useCallback((record: DemoThreadRecord | undefined) => {
    if (!record) {
      setState({
        messages: [],
        values: EMPTY_VALUES,
        isLoading: false,
        isThreadLoading: false,
        error: new Error("Demo thread not found"),
      });
      return;
    }

    const nextValues: AgentThreadState = {
      ...record.values,
      messages: record.values.messages,
      artifacts: record.values.artifacts ?? [],
      todos: record.values.todos ?? [],
    };
    valuesRef.current = nextValues;
    setState({
      messages: nextValues.messages,
      values: nextValues,
      isLoading: false,
      isThreadLoading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setState((current) => ({
        ...current,
        isThreadLoading: false,
        isLoading: false,
      }));
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({
      ...current,
      isThreadLoading: true,
      error: null,
    }));

    void loadMockThread(threadId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        hydrateFromRecord(record);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setState({
          messages: [],
          values: EMPTY_VALUES,
          isLoading: false,
          isThreadLoading: false,
          error: error instanceof Error ? error : new Error("Failed to load demo thread"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, threadId, hydrateFromRecord]);

  const submit = useCallback(
    async (
      _threadId: string,
      message: PromptInputMessage,
      _extraContext?: Record<string, unknown>,
    ) => {
      const text = message.text.trim();
      if (!enabled || !text) {
        return;
      }

      onStart?.(threadId);

      const humanMessage: Message = {
        id: `mock-human-${Date.now()}`,
        type: "human",
        content: [{ type: "text", text }],
        additional_kwargs: {},
      };

      const optimisticValues: AgentThreadState = {
        ...valuesRef.current,
        messages: [...valuesRef.current.messages, humanMessage],
      };
      valuesRef.current = optimisticValues;

      setState((current) => ({
        ...current,
        isLoading: true,
        messages: optimisticValues.messages,
        values: optimisticValues,
      }));

      try {
        const thinkingPlaceholder = buildThinkingPlaceholder(
          "正在梳理上下文、调用工具并组织回答...",
        );
        const thinkingValues: AgentThreadState = {
          ...optimisticValues,
          messages: [...optimisticValues.messages, thinkingPlaceholder],
        };
        valuesRef.current = thinkingValues;
        setState((current) => ({
          ...current,
          isLoading: true,
          messages: thinkingValues.messages,
          values: thinkingValues,
        }));

        await delay(360);

        const result = await postJson<{
          thread: DemoThreadRecord;
          response: {
            messages: Message[];
            artifacts?: string[];
            todos?: Todo[];
            suggestions?: string[];
            streamBatches?: Message[][];
          };
        }>(`/mock/api/threads/${threadId}/reply`, {
          message: text,
          context,
        });

        const streamBatches = normalizeStreamBatches(
          result.response.streamBatches ?? [result.response.messages],
        ).map((batch) => uniquifyMessages(batch));
        let streamingValues: AgentThreadState = {
          ...thinkingValues,
          messages: [...optimisticValues.messages],
        };

        for (const [index, batch] of streamBatches.entries()) {
          if (index > 0) {
            const firstMessage = batch[0];
            const hasToolCalls = Boolean(
              firstMessage?.type === "ai" && firstMessage.tool_calls?.length,
            );
            const isToolResult = firstMessage?.type === "tool";
            const batchDelay = hasToolCalls ? 320 : isToolResult ? 240 : 90;
            await delay(batchDelay);
          }
          const nextMessages = [...streamingValues.messages];
          for (const messagePart of batch) {
            const alreadyExists = nextMessages.some(
              (existingMessage) => existingMessage.id === messagePart.id,
            );
            const content = getSingleTextContent(messagePart);
            const shouldUpsert = alreadyExists && typeof content === "string";

            if (shouldUpsert) {
              const updated = upsertMessage(nextMessages, messagePart);
              nextMessages.splice(0, nextMessages.length, ...updated);
            } else {
              nextMessages.push(messagePart);
            }
          }
          streamingValues = {
            ...streamingValues,
            messages: nextMessages,
          };
          valuesRef.current = streamingValues;
          setState((current) => ({
            ...current,
            isLoading: true,
            messages: streamingValues.messages,
            values: streamingValues,
          }));
        }

        const nextValues: AgentThreadState = {
          ...result.thread.values,
          messages: uniquifyMessages(result.thread.values.messages),
          artifacts: result.thread.values.artifacts ?? [],
          todos: result.thread.values.todos ?? [],
        };

        valuesRef.current = nextValues;
        setState({
          messages: nextValues.messages,
          values: nextValues,
          isLoading: false,
          isThreadLoading: false,
          error: null,
        });

        onFinish?.(nextValues);
      } catch (error) {
        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error : new Error("Demo reply failed"),
        }));
      }
    },
    [context, enabled, onFinish, onStart, threadId],
  );

  const stop = useCallback(() => {
    setState((current) => ({ ...current, isLoading: false }));
    return Promise.resolve();
  }, []);

  return useMemo(
    () => [
      {
        messages: state.messages,
        values: state.values,
        isLoading: state.isLoading,
        isThreadLoading: state.isThreadLoading,
        stop,
      } satisfies WorkspaceThreadLike,
      submit,
    ] as const,
    [state, stop, submit],
  );
}

export async function loadMockThreadSearch() {
  return postJson<DemoThreadSearchResult[]>("/mock/api/threads/search", {
    limit: 50,
    sortBy: "updated_at",
    sortOrder: "desc",
  });
}

export async function renameMockThread(threadId: string, title: string) {
  return postJson<DemoThreadRecord>(`/mock/api/threads/${threadId}/update`, {
    values: { title },
  });
}

export async function deleteMockThread(threadId: string) {
  return postJson<{ ok: true }>(`/mock/api/threads/${threadId}/delete`, {});
}
