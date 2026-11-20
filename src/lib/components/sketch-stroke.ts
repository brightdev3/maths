export type Point = { x: number; y: number };

type PointerSample = Pick<PointerEvent, "clientX" | "clientY">;

export function appendStrokeSamples(
  points: Point[],
  event: PointerSample & { getCoalescedEvents?: () => PointerSample[] },
  origin: Pick<DOMRectReadOnly, "left" | "top">
) {
  const before = points.length;
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const x = sample.clientX - origin.left;
    const y = sample.clientY - origin.top;
    const last = points[points.length - 1];
    if (!last || last.x !== x || last.y !== y) points.push({ x, y });
  }
  return points.length !== before;
}

export function traceStroke(
  path: Pick<Path2D, "arc" | "moveTo" | "quadraticCurveTo" | "lineTo">,
  points: readonly Point[],
  width: number
) {
  if (points.length === 0) return;
  if (points.length === 1) {
    path.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    return;
  }

  path.moveTo(points[0].x, points[0].y);
  // Joining at midpoints gives adjacent curves the same tangent without
  // overshooting the samples. Keep the start and end at the actual pointer.
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const next = points[i + 1];
    path.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x, last.y);
}
