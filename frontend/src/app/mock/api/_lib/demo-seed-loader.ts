import fs from "fs";
import path from "path";

import type { DemoIndex, DemoThreadRecord } from "@/core/demo/types";

const demoRoot = path.resolve(process.cwd(), "public/demo");
const threadsRoot = path.join(demoRoot, "threads");

export function getDemoRoot() {
  return demoRoot;
}

export function getThreadRoot(threadId: string) {
  return path.join(threadsRoot, threadId);
}

export function getThreadJsonPath(threadId: string) {
  return path.join(getThreadRoot(threadId), "thread.json");
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function loadDemoIndex() {
  return readJsonFile<DemoIndex>(path.join(demoRoot, "index.json"));
}

export function loadDemoThread(threadId: string) {
  return normalizeDemoThread(readJsonFile<DemoThreadRecord>(getThreadJsonPath(threadId)));
}

export function saveDemoThread(threadId: string, thread: DemoThreadRecord) {
  writeJsonFile(getThreadJsonPath(threadId), normalizeDemoThread(thread));
}

export function listDemoThreadIds() {
  if (!fs.existsSync(threadsRoot)) {
    return [] as string[];
  }

  return fs
    .readdirSync(threadsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

export function deleteDemoThread(threadId: string) {
  const threadRoot = getThreadRoot(threadId);
  if (fs.existsSync(threadRoot)) {
    fs.rmSync(threadRoot, { recursive: true, force: true });
  }
}

function uniqueStrings(items: string[] | undefined) {
  return Array.from(new Set(items ?? []));
}

function uniqueMessageId(baseId: string, count: number) {
  return count === 0 ? baseId : `${baseId}__${count + 1}`;
}

function normalizeDemoThread(thread: DemoThreadRecord): DemoThreadRecord {
  const seenMessageIds = new Map<string, number>();
  const messages = thread.values.messages.map((message) => {
    const originalId = message.id ?? `message-${Date.now()}`;
    const count = seenMessageIds.get(originalId) ?? 0;
    seenMessageIds.set(originalId, count + 1);
    return {
      ...message,
      id: uniqueMessageId(originalId, count),
    };
  });

  return {
    ...thread,
    values: {
      ...thread.values,
      messages,
      artifacts: uniqueStrings(thread.values.artifacts),
    },
  };
}
