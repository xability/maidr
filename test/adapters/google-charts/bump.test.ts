import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { LinePoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One period: the label, then each competitor's rank in that period. */
type RankRow = [string, number, number];

const ROWS: RankRow[] = [
  ['Week 1', 1, 2],
  ['Week 2', 2, 1],
  ['Week 3', 1, 3],
];

const LABELS = ['Week', 'Arsenal', 'Chelsea'];

/** Minimal DataTable fake for a two-competitor table of ranks. */
function makeRankDataTable(): GoogleDataTable {
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => LABELS.length,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => LABELS[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * A bump chart is drawn by the line chart's own class, and the marking path
 * never asks for a layout interface — this fake fails loudly if it does.
 */
const BUMP_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('the line marking path must not need a layout interface');
  },
};

/** Builds a rendered bump chart: one `fill="none"` outline per competitor. */
function makeBumpContainer(): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="bump-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('bump-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  for (let series = 0; series < 2; series++) {
    const line = doc.createElementNS(SVG_NS, 'path');
    line.setAttribute('fill', 'none');
    line.setAttribute('d', `M0,${10 + series}L40,${20 + series}L80,${30 + series}`);
    group.appendChild(line);
  }

  return container;
}

function build(container: HTMLElement = makeBumpContainer()): {
  layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0];
  container: HTMLElement;
} {
  const maidr = createMaidrFromGoogleChart(BUMP_CHART, makeRankDataTable(), container, {
    chartType: 'BumpChart',
  });
  return { layer: maidr.subplots[0][0].layers[0], container };
}

describe('createMaidrFromGoogleChart with a BumpChart', () => {
  it('reads the ranks as a bump layer, one line per competitor', () => {
    const { layer } = build();

    // The type is the whole point: a bump layer inverts the pitch so rank 1
    // is the highest note and announces the places gained on every move.
    // Read as a LineChart the same table sonifies a climb as a fall.
    expect(layer.type).toBe(TraceType.BUMP);

    const data = layer.data as LinePoint[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { x: 'Week 1', y: 1, z: 'Arsenal' },
      { x: 'Week 2', y: 2, z: 'Arsenal' },
      { x: 'Week 3', y: 1, z: 'Arsenal' },
    ]);
    expect(data[1].map(point => point.y)).toEqual([2, 1, 3]);
  });

  it('names the axes from the table', () => {
    const { layer } = build();

    expect(layer.axes).toEqual({ x: { label: 'Week' }, y: { label: 'Arsenal' } });
  });

  it('marks one line path per competitor for highlighting', () => {
    const { layer, container } = build();

    expect(layer.selectors).toEqual([
      '#bump-chart svg path[data-maidr-line-series="0"]',
      '#bump-chart svg path[data-maidr-line-series="1"]',
    ]);
    expect(container.querySelectorAll('[data-maidr-line-series]')).toHaveLength(2);
  });
});
