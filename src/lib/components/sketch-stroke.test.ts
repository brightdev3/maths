import { describe, expect, mock, test } from "bun:test";
import { appendStrokeSamples, traceStroke, type Point } from "./sketch-stroke";

describe("appendStrokeSamples", () => {
  const origin = { left: 10, top: 20 };

  test("records coalesced samples in order without duplicating stationary points", () => {
    const points = [{ x: 0, y: 0 }];
    const samples = [
      { clientX: 10, clientY: 20 },
      { clientX: 12, clientY: 24 },
      { clientX: 12, clientY: 24 },
      { clientX: 15, clientY: 28 }
    ];
    expect(appendStrokeSamples(points, { ...samples[3], getCoalescedEvents: () => samples }, origin)).toBe(true);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 4 },
      { x: 5, y: 8 }
    ]);
  });

  test("falls back to the event when coalesced samples are absent or empty", () => {
    const points: Point[] = [];
    expect(appendStrokeSamples(points, { clientX: 10, clientY: 20 }, origin)).toBe(true);
    expect(appendStrokeSamples(points, { clientX: 10, clientY: 20, getCoalescedEvents: () => [] }, origin)).toBe(false);
    expect(appendStrokeSamples(points, { clientX: 13, clientY: 21, getCoalescedEvents: () => [] }, origin)).toBe(true);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 1 }
    ]);
  });
});

describe("traceStroke", () => {
  function recordedPath() {
    return { arc: mock(), moveTo: mock(), quadraticCurveTo: mock(), lineTo: mock() };
  }

  test("keeps taps as dots and two-point strokes as straight lines", () => {
    const dot = recordedPath();
    traceStroke(dot, [{ x: 2, y: 3 }], 4);
    expect(dot.arc.mock.calls).toEqual([[2, 3, 2, 0, Math.PI * 2]]);
    expect(dot.moveTo).not.toHaveBeenCalled();

    const line = recordedPath();
    traceStroke(
      line,
      [
        { x: 2, y: 3 },
        { x: 8, y: 15 }
      ],
      4
    );
    expect(line.moveTo.mock.calls).toEqual([[2, 3]]);
    expect(line.lineTo.mock.calls).toEqual([[8, 15]]);
    expect(line.quadraticCurveTo).not.toHaveBeenCalled();
  });

  test("joins curves at shared midpoints and retains the original endpoints", () => {
    const path = recordedPath();
    traceStroke(
      path,
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 8 },
        { x: 16, y: 8 }
      ],
      4
    );
    expect(path.moveTo.mock.calls).toEqual([[0, 0]]);
    expect(path.quadraticCurveTo.mock.calls).toEqual([
      [8, 0, 8, 4],
      [8, 8, 12, 8]
    ]);
    expect(path.lineTo.mock.calls).toEqual([[16, 8]]);
  });
});
