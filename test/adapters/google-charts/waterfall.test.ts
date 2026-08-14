import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { WaterfallPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One step: the label, then Google's candlestick order — low, open, close, high. */
type StepRow = [string, number, number, number, number];

/**
 * A quarterly bridge drawn as floating bars: the wick is collapsed onto the
 * body, so low equals open (the total before the step) and high equals close
 * (the total after it).
 */
const STEPS: StepRow[] = [
  ['Opening', 0, 0, 5000, 5000],
  ['Product', 5000, 5000, 6200, 6200],
  ['Refunds', 5800, 6200, 5800, 6200],
  ['Closing', 0, 0, 5800, 5800],
];

/** The same bridge as a plain [label, start, end] table. */
const ENDS: [string, number, number][] = STEPS.map(
  ([label, , open, close]) => [label, open, close],
);

function makeCandlestickTable(): GoogleDataTable {
  const labels = ['Step', 'Low', 'Open', 'Close', 'High'];
  return {
    getNumberOfRows: () => STEPS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => STEPS[r][c],
    getFormattedValue: (r, c) => String(STEPS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

function makeEndsTable(): GoogleDataTable {
  const labels = ['Step', 'Start', 'Running total'];
  return {
    getNumberOfRows: () => ENDS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => ENDS[r][c],
    getFormattedValue: (r, c) => String(ENDS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * A candlestick chart has no `getChartLayoutInterface()` worth asking — the
 * bars are told apart by width — so this fake fails loudly if it is called.
 */
const WATERFALL_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a waterfall is matched by rect width, not by bounding box');
  },
};

/**
 * Builds a rendered waterfall: one wide body and one narrow wick per step,
 * plus the gridline rect that has to be ignored.
 */
function makeWaterfallContainer(stepCount: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="waterfall"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('waterfall') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  const gridline = doc.createElementNS(SVG_NS, 'rect');
  gridline.setAttribute('x', '0');
  gridline.setAttribute('width', '400');
  gridline.setAttribute('height', '1');
  group.appendChild(gridline);

  // Emitted right to left, so the sort by x is what puts them in step order.
  for (let step = stepCount - 1; step >= 0; step--) {
    const wick = doc.createElementNS(SVG_NS, 'rect');
    wick.setAttribute('x', `${step * 60 + 19}`);
    wick.setAttribute('width', '2');
    wick.setAttribute('height', '80');
    group.appendChild(wick);

    const body = doc.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x', `${step * 60}`);
    body.setAttribute('width', '40');
    body.setAttribute('height', '80');
    group.appendChild(body);
  }

  return container;
}

// The mismatch case warns on purpose; installing the spy per test would let it
// print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a WaterfallChart', () => {
  it('reads the collapsed wick as the step it draws', () => {
    const container = makeWaterfallContainer(STEPS.length);

    const maidr = createMaidrFromGoogleChart(
      WATERFALL_CHART,
      makeCandlestickTable(),
      container,
      { chartType: 'WaterfallChart', waterfallTotals: [0, 3] },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.data).toEqual([
      // Named as totals by the caller: an opening bar restates the running
      // value rather than contributing to it, and nothing in the numbers says
      // so.
      { x: 'Opening', start: 0, end: 5000, delta: 5000, kind: 'total' },
      { x: 'Product', start: 5000, end: 6200, delta: 1200, kind: 'increase' },
      { x: 'Refunds', start: 6200, end: 5800, delta: -400, kind: 'decrease' },
      { x: 'Closing', start: 0, end: 5800, delta: 5800, kind: 'total' },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Step' }, y: { label: 'Close' } });
  });

  it('reads a plain [label, start, end] table the same way', () => {
    const container = makeWaterfallContainer(ENDS.length);

    const maidr = createMaidrFromGoogleChart(
      WATERFALL_CHART,
      makeEndsTable(),
      container,
      { chartType: 'WaterfallChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    const data = layer.data as WaterfallPoint[];
    expect(data.map(point => [point.start, point.end, point.delta])).toEqual([
      [0, 5000, 5000],
      [5000, 6200, 1200],
      [6200, 5800, -400],
      [0, 5800, 5800],
    ]);
    // With no totals named, every step is read as the contribution its sign
    // says it is — an honest reading of a table that never said otherwise.
    expect(data.map(point => point.kind))
      .toEqual(['increase', 'increase', 'decrease', 'increase']);
  });

  it('marks the bodies left to right and ignores the wicks and gridline', () => {
    const container = makeWaterfallContainer(STEPS.length);

    const maidr = createMaidrFromGoogleChart(
      WATERFALL_CHART,
      makeCandlestickTable(),
      container,
      { chartType: 'WaterfallChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    // One selector per step, so the order is the order the bars were drawn in
    // rather than the order Google happened to emit them in — this fixture
    // emits them right to left on purpose.
    const selectors = layer.selectors as string[];
    expect(selectors).toHaveLength(STEPS.length);

    const marked = selectors.map(one => container.ownerDocument.querySelector(one));
    expect(marked.map(rect => rect?.getAttribute('x')))
      .toEqual(['0', '60', '120', '180']);
  });

  it('drops the selectors when the drawn bars cannot be counted off', () => {
    const container = makeWaterfallContainer(STEPS.length - 1);

    const maidr = createMaidrFromGoogleChart(
      WATERFALL_CHART,
      makeCandlestickTable(),
      container,
      { chartType: 'WaterfallChart' },
    );

    expect(maidr.subplots[0][0].layers[0].selectors).toBeUndefined();
    expect(container.querySelectorAll('rect[data-maidr-step]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Waterfall step count mismatch'),
    );
  });
});
