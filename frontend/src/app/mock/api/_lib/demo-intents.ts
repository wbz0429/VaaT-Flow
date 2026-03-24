import { demoTasksById } from "@/core/demo/scenarios";
import type { DemoFollowupDefinition } from "@/core/demo/types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function scoreFollowup(input: string, followup: DemoFollowupDefinition) {
  const haystack = normalize(input);
  const candidates = [followup.userMessage, followup.label, ...(followup.aliases ?? [])]
    .map(normalize)
    .filter(Boolean);

  let score = 0;
  for (const candidate of candidates) {
    if (haystack === candidate) {
      return 100;
    }
    if (haystack.includes(candidate) || candidate.includes(haystack)) {
      score = Math.max(score, 60);
    }
    const tokens = candidate.split(/[\s，。！？、]+/).filter(Boolean);
    const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
    if (tokens.length > 0 && tokenHits > 0) {
      score = Math.max(score, tokenHits * 10);
    }
  }

  return score;
}

export function matchDemoFollowup(taskId: string | undefined, input: string) {
  if (!taskId) {
    return null;
  }

  const followups = demoTasksById[taskId]?.followups ?? [];
  let best: DemoFollowupDefinition | null = null;
  let bestScore = 0;

  for (const followup of followups) {
    const score = scoreFollowup(input, followup);
    if (score > bestScore) {
      best = followup;
      bestScore = score;
    }
  }

  return bestScore >= 20 ? best : null;
}
