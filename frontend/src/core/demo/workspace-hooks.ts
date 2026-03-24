"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { ThreadStreamOptions } from "@/core/threads/hooks";
import { useThreadStream } from "@/core/threads/hooks";
import type { AgentThread } from "@/core/threads/types";
import type { WorkspaceThreadLike } from "@/core/threads/workspace-thread";

import {
  deleteMockThread,
  loadMockThreadSearch,
  renameMockThread,
  useMockThreadStream,
} from "./mock-stream";

type WorkspaceSendMessage = (
  threadId: string,
  message: PromptInputMessage,
  extraContext?: Record<string, unknown>,
) => Promise<void>;

export function useWorkspaceThreadStream(options: ThreadStreamOptions) {
  const realStream = useThreadStream(options);
  const mockStream = useMockThreadStream({
    enabled: Boolean(options.isMock && options.threadId),
    threadId: options.threadId ?? "mock-new-thread",
    context: options.context,
    onStart: options.onStart,
    onFinish: options.onFinish,
  });

  return (options.isMock && options.threadId ? mockStream : realStream) as readonly [
    WorkspaceThreadLike,
    WorkspaceSendMessage,
  ];
}

export function useMockThreads() {
  return useQuery<AgentThread[]>({
    queryKey: ["workspace-threads", "mock"],
    queryFn: async () => (await loadMockThreadSearch()) as AgentThread[],
    refetchOnWindowFocus: false,
  });
}

export function useMockDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId }: { threadId: string }) => {
      await deleteMockThread(threadId);
    },
    onSuccess(_, { threadId }) {
      queryClient.setQueriesData(
        { queryKey: ["workspace-threads", "mock"], exact: false },
        (oldData: Array<AgentThread>) => oldData.filter((t) => t.thread_id !== threadId),
      );
    },
  });
}

export function useMockRenameThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, title }: { threadId: string; title: string }) => {
      await renameMockThread(threadId, title);
    },
    onSuccess(_, { threadId, title }) {
      queryClient.setQueriesData(
        { queryKey: ["workspace-threads", "mock"], exact: false },
        (oldData: Array<AgentThread>) =>
          oldData.map((t) =>
            t.thread_id === threadId
              ? { ...t, values: { ...t.values, title } }
              : t,
          ),
      );
    },
  });
}
