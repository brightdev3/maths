import type { LeaderboardEntry } from "./schemas";

export function playerPoints(entry: Pick<LeaderboardEntry, "questionsCompleted" | "skips">): number {
  return Math.max(0, entry.questionsCompleted - entry.skips) * 5;
}
