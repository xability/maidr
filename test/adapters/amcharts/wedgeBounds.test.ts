import type { AmSprite } from '@adapters/amcharts/types';
import { readSliceBounds, wedgeBounds } from '@adapters/amcharts/geometry';
import { describe, expect, it } from '@jest/globals';

/**
 * A `Slice` as amCharts 5.20.1 actually reports one.
 *
 * The point of this helper is the `globalBounds` it returns: a **degenerate
 * box at the wedge's centre**, which is what a real slice answers because it
 * paints through a draw callback and never feeds the bounds accumulator. The
 * existing amCharts tests give their fake slices real boxes, which is the one
 * thing amCharts does not do — so they passed while the highlight drew
 * nothing at all (#774).
 */
function slice(
  cx: number,
  cy: number,
  settings: Record<string, unknown>,
): AmSprite {
  return {
    globalBounds: () => ({ left: cx, top: cy, right: cx, bottom: cy }),
    width: () => 0,
    height: () => 0,
    get: (key: string) => settings[key],
  };
}

function near(bounds: ReturnType<typeof wedgeBounds>): number[] {
  expect(bounds).not.toBeNull();
  const b = bounds!;
  return [b.left, b.top, b.right, b.bottom].map(n => Math.round(n * 100) / 100);
}

describe('wedgeBounds measures a wedge amCharts reports no box for', () => {
  it('boxes the quarter from 12 to 3 o\'clock', () => {
    // -90 is 12 o'clock and angles run clockwise, so this wedge occupies the
    // top-right quarter: from the centre out to (cx + r, cy) and (cx, cy - r).
    const s = slice(100, 100, { radius: 50, startAngle: -90, arc: 90 });

    expect(near(wedgeBounds(s))).toEqual([100, 50, 150, 100]);
  });

  it('reaches the arc, not just its endpoints, when the sweep crosses a cardinal', () => {
    // -45..45 crosses 0, where the arc bulges to cx + r = 150. Both endpoints
    // sit at x = 135.36, so a box drawn from endpoints alone would stop short
    // and leave the widest part of the wedge outside the highlight.
    const s = slice(100, 100, { radius: 50, startAngle: -45, arc: 90 });

    expect(near(wedgeBounds(s))).toEqual([100, 64.64, 150, 135.36]);
  });

  it('includes the centre, which a wedge with no inner radius owns', () => {
    const s = slice(0, 0, { radius: 10, startAngle: 0, arc: 90 });

    // 0..90 is the bottom-right quarter in screen coordinates (y grows down),
    // so the box runs from the centre to (r, r) -- the centre is a corner.
    expect(near(wedgeBounds(s))).toEqual([0, 0, 10, 10]);
  });

  it('excludes the centre for a donut wedge that does not touch it', () => {
    const s = slice(100, 100, {
      radius: 50,
      innerRadius: 40,
      startAngle: -10,
      arc: 20,
    });

    const [left, top, right, bottom] = near(wedgeBounds(s));
    // A thin band on the right: nowhere near the centre at x = 100.
    expect(left).toBeCloseTo(139.39, 1);
    expect(right).toBeCloseTo(150, 1);
    expect(top).toBeCloseTo(91.32, 1);
    expect(bottom).toBeCloseTo(108.68, 1);
  });

  it('boxes the whole circle when the sweep is a full turn', () => {
    const s = slice(100, 100, { radius: 50, startAngle: -90, arc: 360 });

    expect(near(wedgeBounds(s))).toEqual([50, 50, 150, 150]);
  });

  it('handles a sweep that starts past a full turn', () => {
    // Same quarter as the first case, expressed 360 degrees round. The
    // cardinal search must follow the sweep rather than assume [0, 360).
    const s = slice(100, 100, { radius: 50, startAngle: 270, arc: 90 });

    expect(near(wedgeBounds(s))).toEqual([100, 50, 150, 100]);
  });

  it('returns null for a sprite that is not a wedge', () => {
    // An XY chart's column: a real box, no radius. Reporting a wedge box for
    // it would put a highlight somewhere the data is not.
    const column: AmSprite = {
      globalBounds: () => ({ left: 10, top: 20, right: 30, bottom: 40 }),
      get: () => undefined,
    };

    expect(wedgeBounds(column)).toBeNull();
  });

  it('returns null before the first layout, when there is no radius yet', () => {
    expect(wedgeBounds(slice(0, 0, {}))).toBeNull();
    expect(wedgeBounds(slice(0, 0, { radius: 0 }))).toBeNull();
  });
});

describe('readSliceBounds gives the panel a real rectangle', () => {
  it('unions the wedges instead of collapsing to their shared centre', () => {
    // Two halves of one pie. Every slice reports the same centre point, so
    // unioning the reported boxes gave a zero-area rectangle -- non-null, so
    // the binder did not suppress, and every highlight was clipped to nothing.
    const chart = {
      series: {
        values: [{
          dataItems: [
            { get: () => slice(100, 100, { radius: 50, startAngle: -90, arc: 180 }) },
            { get: () => slice(100, 100, { radius: 50, startAngle: 90, arc: 180 }) },
          ],
        }],
      },
    } as never;

    const bounds = readSliceBounds(chart);

    expect(bounds).not.toBeNull();
    expect(near(bounds)).toEqual([50, 50, 150, 150]);
    // The bug this replaces: a rectangle with no area at all.
    expect(bounds!.right - bounds!.left).toBeGreaterThan(0);
    expect(bounds!.bottom - bounds!.top).toBeGreaterThan(0);
  });

  it('reports nothing for a chart whose data items carry no slice', () => {
    const chart = {
      series: { values: [{ dataItems: [{ get: () => undefined }] }] },
    } as never;

    expect(readSliceBounds(chart)).toBeNull();
  });
});
