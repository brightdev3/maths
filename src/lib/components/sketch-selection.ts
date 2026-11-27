import type { Point } from "./sketch-stroke";

export type Bounds = { x: number; y: number; w: number; h: number };

export function pointBounds(points: readonly Point[], padding = 0): Bounds {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { x, y } of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { x: left - padding, y: top - padding, w: right - left + 2 * padding, h: bottom - top + 2 * padding };
}

export function boxCorners({ x, y, w, h }: Bounds): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}

export function insideBox(p: Point, b: Bounds, tol = 0) {
  return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
}

function cross(a: Point, b: Point, p: Point) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point) {
  return (
    Math.abs(cross(a, b, p)) < 1e-6 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

function contains(polygon: readonly Point[], p: Point) {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (onSegment(a, b, p)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) {
      inside = !inside;
    }
  }
  return inside;
}

export function areaHit(area: readonly Point[], path: readonly Point[]) {
  if (!path.length) return false;
  const a = pointBounds(area);
  const b = pointBounds(path);
  if (a.x > b.x + b.w || b.x > a.x + a.w || a.y > b.y + b.h || b.y > a.y + a.h) return false;
  if (path.some((point) => insideBox(point, a) && contains(area, point))) return true;
  for (let i = 1; i < path.length; i++) {
    const start = path[i - 1];
    const end = path[i];
    for (let j = 0; j < area.length; j++) {
      const c = area[j];
      const d = area[(j + 1) % area.length];
      if (onSegment(start, end, c) || onSegment(start, end, d)) return true;
      if (cross(start, end, c) * cross(start, end, d) >= 0) continue;
      if (cross(c, d, start) * cross(c, d, end) < 0) return true;
    }
  }
  return false;
}
