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
      x: { label: 'X' },
      y: { label: 'Y' },
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
