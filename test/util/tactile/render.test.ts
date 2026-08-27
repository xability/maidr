/**
 * Tests for `src/util/tactile/raster.ts` and `src/util/tactile/render.ts`, the
 * two halves of turning a chart into pins.
 *
 * The rule these pin is the one the whole tactile feature rests on: every mark
 * of the trace is drawn as an **outline**, and the mark the reader is currently
 * on is drawn **filled**. It is easy to read that as a cosmetic choice and
 * "simplify" it into filling everything, because on a screen a field of solid
 * shapes is perfectly legible. Under a fingertip it is not. A pin is either up
 * or down — there is no grey, no colour and no highlight — so the only contrast
 * left is density, and a row of solid bars offers a finger nothing to tell one
 * bar from the next. Hollow marks give edges to trace and count, and a single
 * solid mark among them is found immediately. Break the split and the display
 * still transmits, still raises pins, and still looks plausible in a log; the
 * only detector is a reader who can no longer find where they are.
 *
 * The `DotRaster` cases below guard the primitives that split depends on:
 * `polyline` really leaving an interior lowered, `fillPolygon` really filling
 * one (and keeping a hole where two rings nest), and the degenerate sizes where
 * hollow is not expressible and the code deliberately falls back to solid. They
 * also cover the guards that exist because callers draw off the edge on purpose
 * — an out-of-bounds `set` is ignored rather than thrown, and a `NaN` endpoint
 * ends `line` instead of spinning until the tab dies — and `equals`, which is
 * what suppresses a redundant frame on the wire, so a one-pin difference must
 * not compare equal.
 *
 * `TactileRenderer.render` is exercised through a mocked `TactileSvgGeometry`.
 * The real one calls `getScreenCTM` and `getPointAtLength`, which jsdom does
 * not implement at all, so a test built on real SVG elements here would be
 * testing a layout engine that always answers zero. Feeding hand-written rings
 * in dot coordinates instead keeps these cases on the question that matters —
 * which marks came out hollow and which came out solid — rather than on
 * geometry this environment cannot produce.
 */

import type { DotRing } from '@util/tactile/svgGeometry';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DotRaster } from '@util/tactile/raster';
import { TactileRenderer } from '@util/tactile/render';
import { TactileSvgGeometry } from '@util/tactile/svgGeometry';
import { TactileViewport } from '@util/tactile/viewport';

jest.mock('@util/tactile/svgGeometry', () => ({
  TactileSvgGeometry: {
    ringsOf: jest.fn(),
    isRenderable: jest.fn(() => true),
  },
}));

/**
 * A closed square ring, as `ringsOf` hands one to the renderer.
 * @param left - Left dot column
 * @param top - Top dot row
 * @param size - Side length in dots
 */
function boxRing(left: number, top: number, size: number): { x: number; y: number }[] {
  const right = left + size;
  const bottom = top + size;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}

describe('dotRaster', () => {
  describe('set and get', () => {
    it('should round-trip a pin that was raised', () => {
      const raster = new DotRaster(6, 4);

      raster.set(3, 2);

      expect(raster.get(3, 2)).toBe(true);
    });

    it('should lower a pin again when set with on false', () => {
      const raster = new DotRaster(6, 4);
      raster.set(3, 2);

      raster.set(3, 2, false);

      expect(raster.get(3, 2)).toBe(false);
    });

    it('should ignore a set outside the buffer rather than throwing', () => {
      const raster = new DotRaster(6, 4);

      const draw = (): void => {
        raster.set(-1, 0);
        raster.set(6, 0);
        raster.set(0, -1);
        raster.set(0, 4);
        raster.set(Number.NaN, Number.NaN);
      };

      expect(draw).not.toThrow();
      expect(raster.raisedCount).toBe(0);
    });

    it('should read a coordinate outside the buffer as lowered', () => {
      const raster = new DotRaster(6, 4);

      const outside = [raster.get(-1, 0), raster.get(6, 0), raster.get(0, -1), raster.get(0, 4)];

      expect(outside).toEqual([false, false, false, false]);
    });
  });

  describe('hLine and vLine', () => {
    it('should draw the same horizontal run whichever way round the endpoints are given', () => {
      const forward = new DotRaster(8, 3);
      const backward = new DotRaster(8, 3);

      forward.hLine(2, 6, 1);
      backward.hLine(6, 2, 1);

      expect(forward.equals(backward)).toBe(true);
      expect(forward.raisedCount).toBe(5);
    });

    it('should draw the same vertical run whichever way round the endpoints are given', () => {
      const forward = new DotRaster(3, 8);
      const backward = new DotRaster(3, 8);

      forward.vLine(1, 2, 6);
      backward.vLine(1, 6, 2);

      expect(forward.equals(backward)).toBe(true);
      expect(forward.raisedCount).toBe(5);
    });
  });

  describe('runs that reach past the buffer', () => {
    // These are hang tests as much as correctness tests. `hLine`/`vLine` used
    // to loop from the caller's endpoint to the caller's endpoint with no
    // bound, and a zoomed-in view projects chart geometry far outside a
    // sixty-pin display -- so the loop ran once per pin of the *chart*. With an
    // endpoint of Infinity, which a path carrying an out-of-range coordinate
    // produces, `x++` never advances and the tab is gone. Each case below
    // hangs rather than fails if the clamp is removed, and jest's per-test
    // timeout is what turns that back into a failure.
    it('should terminate on a horizontal run with an infinite endpoint', () => {
      const raster = new DotRaster(20, 20);

      raster.hLine(0, Number.POSITIVE_INFINITY, 5);

      expect(raster.raisedCount).toBe(20);
    });

    it('should terminate on a vertical run with an infinite endpoint', () => {
      const raster = new DotRaster(20, 20);

      raster.vLine(5, Number.NEGATIVE_INFINITY, 3);

      expect(raster.raisedCount).toBe(4);
    });

    it('should cost one step per pin of the display, not of the chart', () => {
      const raster = new DotRaster(20, 20);

      raster.hLine(-5_000_000, 5_000_000, 7);

      expect(raster.raisedCount).toBe(20);
    });

    it('should skip a polygon edge whose x is not a number rather than filling to infinity', () => {
      // Only `y` used to be checked, on the reasoning that `y` is what the
      // scan line is compared against. But an edge with a finite `y` and an
      // infinite `x` still crosses the row, and the crossing it contributes is
      // the endpoint the fill then runs to.
      const raster = new DotRaster(20, 20);

      raster.fillPolygon([[
        { x: 2, y: 2 },
        { x: Number.POSITIVE_INFINITY, y: 2 },
        { x: 8, y: 8 },
        { x: 2, y: 8 },
      ]]);

      expect(raster.get(19, 5)).toBe(false);
    });
  });

  describe('line', () => {
    it('should raise a pin in every row a steep diagonal crosses', () => {
      const raster = new DotRaster(12, 12);

      raster.line(0, 0, 5, 11);

      const rowsWithPins = rowsHoldingAPin(raster);
      expect(rowsWithPins).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('should raise a pin in every column a shallow diagonal crosses', () => {
      const raster = new DotRaster(12, 12);

      raster.line(0, 0, 11, 5);

      const columnsWithPins = columnsHoldingAPin(raster);
      expect(columnsWithPins).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('should draw nothing when an endpoint is not a number', () => {
      const raster = new DotRaster(12, 12);

      raster.line(0, 0, Number.NaN, 5);

      // A line to an unknown endpoint has no path, so raising the pin it
      // happened to start from would put a mark on the display that stands
      // for nothing in the chart.
      expect(raster.raisedCount).toBe(0);
    });

    it('should draw the visible part of a line that starts far off the buffer', () => {
      const raster = new DotRaster(60, 40);

      raster.line(-300, 20, 420, 20);

      // Zooming in projects chart geometry a long way outside the display, so
      // most lines crossing the view arrive from well off one edge. Bounding
      // the plot by the buffer size drops those entirely: this raised nothing
      // at all before the endpoints were checked for finiteness instead.
      expect(columnsHoldingAPin(raster)).toHaveLength(60);
    });

    it('should draw a line that leaves the buffer partway across', () => {
      const raster = new DotRaster(60, 40);

      raster.line(30, 20, 900, 20);

      expect(raster.get(30, 20)).toBe(true);
      expect(raster.get(59, 20)).toBe(true);
    });
  });

  describe('strokePath', () => {
    /**
     * How many pins the stroke raises on one row.
     * @param raster - The raster to measure
     * @param y - The row to count
     */
    function acrossRow(raster: DotRaster, y: number): number {
      let count = 0;
      for (let x = 0; x < raster.width; x++) {
        if (raster.get(x, y)) {
          count++;
        }
      }
      return count;
    }

    it('should draw a horizontal stroke exactly as many pins deep as it was asked for', () => {
      const raster = new DotRaster(12, 12);

      raster.strokePath([{ x: 1, y: 5 }, { x: 10, y: 5 }], 2);

      const rows = [4, 5, 6, 7].filter(y => acrossRow(raster, y) > 0);
      expect(rows).toHaveLength(2);
    });

    it('should keep a diagonal stroke at its asked-for width', () => {
      // The case that made a line chart unreadable. Offsetting a 45-degree
      // diagonal by a pin in x and again in y lands on four distinct columns
      // per row, so a stroke asked for at two pins arrived at four and the
      // line came back as a band with no edge to follow.
      const raster = new DotRaster(20, 20);

      raster.strokePath([{ x: 2, y: 2 }, { x: 16, y: 16 }], 2);

      const widths = [];
      for (let y = 4; y <= 14; y++) {
        widths.push(acrossRow(raster, y));
      }
      expect(Math.max(...widths)).toBeLessThanOrEqual(2);
    });

    it('should leave no notch where the path turns', () => {
      // The offset copies of two segments sit on different sides of the
      // vertex, so without a stitch the stroke opens up exactly where a reader
      // is feeling for the corner.
      const raster = new DotRaster(12, 12);

      raster.strokePath([{ x: 2, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 9 }], 2);

      // The corner pin's offset copy, and the neighbour that joins it to the
      // vertical run's offset copy.
      expect(raster.get(9, 3)).toBe(true);
      expect(raster.get(8, 3)).toBe(true);
    });

    it('should draw a plain polyline at weight one', () => {
      const thin = new DotRaster(12, 12);
      const plain = new DotRaster(12, 12);

      thin.strokePath([{ x: 1, y: 5 }, { x: 10, y: 5 }], 1);
      plain.polyline([{ x: 1, y: 5 }, { x: 10, y: 5 }]);

      expect(thin.equals(plain)).toBe(true);
    });
  });

  describe('fillPolygon', () => {
    it('should raise the interior of a triangle and leave the outside lowered', () => {
      const raster = new DotRaster(12, 12);

      raster.fillPolygon([[
        { x: 5, y: 1 },
        { x: 10, y: 9 },
        { x: 1, y: 9 },
      ]]);

      expect(raster.get(5, 5)).toBe(true);
      expect(raster.get(5, 2)).toBe(true);
      expect(raster.get(1, 2)).toBe(false);
      expect(raster.get(10, 2)).toBe(false);
    });

    it('should leave the inner of two nested rings hollow under the even-odd rule', () => {
      const raster = new DotRaster(12, 12);

      raster.fillPolygon([
        [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 10 }, { x: 1, y: 10 }],
        [{ x: 4, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 7 }, { x: 4, y: 7 }],
      ]);

      expect(raster.get(2, 5)).toBe(true);
      expect(raster.get(9, 5)).toBe(true);
      expect(raster.get(5, 5)).toBe(false);
      expect(raster.get(6, 6)).toBe(false);
    });

    it('should draw nothing when every ring point failed to project', () => {
      const raster = new DotRaster(12, 12);

      raster.fillPolygon([[
        { x: Number.NaN, y: Number.NaN },
        { x: 4, y: Number.NaN },
      ]]);

      expect(raster.isEmpty()).toBe(true);
    });
  });

  describe('buffer operations', () => {
    it('should report an untouched raster as empty and a written one as not', () => {
      const raster = new DotRaster(4, 4);

      const before = raster.isEmpty();
      raster.set(2, 2);
      const after = raster.isEmpty();

      expect(before).toBe(true);
      expect(after).toBe(false);
    });

    it('should return to empty after clear', () => {
      const raster = new DotRaster(4, 4);
      raster.fillPolygon([boxRing(0, 0, 3)]);

      raster.clear();

      expect(raster.isEmpty()).toBe(true);
      expect(raster.raisedCount).toBe(0);
    });

    it('should count every raised pin', () => {
      const raster = new DotRaster(4, 4);

      raster.hLine(0, 3, 0);
      raster.set(0, 0);

      expect(raster.raisedCount).toBe(4);
    });

    it('should report two identically drawn rasters as equal', () => {
      const left = new DotRaster(5, 5);
      const right = new DotRaster(5, 5);

      left.polyline(boxRing(0, 0, 4));
      right.polyline(boxRing(0, 0, 4));

      expect(left.equals(right)).toBe(true);
    });

    it('should report a one-pin difference as unequal so the frame is still sent', () => {
      const left = new DotRaster(5, 5);
      const right = new DotRaster(5, 5);
      left.polyline(boxRing(0, 0, 4));
      right.polyline(boxRing(0, 0, 4));

      right.set(2, 2);

      expect(left.equals(right)).toBe(false);
    });

    it('should report rasters of different dimensions as unequal', () => {
      const left = new DotRaster(4, 4);
      const right = new DotRaster(5, 4);

      const same = left.equals(right);

      expect(same).toBe(false);
    });

    it('should copy the pins on clone without sharing the buffer', () => {
      const original = new DotRaster(5, 5);
      original.polyline(boxRing(0, 0, 4));

      const copy = original.clone();
      copy.set(2, 2);

      expect(original.get(2, 2)).toBe(false);
      expect(copy.get(2, 2)).toBe(true);
      expect(copy.raisedCount).toBe(original.raisedCount + 1);
    });
  });

  describe('toString', () => {
    it('should render a stroked rectangle as a hollow picture', () => {
      const raster = new DotRaster(5, 3);

      raster.hLine(0, 4, 0);
      raster.hLine(0, 4, 2);
      raster.vLine(0, 0, 2);
      raster.vLine(4, 0, 2);

      expect(raster.toString()).toBe([
        'OOOOO',
        'O...O',
        'OOOOO',
      ].join('\n'));
    });

    it('should render with the requested characters', () => {
      const raster = new DotRaster(3, 1);

      raster.set(1, 0);

      expect(raster.toString('#', ' ')).toBe(' # ');
    });
  });
});

describe('tactileRenderer.render', () => {
  const DOTS_ACROSS = 20;
  const DOTS_DOWN = 20;

  /**
   * A viewport whose dot coordinates equal its client pixels, so a rectangle
   * written in the test reads directly as the pins it should reach.
   */
  const identityViewport = (): TactileViewport => new TactileViewport(
    { left: 0, top: 0, width: DOTS_ACROSS - 1, height: DOTS_DOWN - 1 },
    DOTS_ACROSS,
    DOTS_DOWN,
  );

  const ringsOf = jest.mocked(TactileSvgGeometry.ringsOf);

  const square: DotRing = {
    points: [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 8 },
      { x: 2, y: 8 },
    ],
    closed: true,
  };

  beforeEach(() => {
    ringsOf.mockReset();
    ringsOf.mockReturnValue([]);
  });

  it('should draw a mark the reader is not on as a hollow outline', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(2, 2)).toBe(true);
    expect(raster.get(8, 5)).toBe(true);
    expect(raster.get(5, 5)).toBe(false);
    expect(raster.get(4, 6)).toBe(false);
  });

  it('should draw the same mark filled when it is the one the reader is on', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(5, 5)).toBe(true);
    expect(raster.get(4, 6)).toBe(true);
    expect(raster.get(3, 3)).toBe(true);
  });

  it('should raise more pins for a focused mark than for the same mark unfocused', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);
    const viewport = identityViewport();

    const outlined = TactileRenderer.render(
      { marks: [mark], focused: [] },
      viewport,
      DOTS_ACROSS,
      DOTS_DOWN,
    );
    const filled = TactileRenderer.render(
      { marks: [], focused: [mark] },
      viewport,
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(filled.raisedCount).toBeGreaterThan(outlined.raisedCount);
    expect(filled.equals(outlined)).toBe(false);
  });

  it('should keep the unfocused marks hollow while the focused one is solid', () => {
    const left = {} as SVGGraphicsElement;
    const right = {} as SVGGraphicsElement;
    ringsOf.mockImplementation(element => [element === left ? square : shifted(square, 9, 0)]);

    const raster = TactileRenderer.render(
      { marks: [left, right], focused: [right] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(5, 5)).toBe(false);
    expect(raster.get(14, 5)).toBe(true);
  });

  it('should draw a mark listed in both marks and focused once, filled', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);
    const viewport = identityViewport();
    const focusedOnly = TactileRenderer.render(
      { marks: [], focused: [mark] },
      viewport,
      DOTS_ACROSS,
      DOTS_DOWN,
    );
    ringsOf.mockClear();

    const both = TactileRenderer.render(
      { marks: [mark], focused: [mark] },
      viewport,
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(ringsOf).toHaveBeenCalledTimes(1);
    expect(both.equals(focusedOnly)).toBe(true);
  });

  it('should draw nothing but the marks, leaving no frame around them', () => {
    // The plot region used to be outlined so the reader had an anchor. On
    // sixty pins across, that border is two whole columns and two whole rows
    // spent on something that carries no data, and it boxes the marks into a
    // smaller grid than the display has. The marks get the pins instead.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    for (let x = 0; x < DOTS_ACROSS; x++) {
      expect(raster.get(x, 0)).toBe(false);
      expect(raster.get(x, DOTS_DOWN - 1)).toBe(false);
    }
    for (let y = 0; y < DOTS_DOWN; y++) {
      expect(raster.get(0, y)).toBe(false);
      expect(raster.get(DOTS_ACROSS - 1, y)).toBe(false);
    }
    expect(raster.get(2, 2)).toBe(true);
  });

  it('should render a ring below the hollow threshold as its own pins rather than nothing', () => {
    const mark = {} as SVGGraphicsElement;
    const tiny: DotRing = {
      points: [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      closed: true,
    };
    ringsOf.mockReturnValue([tiny]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Findable, and heavier than the same mark unfocused. A mark this small
    // has no interior to fill, so filling cannot be what marks it out — and a
    // one-pin dot among one-pin dots leaves the reader no answer at all to
    // which point they are on, which is the state a scatter or a dot plot was
    // in.
    const unfocused = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(4, 4)).toBe(true);
    expect(raster.get(5, 5)).toBe(true);
    expect(raster.raisedCount).toBeGreaterThan(unfocused.raisedCount);
  });

  it('should render a single-point ring as one pin', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{ points: [{ x: 7, y: 9 }], closed: false }]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(7, 9)).toBe(true);
    expect(raster.raisedCount).toBe(1);
  });

  it('should render an open ring as a polyline that does not close back on itself', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 6 }],
      closed: false,
    }]);

    // Unfocused, so the stroke is the ordinary two pins. (4, 4) sits on the
    // diagonal a closing segment would take and clear of the two-pin band
    // around either real segment, so it stays down unless the ring was closed.
    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(4, 2)).toBe(true);
    expect(raster.get(6, 4)).toBe(true);
    expect(raster.get(4, 4)).toBe(false);
  });

  it('should draw an unfocused line exactly one pin thick', () => {
    // Deliberately one pin, and deliberately a reversal: strokes were drawn at
    // two for a while, on the reasoning that a one-pin diagonal steps in pins
    // touching only at their corners and so reads as bumps rather than a line.
    // Read on a device, that traded one problem for a worse one -- at two pins
    // a diagonal comes out three and four wide where the offset copies meet at
    // a bend, a single line reads as a band, and several read as one mass.
    // What the second pin was buying is bought instead by the focused stroke
    // being heavier than the thin ones around it. Dash patterns per series
    // were tried for the same job and taken out: on a device they made a
    // multi-line chart harder, since a broken line has to be reassembled
    // before it can be followed.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [{ x: 2, y: 2 }, { x: 12, y: 12 }],
      closed: false,
    }]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // The diagonal itself, and nothing beside it.
    for (let step = 2; step <= 12; step++) {
      expect(raster.get(step, step)).toBe(true);
      expect(raster.get(step - 1, step)).toBe(false);
      expect(raster.get(step + 1, step)).toBe(false);
    }
  });

  it('should mark the focused line without an interior to fill', () => {
    // Filling is what says "you are here", and a line has nothing to fill. On
    // line charts, survival curves, error bars and whiskers the reader had no
    // tactile answer at all to which mark they were on.
    const mark = {} as SVGGraphicsElement;
    const stroke = { points: [{ x: 2, y: 6 }, { x: 16, y: 6 }], closed: false };
    ringsOf.mockReturnValue([stroke]);

    const plain = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );
    const focused = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(focused.raisedCount).toBeGreaterThan(plain.raisedCount);
    expect(focused.equals(plain)).toBe(false);
  });

  it('should still fill a focused mark that is tall but wholly on the grid', () => {
    // A trace is mapped onto the pins by the extent of all its marks, so a bar
    // chart's tallest bar spans nearly the whole height by construction, at
    // rest, with nothing zoomed into. Judging by span outlined that bar — the
    // single mark a reader is likeliest to land on — and left no solid shape
    // among the hollow ones anywhere on the display.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [
        { x: 2, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: DOTS_DOWN - 1 },
        { x: 2, y: DOTS_DOWN - 1 },
      ],
      closed: true,
    }]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(6, Math.floor(DOTS_DOWN / 2))).toBe(true);
  });

  it('should outline a focused mark that covers the whole grid without leaving it', () => {
    // A mark can cover the display without any edge crossing its boundary, and
    // filling that raises every pin. A gauge came back from the audit as 2204
    // of 2400 pins with nothing to feel but the edge of the device.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [
        { x: 0, y: 0 },
        { x: DOTS_ACROSS - 1, y: 0 },
        { x: DOTS_ACROSS - 1, y: DOTS_DOWN - 1 },
        { x: 0, y: DOTS_DOWN - 1 },
      ],
      closed: true,
    }]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(Math.floor(DOTS_ACROSS / 2), Math.floor(DOTS_DOWN / 2))).toBe(false);
  });

  it('should outline a focused mark whose edges have run off the grid', () => {
    // A bar zoomed into: its top and bottom are both past the edge of the
    // grid, so a fill would leave the reader inside a shape whose boundary
    // they cannot reach — a thousand-pin plateau with nothing to feel.
    const mark = {} as SVGGraphicsElement;
    const narrow = Math.round(DOTS_ACROSS * 0.4);
    ringsOf.mockReturnValue([{
      points: [
        { x: 2, y: -5 },
        { x: 2 + narrow, y: -5 },
        { x: 2 + narrow, y: DOTS_DOWN + 5 },
        { x: 2, y: DOTS_DOWN + 5 },
      ],
      closed: true,
    }]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Its middle is left down: the sides are what still say where it is.
    expect(raster.get(2 + Math.floor(narrow / 2), Math.floor(DOTS_DOWN / 2))).toBe(false);
  });

  it('should mark a focused point as a disc rather than a thickening of its line', () => {
    // On a line chart the focused vertex sat as a one-pin spur against a
    // two-pin stroke, which under a finger is the same line slightly thicker.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{ points: [{ x: 10, y: 10 }], closed: false }]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Solid across its middle, not a cross with a hollow between the arms.
    expect(raster.get(9, 9)).toBe(true);
    expect(raster.get(11, 11)).toBe(true);
    expect(raster.raisedCount).toBeGreaterThan(8);
  });

  it('should outline rather than fill a focused mark that would swamp the grid', () => {
    // Zoomed in, a filled mark stops being a cue and becomes the display: the
    // reader's hand meets a featureless plateau with the mark's own edges
    // pushed off the grid. Across the example gallery this raised 65-95% of
    // the pins and left nothing to feel. Its boundary is what still carries
    // information once the reader is inside it.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [
        { x: -4, y: -4 },
        { x: DOTS_ACROSS + 4, y: -4 },
        { x: DOTS_ACROSS + 4, y: DOTS_DOWN + 4 },
        { x: -4, y: DOTS_DOWN + 4 },
      ],
      closed: true,
    }]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Not every pin: a mark bigger than the grid, filled, is every pin.
    expect(raster.raisedCount).toBeLessThan(DOTS_ACROSS * DOTS_DOWN);
  });

  it('should still fill a focused mark small enough to leave something around it', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);

    const raster = TactileRenderer.render(
      { marks: [], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Interior raised, which is what a fill means.
    expect(raster.get(5, 5)).toBe(true);
    expect(raster.get(4, 6)).toBe(true);
  });

  it('should texture a mark by the value its chart drew as a colour', () => {
    // The pin grid has two states, so a value drawn as a colour has nowhere
    // else to go. A heatmap cell, a choropleth region and a mosaic tile are all
    // the same size and shape as their neighbours — without this the display
    // carries their lattice and none of their numbers.
    const pale = {} as SVGGraphicsElement;
    const dark = {} as SVGGraphicsElement;
    ringsOf.mockImplementation(element => [element === pale ? square : shifted(square, 9, 0)]);

    const raster = TactileRenderer.render(
      {
        marks: [pale, dark],
        focused: [],
        shades: new Map([[pale, 0.1], [dark, 0.9]]),
      },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    // Same shape, same size, different crowding — which is the only difference
    // a fingertip can read between two cells that differ only in value.
    let paleInterior = 0;
    let darkInterior = 0;
    for (let y = 3; y < 8; y++) {
      for (let x = 3; x < 8; x++) {
        if (raster.get(x, y)) {
          paleInterior++;
        }
        if (raster.get(x + 9, y)) {
          darkInterior++;
        }
      }
    }

    expect(darkInterior).toBeGreaterThan(paleInterior);
  });

  it('should leave a mark hollow when its chart gave it no value to carry', () => {
    // Fill is decoration on a bar chart — a bar's colour is its series, not its
    // height. Texturing those would fill in the interiors that tell an ordinary
    // mark from the solid focused one.
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([square]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(5, 5)).toBe(false);
  });

  it('should render an empty scene as an empty raster', () => {
    const raster = TactileRenderer.render(
      { marks: [], focused: [] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.isEmpty()).toBe(true);
    expect(ringsOf).not.toHaveBeenCalled();
  });

  it('should render a mark whose rings all failed to project as an empty raster', () => {
    const mark = {} as SVGGraphicsElement;
    ringsOf.mockReturnValue([{
      points: [{ x: Number.NaN, y: Number.NaN }],
      closed: true,
    }]);

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.isEmpty()).toBe(true);
  });
});

/**
 * Rows of the raster holding at least one raised pin, in order.
 * @param raster - The buffer to scan
 */
function rowsHoldingAPin(raster: DotRaster): number[] {
  const rows: number[] = [];
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (raster.get(x, y)) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}

/**
 * Columns of the raster holding at least one raised pin, in order.
 * @param raster - The buffer to scan
 */
function columnsHoldingAPin(raster: DotRaster): number[] {
  const columns: number[] = [];
  for (let x = 0; x < raster.width; x++) {
    for (let y = 0; y < raster.height; y++) {
      if (raster.get(x, y)) {
        columns.push(x);
        break;
      }
    }
  }
  return columns;
}

/**
 * A copy of a ring moved by a dot offset, for placing a second mark beside the
 * first.
 * @param ring - The ring to copy
 * @param dx - Dot columns to move by
 * @param dy - Dot rows to move by
 */
function shifted(ring: DotRing, dx: number, dy: number): DotRing {
  return {
    points: ring.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
    closed: ring.closed,
  };
}
