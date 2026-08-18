/**
 * An AnyChart bar chart on an inverted ordinal scale has to be read the way it
 * is drawn (#1021).
 *
 * `chart.xScale().inverted(...)` reverses which end the categories start at.
 * AnyChart goes on rendering the marks in data order, and the adapter emitted
 * the categories in data order too, so the reading was the mirror image of the
 * chart.
 *
 * Measured on AnyChart 8.13.0 served locally and rendered in Chromium, with
 * one line added to `examples/anychart/bar.html` and nothing else changed,
 * for `Sat: 87, Sun: 76, Thu: 62, Fri: 19`:
 *
 *   anychart.column, xScale().inverted(true)
 *     category tick labels, left→right:  Fri, Thu, Sun, Sat
 *
 *     marks in DOM order    centre x    height    which datum
 *             0               675        260        Sat
 *             1               521        227        Sun
 *             2               367        185        Thu
 *             3               213         56        Fri
 *
 * The defaults differ by chart type and **both agree with data order** — a
 * fresh `anychart.bar` reads back `inverted() === true`, a fresh
 * `anychart.column` reads back `false`. So `inverted()` on its own does not
 * say whether anything is wrong: the reading is backwards exactly when it
 * disagrees with the series' own direction.
 *
 * That is why both directions are exercised below rather than the vertical one
 * twice. A first version of this suite covered `column` only, passed, and was
 * hiding a rule with the sign inverted for every horizontal chart — caught by
 * driving the real library, not by the tests.
 *
 * Inverting the *value* scale was measured to move no category, only which end
 * the bars hang from.
 */
import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import type { BarPoint } from '@type/grammar';
import { bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The categories in the order they are written. */
const LISTED = ['Sat', 'Sun', 'Thu', 'Fri'];
/** The same categories in the order an inverted scale draws them. */
const DRAWN = ['Fri', 'Thu', 'Sun', 'Sat'];

const ROWS: Array<[string, number]> = [['Sat', 87], ['Sun', 76], ['Thu', 62], ['Fri', 19]];

/**
 * An iterator over mock rows, in AnyChart's own shape.
 * @param rows - The rows to walk
 * @returns The iterator
 */
function createIterator(rows: Array<Record<string, unknown>>): AnyChartIterator {
  let index = -1;
  return {
    advance: () => ++index < rows.length,
    get: (field: string) => rows[index]?.[field],
    getIndex: () => index,
    getRowsCount: () => rows.length,
    reset: () => {
      index = -1;
    },
  };
}

/**
 * A drawn column series.
 * @param rows - Category / value pairs
 * @returns The series
 */
function createColumnSeries(
  rows: Array<[string, number]>,
  seriesType: 'bar' | 'column' = 'column',
): AnyChartSeries {
  return {
    id: () => 0,
    name: () => seriesType,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows.map(([x, value]) => ({ x, value }))),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

/**
 * A drawn chart whose scales answer as AnyChart's do.
 * @param options - What the chart declares
 * @param options.xInverted - What `xScale().inverted()` answers
 * @param options.yInverted - What `yScale().inverted()` answers
 * @param options.container - The container the chart drew into
 * @param options.horizontal - Draw a `bar` series rather than a `column` one
 * @returns The chart
 */
function createChart(options: {
  xInverted?: boolean;
  yInverted?: boolean;
  container?: HTMLElement;
  horizontal?: boolean;
} = {}): AnyChartInstance {
  const series = [createColumnSeries(ROWS, options.horizontal ? 'bar' : 'column')];
  return {
    title: () => 'Tips',
    container: () => options.container ?? '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    xScale: () => ({ getType: () => 'ordinal', inverted: () => options.xInverted === true }),
    yScale: () => ({ inverted: () => options.yInverted === true }),
  } as unknown as AnyChartInstance;
}

/**
 * A container holding a rendered chart svg with one mark per row.
 * @param id - The container id
 * @param count - How many marks AnyChart drew
 * @returns The container
 */
function createContainer(id: string, count = ROWS.length): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  // The stamping pass sizes its "too large to be a bar" filter against this.
  (svg as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ width: 600, height: 400 }) as DOMRect;
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'series');
  for (let i = 0; i < count; i++) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    // Named after the datum it draws, so a resolved selector can say which
    // one it found. AnyChart renders in data order either way round.
    rect.setAttribute('data-datum', LISTED[i]);
    // jsdom lays nothing out, and the stamping pass rejects a zero-area shape
    // as an invisible marker — so a mark has to claim a size to be stamped at
    // all. Small enough to pass the "too large to be a bar" filter as well.
    (rect as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ width: 10, height: 40 }) as DOMRect;
    group.appendChild(rect);
  }
  svg.appendChild(group);
  container.appendChild(svg);
  document.body.appendChild(container);
  return container;
}

/**
 * The single layer a chart converts to.
 * @param options - What the chart declares
 * @param options.xInverted - What `xScale().inverted()` answers
 * @param options.yInverted - What `yScale().inverted()` answers
 * @param options.horizontal - Draw a `bar` series rather than a `column` one
 * @param options.selectors - A caller's own selector override
 * @returns The emitted layer
 */
function layerFor(options: {
  xInverted?: boolean;
  yInverted?: boolean;
  horizontal?: boolean;
  selectors?: string[];
} = {}): { type: string; selectors?: string | string[]; data: unknown } {
  const container = createContainer('ac-inverted');
  const chart = createChart({ ...options, container });
  // `bindAnyChart` rather than `anyChartToMaidr`: stamping the marks is part
  // of binding, and a selector that resolves to nothing would let a wrong one
  // pass unnoticed.
  const maidr = bindAnyChart(chart, {
    id: 'ac',
    title: 'Tips',
    ...(options.selectors ? { selectors: options.selectors } : {}),
  });
  const layer = maidr?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer as unknown as { type: string; selectors?: string | string[]; data: unknown };
}

/** The categories of a bar layer, in the order it emits them. */
function categoriesOf(layer: { data: unknown }): unknown[] {
  return (layer.data as BarPoint[]).map(p => p.x);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an anychart bar chart on an inverted ordinal scale', () => {
  it('leads with the category drawn first', () => {
    // Before the fix this was ['Sat', 'Sun', 'Thu', 'Fri'] — the exact reverse
    // of what the chart draws.
    expect(categoriesOf(layerFor({ xInverted: true }))).toEqual(DRAWN);
  });

  it('carries each value with its own category', () => {
    const points = layerFor({ xInverted: true }).data as BarPoint[];

    expect(points.find(p => p.x === 'Sat')?.y).toBe(87);
    expect(points.find(p => p.x === 'Fri')?.y).toBe(19);
  });

  it('leaves an ordinary chart alone', () => {
    expect(categoriesOf(layerFor())).toEqual(LISTED);
  });

  it('leaves a horizontal bar chart on its own default alone', () => {
    // `anychart.bar` starts inverted, and that is what puts its first category
    // at the top. Treating `inverted()` as "something is wrong" would turn
    // every ordinary horizontal bar chart upside down.
    expect(categoriesOf(layerFor({ horizontal: true, xInverted: true }))).toEqual(LISTED);
  });

  it('turns a horizontal bar chart round when it is NOT inverted', () => {
    // The mirror image of the vertical case: for a chart whose categories run
    // down the page, `inverted(false)` is the setting that draws them from the
    // far end. Measured in Chromium: tick labels top→bottom read Fri, Thu,
    // Sun, Sat while the marks stayed in data order.
    expect(categoriesOf(layerFor({ horizontal: true, xInverted: false }))).toEqual(DRAWN);
  });

  it('ignores an inverted value scale', () => {
    // Inverting `yScale` was measured to move no category — only which end the
    // bars hang from. Asking "is either scale inverted" would reorder a chart
    // that did not move.
    expect(categoriesOf(layerFor({ yInverted: true }))).toEqual(LISTED);
  });
});

describe('the highlight follows the categories', () => {
  it('names each bar instead of leaving one prefix to resolve', () => {
    // The default selector is a prefix match, which resolves in document
    // order — and the marks stay in data order however the scale runs.
    const { selectors } = layerFor({ xInverted: true });

    expect(Array.isArray(selectors)).toBe(true);
    expect(selectors).toHaveLength(4);
  });

  it('points selector 0 at the bar the reading leads with', () => {
    const layer = layerFor({ xInverted: true });
    const selectors = layer.selectors as string[];

    // The payload leads with Fri, whose mark AnyChart drew last.
    expect(document.querySelector(selectors[0])?.getAttribute('data-datum')).toBe('Fri');
    expect(document.querySelector(selectors[3])?.getAttribute('data-datum')).toBe('Sat');
  });

  it('gives every category its own selector', () => {
    const layer = layerFor({ xInverted: true });
    const found = (layer.selectors as string[])
      .map(s => document.querySelector(s)?.getAttribute('data-datum'));

    expect(found).toEqual(categoriesOf(layer));
  });

  it('leaves an ordinary chart on its prefix selector', () => {
    const { selectors } = layerFor();

    expect(typeof selectors).toBe('string');
  });

  it('keeps a caller their own selectors, and their own order', () => {
    // Someone who named the marks is describing their own chart. Replacing
    // their list with one built from the stamped attributes would discard
    // what they said, and reversing the payload under it would then point
    // their selectors at the wrong bars.
    const mine = ['.mine'];
    const layer = layerFor({ xInverted: true, selectors: mine });

    expect(layer.selectors).toBe('.mine');
    expect(categoriesOf(layer)).toEqual(LISTED);
  });
});
