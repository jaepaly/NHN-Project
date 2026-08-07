export interface TrapHazardCircleShape {
  x: number;
  y: number;
  radius: number;
}

export interface TrapHazardRectShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrapHazardLineSegment = readonly [number, number, number, number];

/** Boss hazard glow language at deliberately lower density and intensity. */
export const TRAP_HAZARD_PARTICLE_VFX = Object.freeze({
  speedMin: 12,
  speedMax: 32,
  angleMin: 240,
  angleMax: 300,
  lifespanMin: 650,
  lifespanMax: 950,
  frequency: 90,
  quantity: 2,
  scaleStart: 0.32,
  alphaStart: 0.62,
});

function rectContains(rect: TrapHazardRectShape, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function circleContains(circle: TrapHazardCircleShape, x: number, y: number): boolean {
  const dx = x - circle.x;
  const dy = y - circle.y;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

/** Draw only the circle boundary that is not already inside the outer hazard field. */
export function visibleCircleOutlineSegments(
  circle: TrapHazardCircleShape,
  boundaryRects: readonly TrapHazardRectShape[],
  segmentCount = 96,
): TrapHazardLineSegment[] {
  const count = Math.max(12, Math.floor(segmentCount));
  const segments: TrapHazardLineSegment[] = [];
  for (let index = 0; index < count; index += 1) {
    const startAngle = (Math.PI * 2 * index) / count;
    const endAngle = (Math.PI * 2 * (index + 1)) / count;
    const midAngle = (startAngle + endAngle) / 2;
    const midX = circle.x + Math.cos(midAngle) * circle.radius;
    const midY = circle.y + Math.sin(midAngle) * circle.radius;
    if (boundaryRects.some((rect) => rectContains(rect, midX, midY))) continue;
    segments.push([
      circle.x + Math.cos(startAngle) * circle.radius,
      circle.y + Math.sin(startAngle) * circle.radius,
      circle.x + Math.cos(endAngle) * circle.radius,
      circle.y + Math.sin(endAngle) * circle.radius,
    ]);
  }
  return segments;
}

/** Split straight outer boundaries and omit pieces covered by a circular hazard. */
export function visibleBoundaryOutlineSegments(
  source: readonly TrapHazardLineSegment[],
  circles: readonly TrapHazardCircleShape[],
  maxSegmentLength = 12,
): TrapHazardLineSegment[] {
  const visible: TrapHazardLineSegment[] = [];
  for (const [x1, y1, x2, y2] of source) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const count = Math.max(1, Math.ceil(length / Math.max(4, maxSegmentLength)));
    for (let index = 0; index < count; index += 1) {
      const t1 = index / count;
      const t2 = (index + 1) / count;
      const midT = (t1 + t2) / 2;
      const midX = x1 + (x2 - x1) * midT;
      const midY = y1 + (y2 - y1) * midT;
      if (circles.some((circle) => circleContains(circle, midX, midY))) continue;
      visible.push([
        x1 + (x2 - x1) * t1,
        y1 + (y2 - y1) * t1,
        x1 + (x2 - x1) * t2,
        y1 + (y2 - y1) * t2,
      ]);
    }
  }
  return visible;
}
