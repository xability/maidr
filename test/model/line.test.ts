import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Create a minimal line layer for model-only tests.
 * @param data Multiline data points for the trace
 * @returns Line layer definition for LineTrace
 */
function createLineLayer(data: MaidrLayer['data']): MaidrLayer {
  return {
    id: 'test-line-layer',
    type: TraceType.LINE,
    title: 'Intersection test layer',
    axes: {
      x: 'X',
      y: 'Y',
    },
    data,
  };
}

/**
 * Return only the intersection targets from an extrema target list.
 * @param targets All extrema targets produced by the trace
 * @returns Intersection targets only
 */
function getIntersectionTargets(targets: ExtremaTarget[]): ExtremaTarget[] {
  return targets.filter(target => target.type === 'intersection');
}

describe('LineTrace intersection classification', () => {
  test('labels a shared sampled point as a point intersection', () => {
    const trace = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    ]));

    const intersections = getIntersectionTargets(trace.getExtremaTargets());

    expect(intersections).toHaveLength(1);
    expect(intersections[0].intersectionKind).toBe('point');
    expect(intersections[0].label).toContain('Point intersection');
  });

  test('labels a segment-only crossing as a slope intersection', () => {
    const trace = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ],
      [
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ],
    ]));

    const intersections = getIntersectionTargets(trace.getExtremaTargets());

    expect(intersections).toHaveLength(1);
    expect(intersections[0].intersectionKind).toBe('slope');
    expect(intersections[0].label).toContain('Slope intersection');
  });
});

describe('LineTrace intersection rotor navigation', () => {
  test('reports intersection mode supported only for multiline traces', () => {
    const multiline = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ],
    ]));
    const single = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ]));

    expect(multiline.supportsIntersectionMode()).toBe(true);
    expect(single.supportsIntersectionMode()).toBe(false);
  });

  /**
   * Build a two-line trace with two point intersections (cols 1 and 4 on the
   * active line) and one slope intersection (near col 2) between them. Used to
   * verify that intersection navigation skips slope crossings.
   * @returns A LineTrace ready for intersection navigation assertions.
   */
  function createMixedIntersectionTrace(): LineTrace {
    return new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 5 },
        { x: 3, y: 0 },
        { x: 4, y: 5 },
      ],
      [
        { x: 0, y: 2 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
      ],
    ]));
  }

  test('moveToNextIntersection advances to the next point intersection, skipping slope crossings', () => {
    const trace = createMixedIntersectionTrace();
    trace.col = 0;

    expect(trace.moveToNextIntersection()).toBe(true);
    expect(trace.col).toBe(1);

    expect(trace.moveToNextIntersection()).toBe(true);
    expect(trace.col).toBe(4);
  });

  test('moveToNextIntersection returns false at the last intersection', () => {
    const trace = createMixedIntersectionTrace();
    trace.col = 4;

    expect(trace.moveToNextIntersection()).toBe(false);
    expect(trace.col).toBe(4);
  });

  test('moveToPrevIntersection retreats to the previous point intersection', () => {
    const trace = createMixedIntersectionTrace();
    trace.col = 4;

    expect(trace.moveToPrevIntersection()).toBe(true);
    expect(trace.col).toBe(1);

    expect(trace.moveToPrevIntersection()).toBe(false);
    expect(trace.col).toBe(1);
  });

  test('moveToPrevIntersection returns false when positioned before all intersections', () => {
    const trace = createMixedIntersectionTrace();
    trace.col = 0;

    expect(trace.moveToPrevIntersection()).toBe(false);
    expect(trace.col).toBe(0);
  });

  test('returns false when no point intersections exist on the current line', () => {
    const trace = new LineTrace(createLineLayer([
      [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ],
      [
        { x: 0, y: 2 },
        { x: 2, y: 0 },
      ],
    ]));
    trace.col = 0;

    expect(trace.moveToNextIntersection()).toBe(false);
    expect(trace.moveToPrevIntersection()).toBe(false);
  });
});
