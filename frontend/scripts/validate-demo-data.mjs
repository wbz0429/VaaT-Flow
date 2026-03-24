import fs from "fs";
import path from "path";

const demoRoot = path.resolve(process.cwd(), "public/demo");
const indexPath = path.join(demoRoot, "index.json");

function fail(message) {
  throw new Error(message);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(process.cwd(), filePath)}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`Expected non-empty string for ${label}`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`Expected non-empty array for ${label}`);
  }
}

function validateThread(threadId) {
  const threadPath = path.join(demoRoot, "threads", threadId, "thread.json");
  const thread = readJson(threadPath);

  assertString(thread.thread_id, `thread ${threadId}.thread_id`);
  assertString(thread.created_at, `thread ${threadId}.created_at`);
  assertString(thread.updated_at, `thread ${threadId}.updated_at`);

  if (!thread.values || typeof thread.values !== "object") {
    fail(`Expected object for thread ${threadId}.values`);
  }

  assertString(thread.values.title, `thread ${threadId}.values.title`);
  if (!Array.isArray(thread.values.messages)) {
    fail(`Expected array for thread ${threadId}.values.messages`);
  }
  if (!Array.isArray(thread.values.artifacts)) {
    fail(`Expected array for thread ${threadId}.values.artifacts`);
  }
}

function main() {
  const index = readJson(indexPath);
  assertArray(index.scenarios, "index.scenarios");

  const scenarioIds = new Set();
  const taskIds = new Set();
  const threadIds = new Set();

  for (const scenario of index.scenarios) {
    assertString(scenario.id, "scenario.id");
    assertString(scenario.label, `scenario ${scenario.id}.label`);
    assertArray(scenario.tasks, `scenario ${scenario.id}.tasks`);

    if (scenarioIds.has(scenario.id)) {
      fail(`Duplicate scenario id: ${scenario.id}`);
    }
    scenarioIds.add(scenario.id);

    for (const task of scenario.tasks) {
      assertString(task.id, `task in ${scenario.id}.id`);
      assertString(task.threadId, `task ${task.id}.threadId`);

      if (taskIds.has(task.id)) {
        fail(`Duplicate task id: ${task.id}`);
      }
      taskIds.add(task.id);
      threadIds.add(task.threadId);
    }
  }

  if (scenarioIds.size !== 3) {
    fail(`Expected exactly 3 scenarios, got ${scenarioIds.size}`);
  }

  if (taskIds.size < 6) {
    fail(`Expected at least 6 tasks, got ${taskIds.size}`);
  }

  for (const threadId of threadIds) {
    validateThread(threadId);
  }

  console.info(`Validated ${scenarioIds.size} scenarios and ${threadIds.size} demo threads.`);
}

main();
