import { deleteDemoThread } from "../../../_lib/demo-seed-loader";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const threadId = (await params).thread_id;
  deleteDemoThread(threadId);
  return Response.json({ ok: true });
}
