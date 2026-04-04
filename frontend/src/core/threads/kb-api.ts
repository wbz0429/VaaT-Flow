import { getBackendBaseURL } from "@/core/config";

export interface ThreadKBBinding {
  id: string;
  kb_id: string;
  kb_name: string;
  created_at: string;
}

export async function getThreadKnowledgeBases(
  threadId: string,
): Promise<ThreadKBBinding[]> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases`,
    { credentials: "include" },
  );
  if (!res.ok) return [];
  return res.json() as Promise<ThreadKBBinding[]>;
}

export async function bindKnowledgeBases(
  threadId: string,
  kbIds: string[],
): Promise<ThreadKBBinding[]> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kb_ids: kbIds }),
    },
  );
  if (!res.ok) throw new Error("Failed to bind knowledge bases");
  return res.json() as Promise<ThreadKBBinding[]>;
}

export async function unbindKnowledgeBase(
  threadId: string,
  kbId: string,
): Promise<void> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${threadId}/knowledge-bases/${kbId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to unbind knowledge base");
}
