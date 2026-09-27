/**
 * @jest-environment jsdom
 */

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
    expect(colorRunAround(pixels, 100, 40)).toEqual({ start: 20, end: 59 });
  });

  it('tolerates antialiased shades within the tolerance', () => {
    const pixels = row(50, [[10, 29, BAR], [10, 10, [230, 50, 55, 255]], [29, 29, [200, 30, 30, 255]]]);
    expect(colorRunAround(pixels, 50, 20)).toEqual({ start: 10, end: 29 });
  });

  it.each([1, 2])('crosses a %dpx grid line inside the bar', (lineWidth) => {
    const pixels = row(100, [[20, 59, BAR], [50, 49 + lineWidth, GRID]]);
    expect(colorRunAround(pixels, 100, 35)).toEqual({ start: 20, end: 59 });
  });

  it('stops at an interruption of three pixels', () => {
    const pixels = row(100, [[20, 59, BAR], [50, 52, GRID]]);
    expect(colorRunAround(pixels, 100, 35)).toEqual({ start: 20, end: 49 });
  });

  it('does not run into a neighbouring bar of another color', () => {
    const pixels = row(100, [[20, 39, BAR], [40, 59, OTHER]]);
    expect(colorRunAround(pixels, 100, 30)).toEqual({ start: 20, end: 39 });
  });

  it('samples the bar\'s color by majority when a grid line runs through the centre', () => {
    // A translucent bar over a vertical grid line: the centre pixel itself is
    // the grid line, but the bar's color is the most common around it.
    const pixels = row(100, [[20, 59, BAR], [40, 40, GRID]]);
    expect(colorRunAround(pixels, 100, 40)).toEqual({ start: 20, end: 59 });
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
    expect(colorRunAround(pixels, 10, 0)).toEqual({ start: 0, end: 9 });
    expect(colorRunAround(pixels, 10, 9)).toEqual({ start: 0, end: 9 });
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

  it('returns null without a context', () => {
    expect(measuredBarWidth(instance(undefined), 100, 50, false)).toBeNull();
  });

  it('returns null when the context cannot read pixels back', () => {
    expect(measuredBarWidth(instance({}), 100, 50, false)).toBeNull();
  });

  it('returns null without a bbox or before the plot has a size', () => {
    const ctx = { getImageData: jest.fn() };
    expect(measuredBarWidth({ ...instance(ctx), bbox: undefined }, 100, 50, false)).toBeNull();
    const u = instance(ctx);
    Object.defineProperty(u.over, 'clientWidth', { value: 0 });
    expect(measuredBarWidth(u, 100, 50, false)).toBeNull();
    expect(ctx.getImageData).not.toHaveBeenCalled();
  });

  it('warns and returns null when reading the canvas throws', () => {
    const ctx = {
      getImageData: () => {
        throw new Error('tainted');
      },
    };
    expect(measuredBarWidth(instance(ctx), 100, 50, false)).toBeNull();
    expect(warn).toHaveBeenCalledWith('[maidr/uplot] Could not measure the bar from the canvas:', expect.any(Error));
  });

  it('measures a vertical bar across one device-pixel row, in CSS pixels', () => {
    // Centre at 100 CSS px (200 device px), 40 device px wide.
    const ctx = {
      getImageData: jest.fn((_x: number, _y: number, w: number, h: number) => ({
        data: row(w * h, [[180, 219, BAR]]),
        width: w,
        height: h,
      })),
    };
    expect(measuredBarWidth(instance(ctx), 100, 50, false)).toBe(20);
    // One row across the whole plot, 50 CSS px down (100 device px) from its top.
    expect(ctx.getImageData).toHaveBeenCalledWith(10, 106, 800, 1);
  });

  it('measures a horizontal bar down one device-pixel column', () => {
    // Centre 60 CSS px down (120 device px), 30 device px tall.
    const ctx = {
      getImageData: jest.fn((_x: number, _y: number, w: number, h: number) => ({
        data: row(w * h, [[105, 134, BAR]]),
        width: w,
        height: h,
      })),
    };
    expect(measuredBarWidth(instance(ctx), 60, 150, true)).toBe(15);
    // One column the plot's height, 150 CSS px in (300 device px).
    expect(ctx.getImageData).toHaveBeenCalledWith(310, 6, 1, 400);
  });

  it('returns null when nothing is drawn at the centre', () => {
    const ctx = {
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: row(w * h, []), width: w, height: h }),
    };
    expect(measuredBarWidth(instance(ctx), 100, 50, false)).toBeNull();
  });
});
