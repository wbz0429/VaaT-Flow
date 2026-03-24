import type { NextRequest } from "next/server";

import { loadDemoThread } from "../../../_lib/demo-seed-loader";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const threadId = (await params).thread_id;
  const json = loadDemoThread(threadId);
  return Response.json([json]);
}
