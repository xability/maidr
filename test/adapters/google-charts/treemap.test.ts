import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type TreeRow = [string, string | null, number];

/** Google's own example shape: a root with no parent, then the tree below it. */
const ROWS: TreeRow[] = [
  ['Global', null, 0],
  ['America', 'Global', 0],
  ['Europe', 'Global', 0],
  ['Brazil', 'America', 11],
  ['USA', 'America', 52],
  ['France', 'Europe', 42],
];

/** Minimal DataTable fake for the treemap package's fixed id/parent/size shape. */
function makeTreeDataTable(rows: TreeRow[] = ROWS): GoogleDataTable {
  const labels = ['Region', 'Parent', 'Market share'];
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 3,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => (rows[r][c] === null ? '' : String(rows[r][c])),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 2 ? 'number' : 'string'),
  };
}

/**
 * The treemap package exposes no layout interface, so the adapter must never
 * ask for one — this fake fails loudly if it does.
 */
const TREEMAP_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a TreeMap has no chart layout interface');
  },
};

/** Builds a rendered treemap: `cellCount` tiles inside the chart-area group. */
function makeTreemapContainer(cellCount: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="treemap-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('treemap-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  // A gridline-thin rect the marking path must not count as a cell.
  const rule = doc.createElementNS(SVG_NS, 'rect');
  rule.setAttribute('width', '400');
  rule.setAttribute('height', '1');
  group.appendChild(rule);

  for (let cell = 0; cell < cellCount; cell++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', `${cell * 60}`);
    rect.setAttribute('width', '60');
    rect.setAttribute('height', '40');
    group.appendChild(rect);
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

describe('createMaidrFromGoogleChart with a TreeMap', () => {
  it('turns the parent pointers into the path MAIDR addresses a node by', () => {
    const container = makeTreemapContainer(ROWS.length);

    const maidr = createMaidrFromGoogleChart(
      TREEMAP_CHART,
      makeTreeDataTable(),
      container,
      { chartType: 'TreeMap' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data).toEqual([
      // Interior nodes carry no value: Google's convention is a placeholder
      // size, and a declared 0 would be kept in preference to the sum of the
      // children — announcing a total of nothing for the whole chart.
      { x: 'Global' },
      { x: 'America', path: ['Global'] },
      { x: 'Europe', path: ['Global'] },
      { x: 'Brazil', y: 11, path: ['Global', 'America'] },
      { x: 'USA', y: 52, path: ['Global', 'America'] },
      { x: 'France', y: 42, path: ['Global', 'Europe'] },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Market share' } });
  });

  it('marks one tile per declared node, ignoring the gridline rect', () => {
    const container = makeTreemapContainer(ROWS.length);

    const maidr = createMaidrFromGoogleChart(
      TREEMAP_CHART,
      makeTreeDataTable(),
      container,
      { chartType: 'TreeMap' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(ROWS.length);
    expect(marked.map(rect => rect.getAttribute('data-maidr-cell')))
      .toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('omits the selectors when only part of the tree is on screen', () => {
    // A TreeMap renders `maxDepth` levels at a time and redraws on click, so
    // the tiles on screen are usually a subset of the rows.
    const container = makeTreemapContainer(2);

    const maidr = createMaidrFromGoogleChart(
      TREEMAP_CHART,
      makeTreeDataTable(),
      container,
      { chartType: 'TreeMap' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('rect[data-maidr-cell]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TreeMap cell count mismatch'));
  });

  it('stops walking a parent chain that names a cycle', () => {
    const rows: TreeRow[] = [['A', 'B', 1], ['B', 'A', 2]];
    const container = makeTreemapContainer(rows.length);

    const maidr = createMaidrFromGoogleChart(
      TREEMAP_CHART,
      makeTreeDataTable(rows),
      container,
      { chartType: 'TreeMap' },
    );

    // A malformed table must not hang the walk; the partial path still places
    // the node under the ancestors that are real.
    expect(maidr.subplots[0][0].layers[0].data).toEqual([
      { x: 'A', path: ['B'] },
      { x: 'B', path: ['A'] },
    ]);
  });
});
