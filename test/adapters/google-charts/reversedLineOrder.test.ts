/**
 * A Google Charts line or area on a reversed axis has to be read the way it is
 * drawn (#1040).
 *
 * `buildLineLayer` walked the DataTable rows `0 .. rows-1` and never asked
 * which way the axis runs, so a chart drawn with `hAxis: {direction: -1}` was
 * navigated back to front: `Right` walked leftwards across it. The bar family
 * already asked the same question of the same helper (#1020).
 *
 * Measured on the real library in Chromium (reached by relaying the gstatic
 * requests through Node, which has the egress proxy the browser lacks), four
 * rows `A,B,C,D`. `drawn` is `getXLocation(row)` from the chart's own layout
 * interface, and `vertices` is the x of each vertex parsed out of the `d` the
 * layer's selector resolves, in path order:
 *
 *   LineChart, plain               drawn 150, 250, 350, 450   vertices the same
 *   LineChart, hAxis direction -1  drawn 450, 350, 250, 150   vertices the same
 *   AreaChart, hAxis direction -1  drawn 500, 367, 234, 101   vertices the same
 *   LineChart, vAxis direction -1  drawn 150, 250, 350, 450   vertices the same
 *
 * Two things follow. Google emits the path's vertices in row order — their x
 * merely descends on a reversed axis — so the pairing is correct today and
 * reversing the points alone would break it. And the last line is the control
 * that fixes the predicate, which is not hypothetical here: `vAxis:
 * {direction: -1}` is exactly how a bump chart is drawn, and `buildLineLayer`
 * emits that too.
 *
 * A line names each series with one path rather than each point with its own
 * mark, so there is no selector list to permute the way `reversedBarSelectors`
 * does. The layer says `domMapping.pointOrder: 'reverse'` instead, and
 * `LineTrace` turns over the elements it parsed (#1026).
 */
import type {
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The categories in the order the DataTable lists them. */
const LISTED = ['A', 'B', 'C', 'D'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['D', 'C', 'B', 'A'];

const ROWS: Array<[string, number, number]> = [
  ['A', 10, 5],
  ['B', 40, 15],
  ['C', 20, 25],
  ['D', 30, 10],
];

/**
 * A DataTable of one domain column and `series` magnitude columns.
 * @param series - How many series the table carries
 * @returns The fake table
 */
function makeDataTable(series = 1): GoogleDataTable {
  const labels = ['Day', 'one', 'two'].slice(0, series + 1);
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * Where row `index` is drawn along the domain axis.
 * @param index - The row
 * @param reversed - Whether the domain axis runs the other way
 * @returns The x location
 */
function xOf(index: number, reversed: boolean): number {
  const step = 100;
  return reversed ? 150 + (ROWS.length - 1 - index) * step : 150 + index * step;
}

/**
 * A drawn chart whose layout interface places the rows the way the axis runs.
 *
 * `getYLocation` is deliberately the *magnitude* axis here and stands still
 * whichever way the domain was drawn — a line chart's categories are always on
 * x, so asking y is what a bump chart's inverted rank axis would answer, and
 * that must not turn the categories round.
 *
 * @param reversed - Whether the domain axis is reversed
 * @param rankAxis - Whether the value axis is inverted, as a bump chart's is
 * @returns The fake chart
 */
function makeChart(reversed: boolean, rankAxis = false): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: () => null,
      getXLocation: value => xOf(Number(value), reversed),
      getYLocation: value => (rankAxis ? 300 - Number(value) * 4 : 100 + Number(value) * 4),
    }),
  };
}

/**
 * A rendered chart carrying one `fill="none"` path per series, which is what
 * `markLinePointElements` looks for.
 * @param series - How many series were drawn
 * @param reversed - Whether the domain axis is reversed
 * @returns The container
 */
function makeContainer(series: number, reversed: boolean): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="line-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('line-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const clipped = doc.createElementNS(SVG_NS, 'g');
  clipped.setAttribute('clip-path', 'url(#c)');
  svg.appendChild(clipped);
  container.appendChild(svg);

  for (let s = 0; s < series; s++) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'none');
    // Vertices in row order, exactly as Google emits them: the x descends on a
    // reversed axis rather than the list being turned round.
    const d = ROWS
      .map(([, value], r) => `${r === 0 ? 'M' : 'L'}${xOf(r, reversed)},${300 - value}`)
      .join(' ');
    path.setAttribute('d', d);
    clipped.appendChild(path);
  }

  return container;
}

interface Built {
  layer: MaidrLayer;
  container: HTMLElement;
}

/**
 * The layer a chart converts to.
 * @param options - Which chart to draw and how
 * @param options.reversed - Whether the domain axis is reversed
 * @param options.chartType - Which reading the caller asks for
 * @param options.series - How many series the table carries
 * @param options.rankAxis - Whether the value axis is inverted
 * @returns The layer and its container
 */
function build(options: {
  reversed: boolean;
  chartType?: GoogleChartType;
  series?: number;
  rankAxis?: boolean;
}): Built {
  const series = options.series ?? 1;
  const container = makeContainer(series, options.reversed);
  const maidr = createMaidrFromGoogleChart(
    makeChart(options.reversed, options.rankAxis),
    makeDataTable(series),
    container,
    { chartType: options.chartType ?? 'LineChart' },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
}

/** The x values of one series of a line-shaped layer. */
function seriesX(layer: MaidrLayer, at = 0): (string | number)[] {
  return (layer.data as LinePoint[][])[at].map(point => point.x);
}

describe('google charts reversed axis line order', () => {
  it('leaves a line on a plain axis in the order the table lists', () => {
    const { layer } = build({ reversed: false });
    expect(layer.type).toBe('line');
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a line on a reversed axis from the left of the chart', () => {
    const { layer } = build({ reversed: true });
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('reads an area on a reversed axis from the left of the chart', () => {
    const { layer } = build({ reversed: true, chartType: 'AreaChart' });
    expect(layer.type).toBe('area');
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns every series of a multi-series line over together', () => {
    const { layer } = build({ reversed: true, series: 2 });
    expect(seriesX(layer, 0)).toEqual(DRAWN);
    expect(seriesX(layer, 1)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('leaves a bump chart alone: its inverted axis is the rank one', () => {
    const { layer } = build({ reversed: false, chartType: 'BumpChart', rankAxis: true });
    expect(layer.type).toBe('bump');
    expect(seriesX(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('still turns a bump chart round when its domain axis is reversed too', () => {
    const { layer } = build({ reversed: true, chartType: 'BumpChart', rankAxis: true });
    expect(layer.type).toBe('bump');
    expect(seriesX(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('names one selector per series, which is why pointOrder is the fix', () => {
    // Each series is one path, so there are no per-point marks to permute the
    // way `reversedBarSelectors` permutes a bar's stamped rects.
    const { layer } = build({ reversed: true, series: 2 });
    expect(layer.selectors).toHaveLength(2);
  });
});
