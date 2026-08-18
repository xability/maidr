/**
 * @jest-environment jsdom
 */

/**
 * Every layer `extractLineData` emits has to follow the axis, not the rows
 * (#1042).
 *
 * `sortLinesByVisualOrder` opened with `if (layer.type !== TraceType.LINE)
 * continue`, so it reached a `line` and nothing else. An `area`, a `step`, a
 * stacked band and a `bump` come out of the same extractor with the same
 * one-path-per-series geometry and were left in the rows' order.
 *
 * That is worse than reading backwards. Vega writes a path's vertices in the
 * order it drew them, and `LineTrace.mapViaPathParsing` builds one synthetic
 * marker per vertex from that path — so the highlight was already in axis
 * order while the payload was in row order, and the two were **mis-paired**.
 * It is the failure the function's own docstring names: the green dot lands on
 * Aug while the text reads "Feb, 32".
 *
 * Measured on vega 5 + vega-lite 5 in Chromium with `renderer: 'svg'`, four
 * categories `A,B,C,D`, driven through `bindVegaLite` so the post-passes run.
 * `vertices` is the x of each vertex parsed out of the rendered `d`:
 *
 *   spec                                   domain     payload    vertices
 *   line                                   A,B,C,D    A,B,C,D    50,150,250,350
 *   line, scale reverse                    A,B,C,D    D,C,B,A    50,150,250,350
 *   line, sort descending                  D,C,B,A    D,C,B,A    50,150,250,350
 *   line, reversed *y* only                A,B,C,D    A,B,C,D    50,150,250,350
 *   area, scale reverse                    A,B,C,D    A,B,C,D    50,150,250,350,350,…
 *   area, sort descending                  D,C,B,A    A,B,C,D    50,150,250,350,350,…
 *   step-after line, scale reverse         A,B,C,D    A,B,C,D    50,150,150,250,250,…
 *   stacked area, scale reverse            A,B,C,D    A,B,C,D    50,150,250,350,350,…
 *
 * The last four are the gap; the first four are the pass already working.
 * `reconcilePathCoordinates` drops the extra vertices from the end, so an
 * area's eight become `50,150,250,350` — the drawn left-to-right order — while
 * `A` sits at `350`. An area draws no symbol marks at all, so that parsed path
 * is the whole highlight.
 *
 * jsdom lays nothing out, so every axis tick's rect is stubbed with a measured
 * x; without that `isLaidOutForSort` declines and no pass runs at all.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The categories in the order the rows list them. */
const LISTED = ['A', 'B', 'C', 'D'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['D', 'C', 'B', 'A'];

const ROWS = [
  { cat: 'A', val: 10, grp: 'one' },
  { cat: 'B', val: 40, grp: 'one' },
  { cat: 'C', val: 20, grp: 'one' },
  { cat: 'D', val: 30, grp: 'one' },
];

const STACK_ROWS = [
  ...ROWS,
  { cat: 'A', val: 5, grp: 'two' },
  { cat: 'B', val: 15, grp: 'two' },
  { cat: 'C', val: 25, grp: 'two' },
  { cat: 'D', val: 10, grp: 'two' },
];

/**
 * The same two bands, except the second names a category the axis does not.
 *
 * That is the case the all-or-nothing rule exists for, and the only one: band
 * `one` matches the axis and would be permuted, band `two` carries an `X` that
 * is not a tick and would be left alone — so without the rule the two bands
 * end up in different orders and the running total sums `D` against `A`. An
 * axis naming a category NO band carries is not this case: every band fails to
 * match, every band is skipped, and the columns already stay aligned.
 */
const MISMATCHED_STACK_ROWS = [
  ...ROWS,
  { cat: 'A', val: 5, grp: 'two' },
  { cat: 'B', val: 15, grp: 'two' },
  { cat: 'C', val: 25, grp: 'two' },
  { cat: 'X', val: 10, grp: 'two' },
];

/**
 * A league table over the same four periods, ranked by a `window` transform —
 * the shape `mapTraceType` reads as a bump chart, which needs the rank to be
 * the thing plotted rather than merely computed.
 */
const BUMP_SPEC = {
  transform: [
    {
      window: [{ op: 'rank', as: 'rank' }],
      groupby: ['cat'],
      sort: [{ field: 'val', order: 'descending' }],
    },
  ],
  data: {
    values: [
      { cat: 'A', val: 10, grp: 'one', rank: 1 },
      { cat: 'B', val: 40, grp: 'one', rank: 1 },
      { cat: 'C', val: 20, grp: 'one', rank: 2 },
      { cat: 'D', val: 30, grp: 'one', rank: 1 },
      { cat: 'A', val: 5, grp: 'two', rank: 2 },
      { cat: 'B', val: 15, grp: 'two', rank: 2 },
      { cat: 'C', val: 25, grp: 'two', rank: 1 },
      { cat: 'D', val: 10, grp: 'two', rank: 2 },
    ],
  },
  mark: { type: 'line' },
  encoding: {
    x: { field: 'cat', type: 'ordinal' },
    y: { field: 'rank', type: 'quantitative', scale: { reverse: true } },
    color: { field: 'grp', type: 'nominal' },
  },
} as unknown as VegaLiteSpec;

/**
 * A spec of the given mark over the shared rows.
 * @param mark - The mark definition
 * @param options - Whether to colour by group and stack the result
 * @param options.grouped - Whether a colour encoding splits the rows
 * @param options.stacked - Whether the bands are stacked
 * @param options.normalized - Whether the bands are rescaled to fill the axis
 * @param options.mismatched - Whether the second band names an off-axis category
 * @returns The spec
 */
function specFor(
  mark: unknown,
  options: {
    grouped?: boolean;
    stacked?: boolean;
    normalized?: boolean;
    mismatched?: boolean;
  } = {},
): VegaLiteSpec {
  const values = options.mismatched
    ? MISMATCHED_STACK_ROWS
    : (options.grouped ? STACK_ROWS : ROWS);
  // Two bands need the colour encoding that splits them, whichever set of
  // rows they came from.
  const grouped = options.grouped === true || options.mismatched === true;
  return {
    data: { values },
    mark,
    encoding: {
      x: { field: 'cat', type: 'ordinal' },
      y: {
        field: 'val',
        type: 'quantitative',
        ...(options.normalized
          ? { stack: 'normalize' }
          : (options.stacked ? { stack: 'zero' } : {})),
      },
      ...(grouped ? { color: { field: 'grp', type: 'nominal' } } : {}),
    },
  } as unknown as VegaLiteSpec;
}

/**
 * A rendered chart: one path per series plus an x axis whose ticks are laid
 * out in `order`, which is what the pass reads the drawn order from.
 * @param order - The categories left to right, as the axis draws them
 * @param series - How many series were drawn
 * @returns The view reporting the container
 */
function chart(order: string[], series = 1): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');

  for (let s = 0; s < series; s++) {
    const marks = document.createElementNS(SVG_NS, 'g');
    marks.setAttribute('class', 'mark-line role-mark marks');
    marks.appendChild(document.createElementNS(SVG_NS, 'path'));
    svg.appendChild(marks);
  }

  const axis = document.createElementNS(SVG_NS, 'g');
  axis.setAttribute('class', 'role-axis');
  order.forEach((label, at) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = label;
    const left = 50 + at * 100;
    text.getBoundingClientRect = (): DOMRect => ({
      x: left,
      y: 220,
      width: 10,
      height: 12,
      top: 220,
      left,
      right: left + 10,
      bottom: 232,
    }) as DOMRect;
    axis.appendChild(text);
  });
  svg.appendChild(axis);
  container.appendChild(svg);
  document.body.appendChild(container);

  return {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => undefined,
    scale: () => undefined,
  } as unknown as VegaView;
}

/**
 * Bind a spec against an axis drawn in `order` and hand back the layer.
 * @param spec - The spec to bind
 * @param order - The categories left to right, as the axis draws them
 * @param series - How many series were drawn
 * @returns The emitted layer
 */
function boundLayer(spec: VegaLiteSpec, order: string[], series = 1): MaidrLayer {
  initMock.mockClear();
  bindVegaLite(chart(order, series), spec);
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
}

/** The x values of one series of a line-shaped layer. */
function seriesX(layer: MaidrLayer, at = 0): (string | number)[] {
  return (layer.data as LinePoint[][])[at].map(point => point.x);
}

describe('vega-lite line-shaped layers follow the axis', () => {
  afterEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('leaves a line alone when the axis draws the rows in their own order', () => {
    const layer = boundLayer(specFor({ type: 'line' }), LISTED);
    expect(layer.type).toBe('line');
    expect(seriesX(layer)).toEqual(LISTED);
  });

  it('reorders a line to the drawn order, as it already did', () => {
    const layer = boundLayer(specFor({ type: 'line' }), DRAWN);
    expect(seriesX(layer)).toEqual(DRAWN);
  });

  it('reorders an area to the drawn order', () => {
    const layer = boundLayer(specFor({ type: 'area' }), DRAWN);
    expect(layer.type).toBe('area');
    expect(seriesX(layer)).toEqual(DRAWN);
  });

  it('reorders a staircase to the drawn order', () => {
    const layer = boundLayer(
      specFor({ type: 'line', interpolate: 'step-after' }),
      DRAWN,
    );
    expect(layer.type).toBe('step');
    expect(seriesX(layer)).toEqual(DRAWN);
  });

  it('reorders every band of a stacked area the same way', () => {
    const layer = boundLayer(
      specFor({ type: 'area' }, { grouped: true, stacked: true }),
      DRAWN,
      2,
    );
    expect(layer.type).toBe('stacked_area');
    expect(seriesX(layer, 0)).toEqual(DRAWN);
    expect(seriesX(layer, 1)).toEqual(DRAWN);
  });

  it('leaves a stacked area entirely alone when one band does not match', () => {
    // A stacked band is read by column — `AreaTrace` sums `data[s][c]` down the
    // series — so permuting one band and not another would total two different
    // categories together. Band `one` matches the axis and band `two` carries
    // an `X` that is not a tick, so without the all-or-nothing rule the first
    // moves and the second does not.
    const layer = boundLayer(
      specFor({ type: 'area' }, { stacked: true, mismatched: true }),
      DRAWN,
      2,
    );
    expect(seriesX(layer, 0)).toEqual(LISTED);
    expect(seriesX(layer, 1)).toEqual(['A', 'B', 'C', 'X']);
  });

  it('leaves a normalized area entirely alone when one band does not match', () => {
    // Normalizing is the same column reading with the totals rescaled: the
    // share at column `c` still comes from summing `data[s][c]` down the
    // bands, so it takes the permutation all or not at all for the reason a
    // plain stack does.
    const layer = boundLayer(
      specFor({ type: 'area' }, { normalized: true, mismatched: true }),
      DRAWN,
      2,
    );
    expect(layer.type).toBe('stacked_normalized_area');
    expect(seriesX(layer, 0)).toEqual(LISTED);
    expect(seriesX(layer, 1)).toEqual(['A', 'B', 'C', 'X']);
  });

  it('reorders a normalized area to the drawn order', () => {
    const layer = boundLayer(
      specFor({ type: 'area' }, { grouped: true, normalized: true }),
      DRAWN,
      2,
    );
    expect(layer.type).toBe('stacked_normalized_area');
    expect(seriesX(layer, 0)).toEqual(DRAWN);
    expect(seriesX(layer, 1)).toEqual(DRAWN);
  });

  it('reorders a bump chart to the drawn order', () => {
    // A bump chart's *y* is the rank axis; the pass reads the x axis' ticks,
    // so the two never meet — but the periods along x reorder exactly as any
    // other line's do.
    const layer = boundLayer(BUMP_SPEC, DRAWN, 3);
    expect(layer.type).toBe('bump');
    expect(seriesX(layer)).toEqual(DRAWN);
  });

  it('permutes an unstacked multi-line series by series, sparing the matchable', () => {
    // The opposite rule, and it is not an inconsistency: an unstacked line has
    // no tie between its series, so a series the axis does not describe going
    // unpermuted costs nothing while its sibling is corrected.
    const layer = boundLayer(
      specFor({ type: 'line' }, { mismatched: true }),
      DRAWN,
      2,
    );
    expect(layer.type).toBe('line');
    expect(seriesX(layer, 0)).toEqual(DRAWN);
    expect(seriesX(layer, 1)).toEqual(['A', 'B', 'C', 'X']);
  });
});
