import { describe, expect, test } from "bun:test";
import { Question } from "../lib/mathex/schemas";
import { checkSolution } from "./index.server";

function grouped(solutions: { value: string; group: number }[]) {
  return Question.parse({
    contents: "",
    solutions: solutions.map(({ value, group }) => ({ type: "text", value, group })),
    allowEquivalent: false,
    answerComment: "",
    requireAllSolutionGroups: true,
    solutionOrderMatters: false,
    skippable: true
  });
}

function numeric(value: number) {
  return Question.parse({
    contents: "",
    solutions: [{ type: "number", value, group: 0 }],
    allowEquivalent: false,
    answerComment: "",
    requireAllSolutionGroups: false,
    solutionOrderMatters: false,
    skippable: true
  });
}

describe("checkSolution", () => {
  test("matches repeated values to different groups", () => {
    const question = grouped([
      ...Array.from({ length: 7 }, (_, index) => ({ value: "x", group: index })),
      { value: "y", group: 7 }
    ]);
    expect(checkSolution(["x", "x", "x", "x", "x", "x", "x", "y"], question)).toBe(true);
    expect(checkSolution(["x", "x", "x", "x", "x", "x", "x", "z"], question)).toBe(false);
  });

  test("accepts zero but not a blank numeric answer", () => {
    const question = numeric(0);
    expect(checkSolution("0", question)).toBe(true);
    expect(checkSolution("", question)).toBe(false);
    expect(checkSolution("   ", question)).toBe(false);
  });
});
