import type { FrappeChart, FrappeChartType } from '@adapters/frappe/types';
import type { MaidrLayer } from '@type/grammar';
import { createMaidrFromFrappeChart } from '@adapters/frappe/converters';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

/**
 * Contract test for the highlight path of the newer chart types.
 *
 * A layer that sonifies but highlights nothing is not accessible, and the only
 * thing standing between the two is whether the emitted selector resolves —
 * against the real Frappe v1.6.2 SVG shape — to exactly one element per data
 * point, in the order the points were emitted in. Both halves fail silently at
 * runtime: `AbstractBarPlot.mapToSvgElements` returns null on a count
 * mismatch, and a mis-ordered match highlights the wrong mark while every
 * announcement stays correct.
 *
 * jsdom implements neither `SVGRectElement` nor `SVGPathElement`, so the
 * traces' own element mapping cannot be exercised here — that is what the
 * Playwright specs are for. What this pins is the part the adapter owns: the
 * selector string, and the DOM order it relies on.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const globals = globalThis as unknown as { document?: Document };
let savedDocument: Document | undefined;
let dom: JSDOM;

beforeEach(() => {
  savedDocument = globals.document;
  dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  globals.document = dom.window.document as Document;
});

afterEach(() => {
  globals.document = savedDocument;
});

/**
 * Builds the Frappe v1.6.2 SVG for a chart: one
 * `g.dataset-units.dataset-{bars|line}.dataset-{i}` group per dataset, in
 * dataset order, holding one mark per label.
 *
 * Line groups also carry the whole-series `path.line-graph-path` and, for an
 * area chart, the `path.region-fill` beneath it — both single elements the
 * selectors must NOT pick up, since one path cannot highlight N points.
 */
function render(chart: FrappeChart, marks: 'bars' | 'line'): HTMLElement {
  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'frappe-chart chart');
  container.appendChild(svg);

  chart.data.datasets.forEach((dataset, index) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `dataset-units dataset-${marks} dataset-${index}`);
    svg.appendChild(group);

    if (marks === 'line') {
      const region = document.createElementNS(SVG_NS, 'path');
      region.setAttribute('class', 'region-fill');
      group.appendChild(region);
      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('class', 'line-graph-path');
      group.appendChild(line);
    }

    dataset.values.forEach((value) => {
      const mark = marks === 'bars'
        ? document.createElementNS(SVG_NS, 'rect')
        : document.createElementNS(SVG_NS, 'circle');
      if (marks === 'bars') {
        mark.setAttribute('class', 'bar mini');
      }
      // Tags each mark with the datum it was drawn for, so the assertions can
      // say which point each matched element belongs to.
      mark.setAttribute('data-value', String(value));
      group.appendChild(mark);
    });
  });

  return container;
}

/**
 * Builds the Frappe v1.6.2 SVG for a percentage chart: one
 * `rect.percentage-bar` per band inside a single `g.percentage-bars`, under
 * `g.percentage-chart.chart-draw-area`.
 *
 * Unlike every other chart here there is no per-dataset group — the chart is
 * one bar, and the bands are its segments, appended in the order Frappe's
 * aggregation leaves them.
 */
function renderPercentage(bands: number[]): HTMLElement {
  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'frappe-chart chart');
  container.appendChild(svg);

  const chartGroup = document.createElementNS(SVG_NS, 'g');
  chartGroup.setAttribute('class', 'percentage-chart chart-draw-area');
  svg.appendChild(chartGroup);

  const bars = document.createElementNS(SVG_NS, 'g');
  bars.setAttribute('class', 'percentage-bars');
  chartGroup.appendChild(bars);

  for (const value of bands) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'percentage-bar');
    rect.setAttribute('data-value', String(value));
    bars.appendChild(rect);
  }

  return container;
}

function convert(chart: FrappeChart, chartType: FrappeChartType): MaidrLayer {
  const container = document.getElementById('chart') as HTMLElement;
  const maidr = createMaidrFromFrappeChart(chart, container, { chartType });
  return maidr.subplots[0][0].layers[0];
}

/** The `data-value` of every element the selector matches, in DOM order. */
function matched(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector))
    .map(element => element.getAttribute('data-value') ?? '');
}

describe('frappe layer selectors against the rendered SVG', () => {
  it('gives an area chart one dot per point per band, never the fill path', () => {
    const chart: FrappeChart = {
      data: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [
          { name: 'A', values: [1, 2, 3] },
          { name: 'B', values: [4, 5, 6] },
        ],
      },
    };
    render(chart, 'line');

    const selectors = convert(chart, 'area').selectors as string[];

    expect(selectors).toHaveLength(2);
    expect(matched(selectors[0])).toEqual(['1', '2', '3']);
    expect(matched(selectors[1])).toEqual(['4', '5', '6']);
  });

  it('gives a bump chart one dot per period per competitor', () => {
    const chart: FrappeChart = {
      data: {
        labels: ['W1', 'W2'],
        datasets: [
          { name: 'Alpha', values: [1, 2] },
          { name: 'Beta', values: [2, 1] },
        ],
      },
    };
    render(chart, 'line');

    const selectors = convert(chart, 'bump').selectors as string[];

    expect(matched(selectors[0])).toEqual(['1', '2']);
    expect(matched(selectors[1])).toEqual(['2', '1']);
  });

  it('gives a dot plot one dot per category, scoped to the converted dataset', () => {
    const chart: FrappeChart = {
      data: {
        labels: ['North', 'South'],
        datasets: [{ name: 'Sales', values: [7, 8] }],
      },
    };
    render(chart, 'line');

    expect(matched(convert(chart, 'dot').selectors as string)).toEqual(['7', '8']);
  });

  it('gives a diverging chart every group\'s bars, series-major as domMapping declares', () => {
    const chart: FrappeChart = {
      data: {
        labels: ['0-14', '15-29'],
        datasets: [
          { name: 'Men', values: [-1200, -1150] },
          { name: 'Women', values: [1140, 1100] },
        ],
      },
    };
    render(chart, 'bars');

    const layer = convert(chart, 'diverging');

    // One element per point across BOTH sides — the segmented trace splits
    // this single match itself — and `order: 'row'` is only correct because
    // Frappe appends dataset 0's rects before dataset 1's.
    expect(layer.domMapping).toEqual({ order: 'row' });
    expect(matched(layer.selectors as string))
      .toEqual(['-1200', '-1150', '1140', '1100']);
  });

  it('gives a percentage chart one bar per band, in band order', () => {
    const chart: FrappeChart = {
      data: {
        labels: ['Direct', 'Search', 'Social'],
        datasets: [{ name: 'Sessions', values: [50, 30, 20] }],
      },
    };
    renderPercentage([50, 30, 20]);

    const layer = convert(chart, 'percentage');

    // Every band is a series of its own with a single column, so the DOM is
    // trivially both row-major and column-major — but the column-major default
    // also runs the series bottom-to-top, which would hand Direct the last bar.
    // `order: 'row'` is what keeps band k on bar k.
    expect(layer.domMapping).toEqual({ order: 'row' });
    expect(matched(layer.selectors as string)).toEqual(['50', '30', '20']);
  });
});
