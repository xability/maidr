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
 * `strokeRect` really leaving an interior lowered, `fillPolygon` really filling
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

  describe('strokeRect and fillRect', () => {
    it('should leave the interior of a stroked rectangle lowered', () => {
      const raster = new DotRaster(8, 8);

      raster.strokeRect(1, 1, 6, 6);

      expect(raster.get(1, 1)).toBe(true);
      expect(raster.get(6, 6)).toBe(true);
      expect(raster.get(3, 3)).toBe(false);
      expect(raster.raisedCount).toBe(20);
    });

    it('should raise the interior of a filled rectangle', () => {
      const raster = new DotRaster(8, 8);

      raster.fillRect(1, 1, 6, 6);

      expect(raster.get(3, 3)).toBe(true);
      expect(raster.raisedCount).toBe(36);
    });

    it('should degenerate to a filled run when a rectangle is under three pins wide', () => {
      const stroked = new DotRaster(8, 8);
      const filled = new DotRaster(8, 8);

      stroked.strokeRect(2, 1, 3, 6);
      filled.fillRect(2, 1, 3, 6);

      expect(stroked.equals(filled)).toBe(true);
    });

    it('should degenerate to a filled run when a rectangle is under three pins tall', () => {
      const stroked = new DotRaster(8, 8);
      const filled = new DotRaster(8, 8);

      stroked.strokeRect(1, 2, 6, 3);
      filled.fillRect(1, 2, 6, 3);

      expect(stroked.equals(filled)).toBe(true);
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

  describe('invertRect', () => {
    it('should flip both raised and lowered pins inside the rectangle', () => {
      const raster = new DotRaster(6, 6);
      raster.set(1, 1);

      raster.invertRect(0, 0, 2, 2);

      expect(raster.get(1, 1)).toBe(false);
      expect(raster.get(0, 0)).toBe(true);
      expect(raster.get(2, 2)).toBe(true);
      expect(raster.raisedCount).toBe(8);
    });

    it('should leave pins outside the rectangle alone', () => {
      const raster = new DotRaster(6, 6);
      raster.set(4, 4);

      raster.invertRect(0, 0, 2, 2);

      expect(raster.get(4, 4)).toBe(true);
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
      raster.fillRect(0, 0, 3, 3);

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

    it('should raise the pins of the other raster on union and leave the rest', () => {
      const target = new DotRaster(4, 4);
      const other = new DotRaster(4, 4);
      target.set(0, 0);
      other.set(3, 3);

      target.union(other);

      expect(target.get(0, 0)).toBe(true);
      expect(target.get(3, 3)).toBe(true);
      expect(target.raisedCount).toBe(2);
    });

    it('should ignore a union with a raster of different dimensions', () => {
      const target = new DotRaster(4, 4);
      const other = new DotRaster(5, 5);
      other.fillRect(0, 0, 4, 4);

      target.union(other);

      expect(target.isEmpty()).toBe(true);
    });

    it('should report two identically drawn rasters as equal', () => {
      const left = new DotRaster(5, 5);
      const right = new DotRaster(5, 5);

      left.strokeRect(0, 0, 4, 4);
      right.strokeRect(0, 0, 4, 4);

      expect(left.equals(right)).toBe(true);
    });

    it('should report a one-pin difference as unequal so the frame is still sent', () => {
      const left = new DotRaster(5, 5);
      const right = new DotRaster(5, 5);
      left.strokeRect(0, 0, 4, 4);
      right.strokeRect(0, 0, 4, 4);

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
      original.strokeRect(0, 0, 4, 4);

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

      raster.strokeRect(0, 0, 4, 2);

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

    expect(raster.raisedCount).toBe(4);
    expect(raster.get(4, 4)).toBe(true);
    expect(raster.get(5, 5)).toBe(true);
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

    const raster = TactileRenderer.render(
      { marks: [mark], focused: [mark] },
      identityViewport(),
      DOTS_ACROSS,
      DOTS_DOWN,
    );

    expect(raster.get(4, 2)).toBe(true);
    expect(raster.get(6, 4)).toBe(true);
    expect(raster.get(4, 4)).toBe(false);
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
