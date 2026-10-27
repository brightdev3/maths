import { describe, expect, test } from "bun:test";
import { playerPoints } from "./scoring";

describe("playerPoints", () => {
  test("awards five points per correct answer", () => {
    expect(playerPoints({ questionsCompleted: 4, skips: 0 })).toBe(20);
  });

  test("does not award points for skipped questions", () => {
    expect(playerPoints({ questionsCompleted: 4, skips: 2 })).toBe(10);
    expect(playerPoints({ questionsCompleted: 4, skips: 4 })).toBe(0);
  });

  test("never displays a negative score", () => {
    expect(playerPoints({ questionsCompleted: 0, skips: 0 })).toBe(0);
    expect(playerPoints({ questionsCompleted: 0, skips: 1 })).toBe(0);
  });
});
