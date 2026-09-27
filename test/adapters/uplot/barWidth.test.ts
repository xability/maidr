/**
 * @jest-environment jsdom
 */

import type { BarToMeasure } from '@adapters/uplot/barWidth';
import type { UPlotInstance } from '@adapters/uplot/types';
import { colorRunAround, measuredBarWidth } from '@adapters/uplot/barWidth';

/**
 * Measuring a bar's drawn width off the canvas.
 *
 * uPlot keeps no record of how wide it drew a bar, so the width is read back
 * from the pixels: the run of the bar's own color through its centre. These
 * tests pin what counts as that run -- through the thin grid lines a
 * translucent fill lets show, but not through a real gap -- and that anything
 * which cannot be read falls back to `null`, leaving the caller's default.
 */

type RGBA = [number, number, number, number];

const CLEAR: RGBA = [0, 0, 0, 0];
const BAR: RGBA = [214, 39, 40, 255];
const GRID: RGBA = [200, 200, 200, 255];
const OTHER: RGBA = [31, 119, 180, 255];

/** An RGBA row of `width` clear pixels with `paint` applied over it. */
function row(width: number, paint: Array<[from: number, to: number, color: RGBA]>): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(width * 4);
  for (const [from, to, color] of paint) {
    for (let i = from; i <= to; i++) {
      bytes.set(color, i * 4);
    }
  }
  return bytes;
}

describe('colorRunAround', () => {
  it('spans a solid run through the centre', () => {
    const pixels = row(100, [[20, 59, BAR]]);
    expect(colorRunAround(pixels, 100, 40)).toEqual({ start: 20, end: 59, filled: false });
  });

  it('tolerates antialiased shades within the tolerance', () => {
    const pixels = row(50, [[10, 29, BAR], [10, 10, [230, 50, 55, 255]], [29, 29, [200, 30, 30, 255]]]);
    expect(colorRunAround(pixels, 50, 20)).toEqual({ start: 10, end: 29, filled: false });
  });

  it.each([1, 2])('crosses a %dpx grid line inside the bar', (lineWidth) => {
    const pixels = row(100, [[20, 59, BAR], [50, 49 + lineWidth, GRID]]);
    expect(colorRunAround(pixels, 100, 35)).toEqual({ start: 20, end: 59, filled: false });
  });

  it('stops at an interruption of three pixels', () => {
    const pixels = row(100, [[20, 59, BAR], [50, 52, GRID]]);
    expect(colorRunAround(pixels, 100, 35)).toEqual({ start: 20, end: 49, filled: false });
  });

  it('does not run into a neighbouring bar of another color', () => {
    const pixels = row(100, [[20, 39, BAR], [40, 59, OTHER]]);
    expect(colorRunAround(pixels, 100, 30)).toEqual({ start: 20, end: 39, filled: false });
  });

  it('samples the bar\'s color by majority when a grid line runs through the centre', () => {
    // A translucent bar over a vertical grid line: the centre pixel itself is
    // the grid line, but the bar's color is the most common around it.
    const pixels = row(100, [[20, 59, BAR], [40, 40, GRID]]);
    expect(colorRunAround(pixels, 100, 40)).toEqual({ start: 20, end: 59, filled: false });
  });

  it('returns null when the centre is transparent', () => {
    const pixels = row(100, [[0, 9, BAR]]);
    expect(colorRunAround(pixels, 100, 50)).toBeNull();
  });

  it.each([-1, 100, 250])('returns null for a centre at %d, outside the row', (center) => {
    const pixels = row(100, [[0, 99, BAR]]);
    expect(colorRunAround(pixels, 100, center)).toBeNull();
  });

  it('stops at the ends of the row', () => {
    const pixels = row(10, [[0, 9, BAR]]);
    // The plot's edge cuts a bar off; it does not make it fill its column.
    expect(colorRunAround(pixels, 10, 0)).toEqual({ start: 0, end: 9, filled: false });
    expect(colorRunAround(pixels, 10, 9)).toEqual({ start: 0, end: 9, filled: false });
    const clipped = row(10, [[0, 5, BAR]]);
    expect(colorRunAround(clipped, 10, 2)).toEqual({ start: 0, end: 5, filled: false });
  });

  describe('with limits', () => {
    const OUTLINE: RGBA = [20, 20, 20, 255];

    it('does not fill the column when the run stopped short of its edge', () => {
      // Bar 40..58, a 2px gap, then the column's edge at 40 +- 10 from 50.
      const pixels = row(100, [[42, 58, BAR]]);
      expect(colorRunAround(pixels, 100, 50, { reach: 10 })).toEqual({ start: 42, end: 58, filled: false });
    });

    it('reaches no further than `reach` either side of the centre', () => {
      // Touching bars of one color, as in a histogram: one unbroken run.
      const pixels = row(100, [[0, 99, BAR]]);
      expect(colorRunAround(pixels, 100, 50, { reach: 10 })).toEqual({ start: 40, end: 60, filled: true });
    });

    it('is not filled when the run ends inside its reach on one side', () => {
      const pixels = row(100, [[45, 99, BAR]]);
      expect(colorRunAround(pixels, 100, 50, { reach: 10 })).toEqual({ start: 45, end: 60, filled: false });
    });

    it('is not filled when the run ends inside its reach on both sides', () => {
      const pixels = row(100, [[42, 57, BAR]]);
      expect(colorRunAround(pixels, 100, 50, { reach: 10 })).toEqual({ start: 42, end: 57, filled: false });
    });

    it('takes in up to `outline` opaque pixels of any color past each end', () => {
      const pixels = row(100, [[18, 19, OUTLINE], [20, 59, BAR], [60, 61, OUTLINE]]);
      expect(colorRunAround(pixels, 100, 40, { outline: 2 })).toEqual({ start: 18, end: 61, filled: false });
      expect(colorRunAround(pixels, 100, 40, { outline: 1 })).toEqual({ start: 19, end: 60, filled: false });
      expect(colorRunAround(pixels, 100, 40, { outline: 0 })).toEqual({ start: 20, end: 59, filled: false });
    });

    it('takes no transparent pixel into the outline', () => {
      const pixels = row(100, [[19, 19, OUTLINE], [20, 59, BAR]]);
      expect(colorRunAround(pixels, 100, 40, { outline: 3 })).toEqual({ start: 19, end: 59, filled: false });
    });

    it('takes the outline in no further than its reach', () => {
      const pixels = row(100, [[40, 44, OUTLINE], [45, 55, BAR], [56, 60, OUTLINE]]);
      expect(colorRunAround(pixels, 100, 50, { reach: 8, outline: 5 })).toEqual({ start: 42, end: 58, filled: false });
    });
  });

  it('keeps a transparent pixel from joining an opaque run', () => {
    expect(colorRunAround(row(3, [[0, 0, CLEAR], [1, 1, BAR]]), 3, 1)).toBeNull();
  });
});

describe('measuredBarWidth', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  /**
   * An instance whose plotting area is 400 x 200 CSS pixels, drawn at twice
   * that in device pixels, with `ctx` as its context.
   */
  function instance(ctx: unknown, bbox: UPlotInstance['bbox'] = { left: 10, top: 6, width: 800, height: 400 }): UPlotInstance {
    const over = document.createElement('div');
    Object.defineProperty(over, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(over, 'clientHeight', { value: 200, configurable: true });
    return {
      root: document.createElement('div'),
      over,
      data: [],
      series: [],
      axes: [],
      scales: {},
      bbox,
      ctx: ctx as CanvasRenderingContext2D,
      valToPos: () => 0,
    };
  }

  /** A vertical bar centred at 100 CSS px, up from 100 to 0 (measured at 50), in a 40px column. */
  function bar(overrides: Partial<BarToMeasure> = {}): BarToMeasure {
    return { center: 100, from: 100, to: 0, column: 40, outline: 0, horizontal: false, ...overrides };
  }

  /** A context whose every row (or column) reads as `paint`, in device pixels. */
  function painted(paint: Array<[from: number, to: number, color: RGBA]>) {
    return {
      getImageData: jest.fn((_x: number, _y: number, w: number, h: number) => ({
        data: row(w * h, paint),
        width: w,
        height: h,
      })),
    };
  }

  it('returns null without a context', () => {
    expect(measuredBarWidth(instance(undefined), bar())).toBeNull();
  });

  it('returns null when the context cannot read pixels back', () => {
    expect(measuredBarWidth(instance({}), bar())).toBeNull();
  });

  it('returns null without a bbox or before the plot has a size', () => {
    const ctx = { getImageData: jest.fn() };
    expect(measuredBarWidth({ ...instance(ctx), bbox: undefined }, bar())).toBeNull();
    const u = instance(ctx);
    Object.defineProperty(u.over, 'clientWidth', { value: 0 });
    expect(measuredBarWidth(u, bar())).toBeNull();
    expect(ctx.getImageData).not.toHaveBeenCalled();
  });

  it('warns once and stops reading a canvas that throws', () => {
    const ctx = {
      getImageData: jest.fn(() => {
        throw new Error('tainted');
      }),
    };
    const u = instance(ctx);
    expect(measuredBarWidth(u, bar())).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[maidr/uplot] Could not read the bar width off the canvas; using uPlot\'s default width:',
      expect.any(Error),
    );

    // A tainted canvas stays tainted: later bars are not tried again.
    expect(measuredBarWidth(u, bar({ center: 200 }))).toBeNull();
    expect(measuredBarWidth(u, bar({ horizontal: true, center: 60, from: 100, to: 200 }))).toBeNull();
    expect(ctx.getImageData).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps reading another chart after one canvas throws', () => {
    const tainted = instance({
      getImageData: () => {
        throw new Error('tainted');
      },
    });
    expect(measuredBarWidth(tainted, bar())).toBeNull();
    const ctx = painted([[180, 219, BAR]]);
    expect(measuredBarWidth(instance(ctx), bar())).toBe(20);
  });

  it('measures a vertical bar across one device-pixel row, in CSS pixels', () => {
    // Centre at 100 CSS px (200 device px), 40 device px wide.
    const ctx = painted([[180, 219, BAR]]);
    expect(measuredBarWidth(instance(ctx), bar())).toBe(20);
    // One row across the whole plot, 50 CSS px down (100 device px) from its top.
    expect(ctx.getImageData).toHaveBeenCalledWith(10, 106, 800, 1);
  });

  it('measures a horizontal bar down one device-pixel column', () => {
    // Centre 60 CSS px down (120 device px), 30 device px tall.
    const ctx = painted([[105, 134, BAR]]);
    // From 100 to 200 CSS px along x: measured at 150.
    expect(measuredBarWidth(instance(ctx), bar({ center: 60, from: 100, to: 200, horizontal: true }))).toBe(15);
    // One column the plot's height, 150 CSS px in (300 device px).
    expect(ctx.getImageData).toHaveBeenCalledWith(310, 6, 1, 400);
  });

  it('returns null when nothing is drawn at the centre', () => {
    const ctx = painted([]);
    expect(measuredBarWidth(instance(ctx), bar())).toBeNull();
  });

  describe('where along the bar it measures', () => {
    it.each([
      ['a bar inside the plot', 160, 40, 100],
      ['a bar running past the bottom of the plot', 150, 300, 175],
      ['a bar running past the top of the plot', -50, 100, 50],
      ['a bar running past both edges', -100, 400, 100],
    ])('measures the middle of the visible part of %s', (_name, from, to, across) => {
      const ctx = painted([[180, 219, BAR]]);
      expect(measuredBarWidth(instance(ctx), bar({ from, to }))).toBe(20);
      expect(ctx.getImageData).toHaveBeenCalledWith(10, 6 + across * 2, 800, 1);
    });

    it('clamps a horizontal bar to the plot\'s width', () => {
      const ctx = painted([[105, 134, BAR]]);
      expect(measuredBarWidth(instance(ctx), bar({ center: 60, from: 300, to: 600, horizontal: true }))).toBe(15);
      // Visible from 300 to 400 CSS px: measured at 350 (700 device px).
      expect(ctx.getImageData).toHaveBeenCalledWith(710, 6, 1, 400);
    });

    it.each([
      ['below the plot', 250, 300, false],
      ['above the plot', -80, -10, false],
      ['right of the plot', 450, 500, true],
      ['left of the plot', -30, -5, true],
    ])('returns null for a bar entirely %s, without reading the canvas', (_name, from, to, horizontal) => {
      const ctx = painted([[0, 799, BAR]]);
      expect(measuredBarWidth(instance(ctx), bar({ from, to, horizontal }))).toBeNull();
      expect(ctx.getImageData).not.toHaveBeenCalled();
    });
  });

  it('reads a bar that fills its column as the column\'s width', () => {
    // Touching bars of one color: the run meets the column's edge both sides.
    const ctx = painted([[0, 799, BAR]]);
    expect(measuredBarWidth(instance(ctx), bar({ column: 30 }))).toBe(30);
  });

  it('does not run into a touching bar of the same color', () => {
    // The bar is 40 device px, but the next bar starts right after it: the
    // run stops at half the 40 CSS px (80 device px) column either side.
    const ctx = painted([[180, 219, BAR], [220, 299, BAR]]);
    expect(measuredBarWidth(instance(ctx), bar({ center: 100, column: 20 }))).toBe(20);
  });

  it('takes in the stroke drawn around the fill, scaled to device pixels', () => {
    const STROKE: RGBA = [0, 0, 0, 255];
    // Fill 180..219, a 2 device px (1 CSS px) stroke either side.
    const ctx = painted([[178, 179, STROKE], [180, 219, BAR], [220, 221, STROKE]]);
    expect(measuredBarWidth(instance(ctx), bar({ outline: 1 }))).toBe(22);
    expect(measuredBarWidth(instance(ctx), bar({ outline: 0 }))).toBe(20);
  });
});
