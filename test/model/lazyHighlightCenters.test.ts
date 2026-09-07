/**
 * @jest-environment jsdom
 */

/**
 * Pointer-hover centres are measured when a pointer first needs them, not
 * when the trace is built.
 *
 * `getBoundingClientRect` is a layout read, and the constructor has just
 * inserted one hidden clone per data point — so measuring there forces the
 * browser to lay the whole SVG out again, once per trace, before the first
 * announcement. A keyboard reader, who is the primary audience, never hovers
 * and never needs the answer; a live-data chart pays it again on every
 * append, because the controller rebuilds the figure.
 *
 * Every trace here already knew how to build the centres late: it marks the
 * cache stale on scroll and resize and rebuilds it inside `findNearestPoint`.
 * These pin that the constructor now leaves it stale rather than filling it,
 * and that a hover still lands on the same mark it used to.
 *
 * Leaving the cache empty is only safe because `findNearestPoint` is the one
 * thing that reads it. It is, for all seven: `isPointInBounds` measures the
 * element it is handed rather than the cache, `getGeometryElements` answers
 * from the separate `geometry` field the tactile display consumes, and the
 * audio, text, braille and highlight accessors never touch it. A reader who
 * only ever presses arrow keys now pays nothing for pointer geometry.
 */

import type {
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  HeatmapData,
  LinePoint,
  MaidrLayer,
  ScatterPoint,
  ViolinKdePoint,
} from '@type/grammar';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { BoxTrace } from '@model/box';
import { Candlestick } from '@model/candlestick';
import { Heatmap } from '@model/heatmap';
import { LineTrace } from '@model/line';
import { ScatterTrace } from '@model/scatter';
import { ViolinKdeTrace } from '@model/violin';
import { ViolinBoxTrace } from '@model/violinBox';
import { Orientation, TraceType } from '@type/grammar';

const MARK = '.mark';

/**
 * Draw `count` marks, each addressable through {@link MARK}.
 * @param count - How many marks the chart drew
 */
function draw(count: number): void {
  // cx/cy so a scatter can group the marks into columns, and an id so the
  // stand-in layout below can place each one.
  const marks = Array.from(
    { length: count },
    (_, i) => `<circle class="mark" id="m${i}" cx="${i * 10}" cy="${i * 10}" />`,
  );
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${marks.join('')}</svg>`;
}

/**
 * A scatter layer whose points are drawn by {@link draw}.
 * @param data - The points the layer carries
 * @returns The layer
 */
function scatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'points',
    type: TraceType.SCATTER,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: MARK,
    data,
  };
}

/**
 * A single-series line layer whose points are drawn by {@link draw}.
 * @param data - The points the series carries
 * @returns The layer
 */
function lineLayer(data: LinePoint[]): MaidrLayer {
  return {
    id: 'series',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: [MARK],
    data: [data],
  };
}

/**
 * Place every mark on the viewport, ten pixels apart along the diagonal, so
 * a hover has somewhere to land. jsdom lays nothing out on its own.
 * @returns The spy, so the caller can count what read the layout
 */
function layOutMarks(): jest.SpiedFunction<() => DOMRect> {
  return jest
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: Element): DOMRect {
      // A violin's marks are circles the trace itself creates, which carry a
      // centre but no id, so read `cx` first and fall back to the id.
      const cx = this.getAttribute('cx');
      const at = cx !== null
        ? Number(cx)
        : Number(this.id.replace(/\D/g, '') || 0) * 10;
      return { x: at, y: at, width: 2, height: 2 } as DOMRect;
    });
}

describe('when a trace measures its pointer-hover centres', () => {
  beforeEach(() => {
    draw(4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  test('a scatter reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new ScatterTrace(scatterLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a scatter still answers a hover with the point under the pointer', () => {
    const layout = layOutMarks();
    const trace = new ScatterTrace(scatterLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });

  test('a line reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new LineTrace(lineLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a line still answers a hover with the point under the pointer', () => {
    const layout = layOutMarks();
    const trace = new LineTrace(lineLayer([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]));

    const nearest = trace.findNearestPoint(1, 1);

    expect(nearest?.col).toBe(0);
    expect(layout).toHaveBeenCalled();
  });
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draw `count` paths, each addressable through {@link MARK}.
 *
 * Paths rather than the circles {@link draw} makes, because a violin picks
 * its geometry by element kind. Each one is also given the `getBBox` jsdom
 * does not implement, which is what a box derives its whiskers from.
 * @param count - How many marks the chart drew
 */
function drawPaths(count: number): void {
  const marks = Array.from(
    { length: count },
    (_, i) => `<path class="mark" id="m${i}" />`,
  );
  document.body.innerHTML = `<svg xmlns="${SVG_NS}">${marks.join('')}</svg>`;
  document.querySelectorAll(MARK).forEach((mark) => {
    Object.defineProperty(mark, 'getBBox', {
      value: () => ({ x: 0, y: 0, width: 2, height: 2 }),
      configurable: true,
    });
  });
}

/**
 * Wire the SVG element kinds a violin branches on. jsdom exposes none of
 * them, so `SVGPathElement` is aliased to `SVGElement` for the marks
 * {@link drawPaths} makes to match, and the two the violin prefers ahead of
 * it are stubs nothing can be an instance of.
 */
function installSvgKinds(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.SVGUseElement = class SVGUseElementStub {};
  g.SVGPolygonElement = class SVGPolygonElementStub {};
  g.SVGPathElement = (globalThis as unknown as { SVGElement: unknown }).SVGElement;
}

/**
 * Undo {@link installSvgKinds}.
 */
function uninstallSvgKinds(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.SVGUseElement;
  delete g.SVGPolygonElement;
  delete g.SVGPathElement;
}

/**
 * A heatmap layer addressing its cells one by one, the shape an adapter that
 * stamps coordinates onto cells emits — and the shape a calendar needs, since
 * only a per-cell grid can carry a hole.
 * @param rows - How many rows the grid has
 * @param cols - How many columns the grid has
 * @returns The layer
 */
function heatmapLayer(rows: number, cols: number): MaidrLayer {
  const data: HeatmapData = {
    x: Array.from({ length: cols }, (_, c) => `x${c}`),
    y: Array.from({ length: rows }, (_, r) => `y${r}`),
    points: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => r * cols + c)),
  };
  return {
    id: 'cells',
    type: TraceType.HEATMAP,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    selectors: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => `#m${r * cols + c}`)),
    data,
  };
}

/** One box's summary statistics, drawn by the first four marks. */
const BOX_POINT: BoxPoint = {
  z: 'a',
  lowerOutliers: [],
  min: 2,
  q1: 4,
  q2: 5,
  q3: 6,
  max: 8,
  upperOutliers: [],
};

/** The sections of {@link BOX_POINT}, each on its own mark. */
const BOX_SELECTOR: BoxSelector[] = [{
  lowerOutliers: [],
  min: '#m0',
  iq: '#m1',
  q2: '#m2',
  max: '#m3',
  upperOutliers: [],
}];

/**
 * A box or violin-box layer over {@link BOX_POINT}.
 * @param type - Which of the two traces the layer is for
 * @returns The layer
 */
function boxLayer(type: TraceType.BOX | TraceType.VIOLIN_BOX): MaidrLayer {
  return {
    id: 'boxes',
    type,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: BOX_SELECTOR,
    data: [BOX_POINT],
  } as MaidrLayer;
}

/**
 * A two-violin KDE layer whose points carry the SVG coordinates the trace
 * draws its own marks at.
 * @returns The layer
 */
function violinLayer(): MaidrLayer {
  const curves = [
    [
      { x: 'a', y: 1, density: 0.2, svg_x: 0, svg_y: 0 },
      { x: 'a', y: 2, density: 0.8, svg_x: 10, svg_y: 10 },
    ],
    [
      { x: 'b', y: 3, density: 0.5, svg_x: 20, svg_y: 20 },
      { x: 'b', y: 4, density: 0.3, svg_x: 30, svg_y: 30 },
    ],
  ] as ViolinKdePoint[][];
  return {
    id: 'curves',
    type: TraceType.VIOLIN_KDE,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: ['#m0', '#m1'],
    data: curves,
  };
}

/**
 * A four-candle layer, every segment of every candle on the marks the
 * selector resolves to.
 * @returns The layer
 */
function candlestickLayer(): MaidrLayer {
  const candles = Array.from({ length: 4 }, (_, i) => ({
    value: `d${i}`,
    open: 100 + i,
    high: 106 + i,
    low: 95 + i,
    close: 102 + i,
    trend: 'Neutral',
    volatility: 0,
  })) as CandlestickPoint[];
  return {
    id: 'candles',
    type: TraceType.CANDLESTICK,
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    selectors: MARK,
    data: candles,
  };
}

describe('when a grid, box, violin or candle trace measures its centres', () => {
  beforeEach(() => {
    drawPaths(4);
    installSvgKinds();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    uninstallSvgKinds();
    document.body.innerHTML = '';
  });

  test('a heatmap reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new Heatmap(heatmapLayer(2, 2));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a heatmap still answers a hover with the cell under the pointer', () => {
    const layout = layOutMarks();
    const trace = new Heatmap(heatmapLayer(2, 2));

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });

  test('a calendar heatmap defers a cell measurement per day, not one', () => {
    // 53 weeks by 7 weekdays: the shape that made this worth doing, and the
    // count is the whole of it — every cell was measured before the reader
    // heard anything, and again on every live-data rebuild.
    const layout = layOutMarks();
    drawPaths(53 * 7);

    const trace = new Heatmap(heatmapLayer(7, 53));

    expect(layout).not.toHaveBeenCalled();

    trace.findNearestPoint(0, 0);

    expect(layout).toHaveBeenCalledTimes(371);
  });

  test('a box reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new BoxTrace(boxLayer(TraceType.BOX));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a box still answers a hover with the section under the pointer', () => {
    const layout = layOutMarks();
    const trace = new BoxTrace(boxLayer(TraceType.BOX));

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });

  test('a violin box reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new ViolinBoxTrace(boxLayer(TraceType.VIOLIN_BOX));

    expect(layout).not.toHaveBeenCalled();
  });

  test('a violin box still answers a hover with the section under the pointer', () => {
    const layout = layOutMarks();
    const trace = new ViolinBoxTrace(boxLayer(TraceType.VIOLIN_BOX));

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });

  test('a violin reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new ViolinKdeTrace(violinLayer());

    expect(layout).not.toHaveBeenCalled();
  });

  test('a violin still answers a hover with the point under the pointer', () => {
    const layout = layOutMarks();
    const trace = new ViolinKdeTrace(violinLayer());

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.getAttribute('cx')).toBe('30');
    expect(nearest?.row).toBe(1);
    expect(nearest?.col).toBe(1);
    expect(layout).toHaveBeenCalled();
  });

  test('a candlestick reads no layout while it is being built', () => {
    const layout = layOutMarks();

    void new Candlestick(candlestickLayer());

    expect(layout).not.toHaveBeenCalled();
  });

  test('a candlestick still answers a hover with the candle under the pointer', () => {
    const layout = layOutMarks();
    const trace = new Candlestick(candlestickLayer());

    const nearest = trace.findNearestPoint(31, 31);

    expect(nearest?.element.id).toBe('m3');
    expect(layout).toHaveBeenCalled();
  });
});
