/**
 * Selectors checked against the markup MUI X Charts really renders.
 *
 * Every selector in `selectors.ts` is a claim about somebody else's markup --
 * that a bar series is a `g[data-series]` of rects in data order, that a null
 * bar is skipped rather than drawn empty, that a line's vertices are its
 * samples -- and only the real components can falsify it. This is the suite
 * that fails when an MUI X upgrade changes the markup, which would otherwise
 * reach a reader as a chart that announces correctly and highlights nothing.
 */

import type { MuiChartKind } from '@adapters/mui-x-charts/types';
import type { MaidrLayer } from '@type/grammar';
import type { ReactElement } from 'react';
import { convertMuiChartsToMaidr, findMuiChartElement } from '@adapters/mui-x-charts/converters';
import { detectMuiChartKind } from '@adapters/mui-x-charts/useMuiChartsAdapter';
import { describe, expect, it } from '@jest/globals';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { ScatterChart } from '@mui/x-charts/ScatterChart';
import { TraceType } from '@type/grammar';
import { Svg } from '@util/svg';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const SCOPE = '#mui ';

/** Renders `chart`, and converts it the way `useMuiChartsAdapter` does on mount. */
function render(chart: ReactElement): { doc: Document; layers: MaidrLayer[]; kind?: MuiChartKind } {
  const dom = new JSDOM(`<!doctype html><body><div id="mui">${renderToStaticMarkup(chart)}</div></body>`);
  const doc = dom.window.document as unknown as Document;
  const found = findMuiChartElement(chart);
  const kind = found?.kind ?? detectMuiChartKind(doc.getElementById('mui')!);
  const data = convertMuiChartsToMaidr({ id: 'c' }, kind, found?.props, SCOPE);
  return { doc, layers: data.subplots[0][0].layers, kind };
}

const common = { width: 400, height: 300, skipAnimation: true };

describe('mui bar chart', () => {
  it('matches one drawn rect per bar of a single series, in data order', () => {
    const { doc, layers, kind } = render(createElement(BarChart, {
      ...common,
      xAxis: [{ scaleType: 'band', data: ['A', 'B', 'C'], label: 'Letter' }],
      series: [{ data: [4, 3, 5] }],
    }));

    expect(kind).toBe('bar');
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.BAR);
    const bars = Array.from(doc.querySelectorAll(layers[0].selectors as string));
    expect(bars).toHaveLength(3);
    // Taller bar, smaller y: the order of the matches is the order of the data.
    const heights = bars.map(bar => Number(bar.getAttribute('height')));
    expect(heights[2]).toBeGreaterThan(heights[0]);
    expect(heights[0]).toBeGreaterThan(heights[1]);
  });

  it('resolves every cell of a dodged grid to its own bar, and a null bar to none', () => {
    const { doc, layers } = render(createElement(BarChart, {
      ...common,
      xAxis: [{ scaleType: 'band', data: ['A', 'B', 'C'] }],
      series: [
        { id: 'north', data: [4, null, 5], label: 'North' },
        { id: 'south', data: [1, 6, 3], label: 'South' },
      ],
    }));

    expect(layers[0].type).toBe(TraceType.DODGED);
    const grid = layers[0].selectors as (string | null)[][];
    expect(grid[0][1]).toBeNull();
    const seen = new Set<Element>();
    grid.flat().forEach((selector) => {
      if (selector === null)
        return;
      const matches = doc.querySelectorAll(selector);
      expect(matches).toHaveLength(1);
      seen.add(matches[0]);
    });
    expect(seen.size).toBe(5);
    // North's third bar, the value 5, is the tallest North bar.
    const north = doc.querySelector(grid[0][2]!)!;
    expect(Number(north.getAttribute('height'))).toBeGreaterThan(
      Number(doc.querySelector(grid[0][0]!)!.getAttribute('height')),
    );
  });

  it('still resolves cells when a borderRadius wraps each bar in a clipping group', () => {
    const { doc, layers } = render(createElement(BarChart, {
      ...common,
      borderRadius: 6,
      xAxis: [{ scaleType: 'band', data: ['A', 'B'] }],
      series: [
        { data: [4, 3], stack: 'total' },
        { data: [1, 6], stack: 'total' },
      ],
    }));

    expect(layers[0].type).toBe(TraceType.STACKED);
    for (const selector of (layers[0].selectors as (string | null)[][]).flat()) {
      const matches = doc.querySelectorAll(selector!);
      expect(matches).toHaveLength(1);
      expect(matches[0].tagName.toLowerCase()).toBe('rect');
    }
  });

  it('reads a horizontal chart with the category on y', () => {
    const { doc, layers } = render(createElement(BarChart, {
      ...common,
      layout: 'horizontal',
      yAxis: [{ scaleType: 'band', data: ['A', 'B'], label: 'Letter' }],
      xAxis: [{ label: 'Count' }],
      series: [{ data: [2, 7] }],
    }));

    expect(layers[0].orientation).toBe('horz');
    expect(layers[0].data).toEqual([{ x: 2, y: 'A' }, { x: 7, y: 'B' }]);
    expect(layers[0].axes).toEqual({ x: { label: 'Count' }, y: { label: 'Letter' } });
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(2);
  });

  it('does not match the legend items, which carry data-series too', () => {
    const { doc, layers } = render(createElement(BarChart, {
      ...common,
      xAxis: [{ scaleType: 'band', data: ['A'] }],
      series: [{ id: 's', data: [1], label: 'Shown in legend' }],
    }));

    expect(doc.querySelector('li[data-series="s"]')).not.toBeNull();
    const matches = Array.from(doc.querySelectorAll(layers[0].selectors as string));
    expect(matches.map(el => el.tagName.toLowerCase())).toEqual(['rect']);
  });
});

describe('mui line chart', () => {
  it('matches one line path per series whose vertices are the samples', () => {
    const { doc, layers, kind } = render(createElement(LineChart, {
      ...common,
      xAxis: [{ data: [1, 2, 3, 4] }],
      series: [
        { data: [2, 5, 3, 4], label: 'A' },
        { data: [1, 2, 4, 3], label: 'B' },
      ],
    }));

    expect(kind).toBe('line');
    expect(layers[0].type).toBe(TraceType.LINE);
    for (const selector of layers[0].selectors as string[]) {
      const paths = doc.querySelectorAll(selector);
      expect(paths).toHaveLength(1);
      expect(Svg.pathVertices(paths[0].getAttribute('d')!)).toHaveLength(4);
    }
  });

  it('highlights an area series by its line, not its fill', () => {
    const { doc, layers } = render(createElement(LineChart, {
      ...common,
      xAxis: [{ data: [1, 2, 3] }],
      series: [{ data: [2, 5, 3], area: true }],
    }));

    expect(layers[0].type).toBe(TraceType.AREA);
    const [path] = Array.from(doc.querySelectorAll((layers[0].selectors as string[])[0]));
    expect(path.classList.contains('MuiLineChart-line')).toBe(true);
    expect(Svg.pathVertices(path.getAttribute('d')!)).toHaveLength(3);
  });

  it('binds each band of a stack to the line drawn at its running total', () => {
    const { doc, layers } = render(createElement(LineChart, {
      ...common,
      xAxis: [{ data: [1, 2] }],
      series: [
        { id: 'solar', data: [2, 3], stack: 'total', area: true },
        { id: 'wind', data: [1, 4], stack: 'total', area: true },
      ],
    }));

    expect(layers[0].type).toBe(TraceType.STACKED_AREA);
    const [solar, wind] = (layers[0].selectors as string[]).map(s => doc.querySelector(s)!);
    const firstY = (el: Element): number => Svg.pathVertices(el.getAttribute('d')!)[0].y;
    // The upper band's edge is drawn higher up the chart: a smaller y.
    expect(firstY(wind)).toBeLessThan(firstY(solar));
  });
});

describe('mui scatter chart', () => {
  it('matches one marker per point of each series', () => {
    const { doc, layers, kind } = render(createElement(ScatterChart, {
      ...common,
      series: [
        { data: [{ x: 1, y: 2, id: 1 }, { x: 3, y: 4, id: 2 }], label: 'A' },
        { data: [{ x: 2, y: 1, id: 3 }], label: 'B' },
      ],
    }));

    expect(kind).toBe('scatter');
    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.SCATTER]);
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(2);
    expect(doc.querySelectorAll(layers[1].selectors as string)).toHaveLength(1);
  });
});

describe('mui pie chart', () => {
  it('matches exactly one arc per slice', () => {
    const { doc, layers, kind } = render(createElement(PieChart, {
      ...common,
      series: [{ data: [{ id: 0, value: 10, label: 'a' }, { id: 1, value: 20, label: 'b' }, { id: 2, value: 5, label: 'c' }] }],
    }));

    expect(kind).toBe('pie');
    expect(layers[0].type).toBe(TraceType.PIE);
    expect(layers[0].data).toEqual([{ x: 'a', y: 10 }, { x: 'b', y: 20 }, { x: 'c', y: 5 }]);
    expect(doc.querySelectorAll(layers[0].selectors as string)).toHaveLength(3);
  });
});

describe('kind detection from the rendered svg', () => {
  it.each([
    ['bar', createElement(BarChart, { ...common, xAxis: [{ scaleType: 'band', data: ['A'] }], series: [{ data: [1] }] })],
    ['line', createElement(LineChart, { ...common, xAxis: [{ data: [1, 2] }], series: [{ data: [1, 2] }] })],
    ['scatter', createElement(ScatterChart, { ...common, series: [{ data: [{ x: 1, y: 1, id: 0 }] }] })],
    ['pie', createElement(PieChart, { ...common, series: [{ data: [{ id: 0, value: 1 }] }] })],
  ])('recognises a %s chart by its classes alone', (kind, chart) => {
    const dom = new JSDOM(`<!doctype html><body><div id="mui">${renderToStaticMarkup(chart)}</div></body>`);
    expect(detectMuiChartKind(dom.window.document.getElementById('mui')!)).toBe(kind);
  });
});
