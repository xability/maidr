import type { GoogleChart, GoogleChartType, GoogleDataTable } from '@adapters/google-charts/types';
import type { LinePoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type AreaRow = [string, number, number];

const ROWS: AreaRow[] = [
  ['2020', 1000, 400],
  ['2021', 1170, 460],
  ['2022', 660, 1120],
];

const LABELS = ['Year', 'Sales', 'Expenses'];

/** Minimal DataTable fake for a two-series area chart. */
function makeAreaDataTable(rows: AreaRow[] = ROWS): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 3,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => LABELS[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * An area chart is drawn by the same class family as a line chart, but the
 * marking path never asks for a layout interface — this fake fails loudly if
 * it does.
 */
const AREA_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('the area marking path must not need a layout interface');
  },
};

/**
 * Builds a rendered area chart: a clip-path group holding, per series, the
 * filled band (a closed path with a fill colour) followed by the outline
 * Google draws along its top edge (`fill="none"`).
 */
function makeAreaContainer(seriesCount = 2, withOutline = true): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="area-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('area-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  for (let series = 0; series < seriesCount; series++) {
    const band = doc.createElementNS(SVG_NS, 'path');
    band.setAttribute('fill', series === 0 ? '#3366cc' : '#dc3912');
    band.setAttribute('d', `M10,${100 + series} L60,80 L110,90 L110,200 L10,200 Z`);
    group.appendChild(band);

    if (withOutline) {
      const outline = doc.createElementNS(SVG_NS, 'path');
      outline.setAttribute('fill', 'none');
      outline.setAttribute('d', `M10,${100 + series} L60,80 L110,90`);
      group.appendChild(outline);
    }
  }

  return container;
}

function buildAreaLayer(chartType: GoogleChartType, container = makeAreaContainer()): {
  layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0];
  container: HTMLElement;
} {
  const maidr = createMaidrFromGoogleChart(
    AREA_CHART,
    makeAreaDataTable(),
    container,
    { chartType },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
}

describe('createMaidrFromGoogleChart with an AreaChart', () => {
  it('emits one LinePoint series per data column, as a line chart does', () => {
    const { layer } = buildAreaLayer('AreaChart');

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.data).toEqual([
      [
        { x: '2020', y: 1000, z: 'Sales' },
        { x: '2021', y: 1170, z: 'Sales' },
        { x: '2022', y: 660, z: 'Sales' },
      ],
      [
        { x: '2020', y: 400, z: 'Expenses' },
        { x: '2021', y: 460, z: 'Expenses' },
        { x: '2022', y: 1120, z: 'Expenses' },
      ],
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Year' }, y: { label: 'Sales' } });
  });

  it.each([
    ['StackedAreaChart', TraceType.STACKED_AREA],
    ['NormalizedAreaChart', TraceType.NORMALIZED_AREA],
  ] as [GoogleChartType, TraceType][])(
    'reads %s as %s without accumulating the series itself',
    (chartType, traceType) => {
      const { layer } = buildAreaLayer(chartType);

      expect(layer.type).toBe(traceType);
      // The band heights go out raw. AreaTrace derives the running total and
      // each band's share of it, so an already-accumulated `y` would be
      // summed a second time.
      const series = layer.data as LinePoint[][];
      expect(series[1].map(point => point.y)).toEqual([400, 460, 1120]);
    },
  );

  it('marks the outline of each band, never the fill', () => {
    const { layer, container } = buildAreaLayer('AreaChart');

    const selectors = layer.selectors as string[];
    expect(selectors).toHaveLength(2);

    const doc = container.ownerDocument;
    const marked = selectors.map(selector => doc.querySelector(selector));
    expect(marked.every(path => path?.getAttribute('fill') === 'none')).toBe(true);
    // The filled band closes back along the baseline, so parsing its `d`
    // would invent points the chart never plotted.
    expect(doc.querySelectorAll('path[fill="#3366cc"][data-maidr-line-series]')).toHaveLength(0);
  });

  it('omits the selectors for an area drawn without an outline', () => {
    // `lineWidth: 0` draws the band alone: there is no path whose vertices
    // are the data points, and a highlight has nothing honest to sit on.
    const { layer } = buildAreaLayer('AreaChart', makeAreaContainer(2, false));

    expect(layer.selectors).toBeUndefined();
  });
});
