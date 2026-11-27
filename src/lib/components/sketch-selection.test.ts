import { describe, expect, test } from "bun:test";
import { areaHit, boxCorners } from "./sketch-selection";

describe("sketch area selection", () => {
  test("selects a line crossing a box even when neither endpoint is inside", () => {
    const area = boxCorners({ x: 10, y: 10, w: 20, h: 20 });
    expect(
      areaHit(area, [
        { x: 0, y: 20 },
        { x: 40, y: 20 }
      ])
    ).toBe(true);
    expect(
      areaHit(area, [
        { x: 0, y: 0 },
        { x: 40, y: 10 }
      ])
    ).toBe(false);
  });

  test("does not select points in a concave lasso's empty corner", () => {
    const area = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(areaHit(area, [{ x: 2, y: 8 }])).toBe(true);
    expect(areaHit(area, [{ x: 8, y: 8 }])).toBe(false);
    expect(areaHit(area, [{ x: 4, y: 6 }])).toBe(true);
  });
});
