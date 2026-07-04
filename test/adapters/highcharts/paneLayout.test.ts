/**
 * End-to-end regression tests for vertical navigation direction on multi-row
 * Highcharts output (panes and chart grids).
 *
 * Highcharts SVG contains no `g[id^="axes_"]` groups, so the core's
 * `resolveSubplotLayout` relies on each emitted subplot's `selector` (or the
 * first layer's first selector string) to measure real panel geometry. These
 * tests build a minimal rendered-DOM skeleton, run the adapter, resolve the
 * emitted selectors exactly like `Subplot` does, and assert that the layout
 * pass detects top-first row order (`invertVertical: true`) — i.e. that
 * ArrowUp moves visually up. Without a measurable per-subplot element the
 * core falls back to data order and vertical arrows are inverted.
 */

import type { Subplot } from '@model/plot';
import type { MaidrSubplot } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { highchartsGridToMaidr } from '@adapters/highcharts/grid';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { categoryPoints, fakeAxis, fakeChart, fakeSeries } from './helpers';

const SVG_NS = 'http://www.w3.org/2000/svg';

const globals = globalThis as unknown as { document?: Document };
let savedDocument: Document | undefined;

function mockRect(el: Element, rect: { top: number; left: number }): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width: 100,
      height: 100,
      right: rect.left + 100,
      bottom: rect.top + 100,
      x: rect.left,
      y: rect.top,
    }),
    configurable: true,
  });
}

/**
 * Appends a Highcharts-like SVG skeleton (`svg > g.highcharts-series-group >
 * g.highcharts-series.highcharts-series-N`) into a chart container and mocks
 * each series group's on-screen position.
 */
function renderSeriesGroups(
  container: HTMLElement,
  seriesRects: { index: number; top: number; left: number }[],
): void {
  const doc = container.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const seriesGroup = doc.createElementNS(SVG_NS, 'g');
  seriesGroup.setAttribute('class', 'highcharts-series-group');
  svg.appendChild(seriesGroup);
  container.appendChild(svg);

  for (const { index, top, left } of seriesRects) {
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', `highcharts-series highcharts-series-${index}`);
    seriesGroup.appendChild(g);
    mockRect(g, { top, left });
  }
}

/**
 * Builds a minimal `Subplot` stand-in from an emitted `MaidrSubplot`,
 * resolving its selectors the same way the real Subplot constructor does
 * (subplot selector first, first layer's first selector string as fallback).
 */
function stubFromEmitted(subplot: MaidrSubplot): Subplot {
  const highlight = subplot.selector
    ? (document.querySelector(subplot.selector) as SVGElement | null)
    : null;
  const firstSelectors = subplot.layers[0]?.selectors;
  const layerSelector = typeof firstSelectors === 'string'
    ? firstSelectors
    : Array.isArray(firstSelectors) && typeof firstSelectors[0] === 'string'
      ? firstSelectors[0]
      : null;

  return {
    getHighlightElement: () => highlight,
    getLayerSelector: () => layerSelector,
  } as unknown as Subplot;
}

function stubGrid(subplots: MaidrSubplot[][]): Subplot[][] {
  return subplots.map(row => row.map(stubFromEmitted));
}

describe('highcharts multi-row output drives the core layout pass', () => {
  beforeEach(() => {
    savedDocument = globals.document;
  });

  afterEach(() => {
    globals.document = savedDocument;
  });

  it('pane charts (top pane = data row 0) resolve to invertVertical: true', () => {
    const xAxis = fakeAxis({ left: 60, width: 600 });
    const chart = fakeChart({
      title: 'ACME',
      type: 'line',
      renderToId: 'pane-layout-chart',
      series: [
        fakeSeries({
          index: 0,
          type: 'line',
          name: 'Price',
          xAxis,
          yAxis: fakeAxis({ top: 40, height: 250 }),
          data: categoryPoints([150, 152], ['d1', 'd2']),
        }),
        fakeSeries({
          index: 1,
          type: 'column',
          name: 'Volume',
          xAxis,
          yAxis: fakeAxis({ top: 310, height: 100 }),
          data: categoryPoints([1000, 1400], ['d1', 'd2']),
        }),
      ],
    });
    // Price pane renders above the volume pane, as in the real chart.
    renderSeriesGroups(chart.renderTo, [
      { index: 0, top: 40, left: 60 },
      { index: 1, top: 310, left: 60 },
    ]);
    globals.document = chart.renderTo.ownerDocument;

    const result = highchartsToMaidr(chart);
    expect(result.subplots).toHaveLength(2);

    const layout = resolveSubplotLayout(stubGrid(result.subplots));

    // Data row 0 (Price) is visually on top: ArrowUp must map to row - 1.
    expect(layout.invertVertical).toBe(true);
    expect(layout.topLeftRow).toBe(0);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('1,0')).toBe(2);
  });

  it('chart grids with multiple rows resolve to invertVertical: true', () => {
    const makeChart = (renderToId: string, title: string): ReturnType<typeof fakeChart> =>
      fakeChart({
        title,
        type: 'column',
        renderToId,
        series: [fakeSeries({
          index: 0,
          name: title,
          data: categoryPoints([1, 2], ['a', 'b']),
        })],
      });

    const north = makeChart('grid-layout-north', 'North');
    const south = makeChart('grid-layout-south', 'South');
    renderSeriesGroups(north.renderTo, [{ index: 0, top: 0, left: 0 }]);
    renderSeriesGroups(south.renderTo, [{ index: 0, top: 400, left: 0 }]);
    globals.document = north.renderTo.ownerDocument;

    const result = highchartsGridToMaidr([north, south], { layout: { columns: 1 } });
    expect(result.subplots).toHaveLength(2);

    const layout = resolveSubplotLayout(stubGrid(result.subplots));

    expect(layout.invertVertical).toBe(true);
    expect(layout.topLeftRow).toBe(0);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('1,0')).toBe(2);
  });
});
