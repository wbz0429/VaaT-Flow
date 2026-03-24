import { loadDemoThread, saveDemoThread } from "../../../_lib/demo-seed-loader";

type UpdateRequest = {
  values?: {
    title?: string;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const threadId = (await params).thread_id;
  const body = ((await request.json().catch(() => ({}))) ?? {}) as UpdateRequest;
  const nextTitle = body.values?.title?.trim();

  if (!nextTitle) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const thread = loadDemoThread(threadId);
  const nextThread = {
    ...thread,
    updated_at: new Date().toISOString(),
    values: {
      ...thread.values,
      title: nextTitle,
    },
  };
  saveDemoThread(threadId, nextThread);
  return Response.json(nextThread);
}
