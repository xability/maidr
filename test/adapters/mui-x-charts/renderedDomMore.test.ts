/**
 * Selectors for the second pass of chart kinds -- Gauge, SparkLineChart,
 * RadarChart and the Pro Heatmap, FunnelChart and SankeyChart -- checked
 * against the markup MUI X really renders, as `renderedDom.test.ts` does for
 * the first four.
 */

import type { MuiChartKind } from '@adapters/mui-x-charts/types';
import type { FlowPoint, GaugePoint, HeatmapData, MaidrLayer } from '@type/grammar';
import type { ReactElement } from 'react';
import { convertMuiChartsToMaidr, findMuiChartElement } from '@adapters/mui-x-charts/converters';
import { detectMuiChartKind } from '@adapters/mui-x-charts/useMuiChartsAdapter';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { FunnelChart } from '@mui/x-charts-pro/FunnelChart';
import { Heatmap } from '@mui/x-charts-pro/Heatmap';
import { SankeyChart } from '@mui/x-charts-pro/SankeyChart';
import { Gauge } from '@mui/x-charts/Gauge';
import { RadarChart } from '@mui/x-charts/RadarChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { TraceType } from '@type/grammar';
import { Svg } from '@util/svg';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const SCOPE = '#mui ';

// The Pro components log their missing-license notice; it is not under test.
let quiet: ReturnType<typeof jest.spyOn>[] = [];
beforeAll(() => {
  quiet = [jest.spyOn(console, 'error').mockImplementation(() => {}), jest.spyOn(console, 'warn').mockImplementation(() => {})];
});
afterAll(() => quiet.forEach(spy => spy.mockRestore()));

function render(chart: ReactElement): { doc: Document; layers: MaidrLayer[]; kind?: MuiChartKind; domKind?: MuiChartKind } {
  const dom = new JSDOM(`<!doctype html><body><div id="mui">${renderToStaticMarkup(chart)}</div></body>`);
  const doc = dom.window.document as unknown as Document;
  const found = findMuiChartElement(chart);
  const domKind = detectMuiChartKind(doc.getElementById('mui') as Element);
  const kind = found?.kind ?? domKind;
  const data = convertMuiChartsToMaidr({ id: 'c' }, kind, found?.props, SCOPE);
  return { doc, layers: data.subplots[0][0].layers, kind, domKind };
}

const common = { width: 400, height: 300, skipAnimation: true };

describe('mui gauge', () => {
  it('reads the measure against its dial and outlines the filled arc', () => {
    const { doc, layers, kind, domKind } = render(createElement(Gauge, { ...common, value: 60, valueMin: 10, valueMax: 110 }));

    expect(kind).toBe('gauge');
    expect(domKind).toBe('gauge');
    expect(layers[0].type).toBe(TraceType.GAUGE);
    expect(layers[0].data as GaugePoint).toEqual({ value: 60, min: 10, max: 110 });
    const [arc] = Array.from(doc.querySelectorAll(layers[0].selectors as string));
    expect(arc.classList.contains('MuiGauge-valueArc')).toBe(true);
  });
});

describe('mui sparkline', () => {
  it('reads a line sparkline as a line whose path has a vertex per value', () => {
    const { doc, layers, kind } = render(createElement(SparkLineChart, { ...common, data: [1, 4, 2, 5] }));

    expect(kind).toBe('sparkline');
    expect(layers[0].type).toBe(TraceType.LINE);
    const path = doc.querySelector((layers[0].selectors as string[])[0]) as Element;
    expect(Svg.pathVertices(path.getAttribute('d') as string)).toHaveLength(4);
  });

  it('reads a bar sparkline as bars, one rect each', () => {
    const { doc, layers } = render(createElement(SparkLineChart, { ...common, data: [1, 4, 2, 5], plotType: 'bar' }));

    expect(layers[0].type).toBe(TraceType.BAR);
    expect(layers[0].data).toEqual([{ x: 0, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 2 }, { x: 3, y: 5 }]);
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(4);
  });
});

describe('mui radar chart', () => {
  it('reads one row per series and outlines each polygon, a vertex per spoke', () => {
    const { doc, layers, kind, domKind } = render(createElement(RadarChart, {
      ...common,
      series: [{ data: [3, 5, 2], label: 'A' }, { data: [1, 2, 4], label: 'B' }],
      radar: { metrics: [{ name: 'x' }, { name: 'y' }, { name: 'z', max: 10 }] },
    }));

    expect(kind).toBe('radar');
    expect(domKind).toBe('radar');
    expect(layers[0].type).toBe(TraceType.RADAR);
    expect(layers[0].data).toEqual([
      [{ x: 'x', y: 3, z: 'A' }, { x: 'y', y: 5, z: 'A' }, { x: 'z', y: 2, z: 'A' }],
      [{ x: 'x', y: 1, z: 'B' }, { x: 'y', y: 2, z: 'B' }, { x: 'z', y: 4, z: 'B' }],
    ]);
    for (const selector of layers[0].selectors as string[]) {
      const paths = doc.querySelectorAll(selector);
      expect(paths).toHaveLength(1);
      expect(Svg.pathVertices(paths[0].getAttribute('d') as string)).toHaveLength(3);
    }
  });
});

describe('mui heatmap (pro)', () => {
  const chart = createElement(Heatmap, {
    ...common,
    xAxis: [{ data: ['a', 'b', 'c'] }],
    yAxis: [{ data: ['r', 's'] }],
    series: [{ data: [[0, 0, 1], [1, 0, 2], [2, 0, 3], [0, 1, 4], [2, 1, 6]] }],
  });

  it('reads the grid top row first, with a gap where the data has no cell', () => {
    const { layers, kind, domKind } = render(chart);

    expect(kind).toBe('heatmap');
    expect(domKind).toBe('heatmap');
    const data = layers[0].data as HeatmapData;
    expect(data.x).toEqual(['a', 'b', 'c']);
    // Whichever category MUI draws at the top is the grid's first row.
    expect(data.points).toHaveLength(2);
    expect(data.points.flat().filter(v => v === null)).toHaveLength(1);
  });

  it('outlines each drawn cell at the row and column it is announced in', () => {
    const { doc, layers } = render(chart);
    const data = layers[0].data as HeatmapData;
    const grid = layers[0].selectors as (string | null)[][];
    // Selector rows run bottom first.
    const topRow = grid[grid.length - 1];
    const bottomRow = grid[0];

    const y = (selector: string | null): number =>
      Number((doc.querySelector(selector as string) as Element).getAttribute('y'));
    const x = (selector: string | null): number =>
      Number((doc.querySelector(selector as string) as Element).getAttribute('x'));
    expect(y(topRow[0])).toBeLessThan(y(bottomRow[0]));
    expect(x(topRow[0])).toBeLessThan(x(topRow[2]));

    // The gap has no selector; every other cell names exactly one rect.
    grid.forEach((row, r) => row.forEach((cell, c) => {
      const value = data.points[grid.length - 1 - r][c];
      if (value === null) {
        expect(cell).toBeNull();
      } else {
        expect(doc.querySelectorAll(cell as string)).toHaveLength(1);
      }
    }));
  });
});

describe('mui heatmap cells MUI draws by its colour map', () => {
  /** Every heatmap selector resolves to one rect whose x is its column's. */
  function expectCellsAligned(doc: Document, layer: MaidrLayer): void {
    const data = layer.data as HeatmapData;
    const grid = layer.selectors as (string | null)[][];
    const columnX = data.x.map((_, c) => {
      const drawn = grid.map(row => row[c]).find(cell => cell !== null);
      return drawn ? Number((doc.querySelector(drawn) as Element).getAttribute('x')) : Number.NaN;
    });
    grid.forEach(row => row.forEach((cell, c) => {
      if (cell === null)
        return;
      const matches = doc.querySelectorAll(cell);
      expect(matches).toHaveLength(1);
      expect(Number(matches[0].getAttribute('x'))).toBe(columnX[c]);
    }));
    expect(columnX.filter(Number.isFinite).length).toBeGreaterThan(0);
  }

  it('outlines a null cell drawn in the unknown colour, and pairs the rest after it', () => {
    const { doc, layers } = render(createElement(Heatmap, {
      ...common,
      xAxis: [{ data: ['a', 'b'] }],
      yAxis: [{ data: ['r'] }],
      zAxis: [{ colorMap: { type: 'continuous', min: 0, max: 10, color: ['#fff', '#000'], unknownColor: '#ccc' } }],
      // MUI's types forbid a null value, which is what a sparse data set carries.
      series: [{ data: [[0, 0, null], [1, 0, 5]] as unknown as [number, number, number][] }],
    }));

    expect(doc.querySelectorAll('rect.MuiHeatmap-cell')).toHaveLength(2);
    expect((layers[0].data as HeatmapData).points).toEqual([[null, 5]]);
    const [row] = layers[0].selectors as (string | null)[][];
    expect(row).toEqual([expect.any(String), expect.any(String)]);
    expectCellsAligned(doc, layers[0]);
  });

  it('skips a value an ordinal map gives no colour, which MUI leaves undrawn', () => {
    const { doc, layers } = render(createElement(Heatmap, {
      ...common,
      xAxis: [{ data: ['a', 'b', 'c'] }],
      yAxis: [{ data: ['r'] }],
      zAxis: [{ colorMap: { type: 'ordinal', values: [1, 3], colors: ['#f00', '#00f'] } }],
      series: [{ data: [[0, 0, 1], [1, 0, 2], [2, 0, 3]] }],
    }));

    expect(doc.querySelectorAll('rect.MuiHeatmap-cell')).toHaveLength(2);
    const [row] = layers[0].selectors as (string | null)[][];
    expect(row[1]).toBeNull();
    expectCellsAligned(doc, layers[0]);
  });

  it('numbers the categories of an axis without data, as MUI does', () => {
    const { doc, layers } = render(createElement(Heatmap, {
      ...common,
      xAxis: [{ label: 'Hour' }],
      yAxis: [{ label: 'Day' }],
      series: [{ data: [[0, 0, 1], [1, 0, 5]] }],
    }));

    expect(layers[0].data).toEqual({ x: ['0', '1'], y: ['0'], points: [[1, 5]] });
    expectCellsAligned(doc, layers[0]);
  });

  it('turns a reversed y axis round, keeping the grid top-first', () => {
    const { doc, layers } = render(createElement(Heatmap, {
      ...common,
      xAxis: [{ data: ['a'] }],
      yAxis: [{ data: ['r', 's'], reverse: true }],
      series: [{ data: [[0, 0, 1], [0, 1, 2]] }],
    }));
    const data = layers[0].data as HeatmapData;
    const grid = layers[0].selectors as (string | null)[][];
    const y = (selector: string | null): number => Number((doc.querySelector(selector as string) as Element).getAttribute('y'));

    expect(data.y).toEqual(['s', 'r']);
    expect(data.points).toEqual([[2], [1]]);
    // Selector rows run bottom first: grid[1] is the top row.
    expect(y(grid[1][0])).toBeLessThan(y(grid[0][0]));
  });
});

describe('mui funnel chart (pro)', () => {
  it('reads each stage in data order, the value as the width', () => {
    const { doc, layers, kind, domKind } = render(createElement(FunnelChart, {
      ...common,
      series: [{ data: [{ value: 200, label: 'Visit' }, { value: 100, label: 'Cart' }, { value: 40, label: 'Buy' }] }],
    }));

    expect(kind).toBe('funnel');
    expect(domKind).toBe('funnel');
    expect(layers[0].type).toBe(TraceType.FUNNEL);
    expect(layers[0].orientation).toBe('horz');
    expect(layers[0].data).toEqual([{ x: 200, y: 'Visit' }, { x: 100, y: 'Cart' }, { x: 40, y: 'Buy' }]);
    const sections = Array.from(doc.querySelectorAll(layers[0].selectors as string));
    expect(sections).toHaveLength(3);
  });
});

describe('mui gauge container', () => {
  it('is found by its value even with the dial composed from children', async () => {
    const { GaugeContainer, GaugeValueArc, GaugeReferenceArc } = await import('@mui/x-charts/Gauge');
    function Minified(props: object): ReactElement {
      return createElement(GaugeContainer, props);
    }
    const { layers, domKind } = render(createElement(Minified, { ...common, value: 30, valueMax: 50 } as object, createElement(GaugeReferenceArc), createElement(GaugeValueArc)));

    expect(domKind).toBe('gauge');
    expect(layers[0].data).toEqual({ value: 30, min: 0, max: 50 });
  });
});

describe('mui sankey chart (pro)', () => {
  it('reads each link by its nodes\' labels and outlines its own ribbon', () => {
    const { doc, layers, kind, domKind } = render(createElement(SankeyChart, {
      ...common,
      series: {
        data: {
          nodes: [{ id: 'a', label: 'Coal' }, { id: 'b', label: 'Power' }, { id: 'c', label: 'Heat' }],
          links: [{ source: 'a', target: 'b', value: 5 }, { source: 'a', target: 'c', value: 3 }],
        },
      },
    }));

    expect(kind).toBe('sankey');
    expect(domKind).toBe('sankey');
    expect(layers[0].type).toBe(TraceType.SANKEY);
    expect(layers[0].data as FlowPoint[]).toEqual([
      { source: 'Coal', target: 'Power', value: 5 },
      { source: 'Coal', target: 'Heat', value: 3 },
    ]);
    for (const selector of layers[0].selectors as string[])
      expect(doc.querySelectorAll(selector)).toHaveLength(1);
  });
});
