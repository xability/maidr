/**
 * @jest-environment jsdom
 */

import type { HeatmapData, LinePoint, MaidrLayer } from '@type/grammar';
import type { FakeChart } from './helpers';
import { apexchartsToMaidr } from '@adapters/apexcharts';
import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { drawBars, drawMarkers, fakeChart, matches, svg } from './helpers';

/**
 * Contract test for the highlight path: each selector the adapter emits must
 * resolve, against the SVG ApexCharts 7.6.0 draws, to exactly the element it
 * means — one per data point, in the order the points were emitted.
 *
 * The fixtures reproduce what makes that hard, as measured in a browser:
 * series groups out of series order (a heat map draws its last series first,
 * a stacked area its bands in reverse, a combo chart groups by renderer),
 * `rel` repeated across a combo chart's groups, legend swatches carrying the
 * `apexcharts-marker` class, the hover placeholder marker without a `j`, the
 * radial bar's background tracks, and the hidden copies MAIDR itself inserts
 * next to what it highlights.
 *
 * jsdom has no layout, so what is pinned here is the selector and the DOM
 * order it relies on; the traces' own element mapping is exercised in a real
 * browser.
 */

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  document.body.innerHTML = '';
  warn.mockClear();
});

afterAll(() => {
  warn.mockRestore();
});

/**
 * The layers of a chart's only subplot.
 *
 * @param chart - The chart
 * @returns Its layers
 */
function layersOf(chart: FakeChart): MaidrLayer[] {
  return apexchartsToMaidr(chart).subplots[0][0].layers;
}

/**
 * Inserts a copy of an element the way MAIDR does when it highlights one.
 *
 * @param element - The element MAIDR highlighted
 */
function cloneLikeMaidr(element: Element): void {
  const clone = element.cloneNode(true) as Element;
  clone.setAttribute('visibility', 'hidden');
  clone.setAttribute('data-maidr-owned', 'true');
  element.insertAdjacentElement('afterend', clone);
}

describe('line markers', () => {
  it('should match one marker per non-null point, skipping the legend, the placeholder and MAIDR\'s copies', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, null, 3, 4] }, { name: 'B', values: [2, 2, 2, 2] }],
      labels: [1, 2, 3, 4],
      categoryLabels: ['a', 'b', 'c', 'd'],
      isXNumeric: true,
      config: { markers: { size: 4 } },
      draw: (dom) => {
        const a = dom.series(0, 'apexcharts-line-series');
        drawMarkers(a, [1, null, 3, 4], true);
        // An isolated point gets a duplicate marker in a plain group.
        const plain = svg('g', {}, a);
        svg('path', { class: 'apexcharts-marker', j: 3 }, plain);
        drawMarkers(dom.series(1, 'apexcharts-line-series'), [2, 2, 2, 2]);
      },
    });

    const layer = layersOf(chart)[0];
    const selectors = layer.selectors as string[];
    cloneLikeMaidr(matches(selectors[0])[0]);

    expect(matches(selectors[0]).map(e => e.getAttribute('j'))).toEqual(['0', '2', '3']);
    expect(matches(selectors[1]).map(e => e.getAttribute('j'))).toEqual(['0', '1', '2', '3']);
    expect((layer.data as LinePoint[][]).map(row => row.length)).toEqual([3, 4]);
  });
});

describe('stacked area', () => {
  it('should match each band\'s stroke path, though the bands are drawn in reverse', () => {
    const chart = fakeChart({
      type: 'area',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      chartOptions: { stacked: true },
      draw: (dom) => {
        for (const i of [1, 0]) {
          const group = dom.series(i, 'apexcharts-area-series');
          svg('path', { 'class': 'apexcharts-area', 'fill': 'url(#g)', 'stroke': 'none', 'data-band': i }, group);
          svg('path', { 'class': 'apexcharts-area', 'fill': 'none', 'stroke': '#000', 'data-band': i }, group);
        }
      },
    });

    const selectors = layersOf(chart)[0].selectors as string[];

    expect(selectors.map(s => matches(s).map(e => [e.getAttribute('data-band'), e.getAttribute('fill')])))
      .toEqual([[['0', 'none']], [['1', 'none']]]);
  });
});

describe('heatmap', () => {
  it('should resolve every grid cell to the rect holding that cell\'s value', () => {
    const rows = [[1, 2, 3], [4, 5, 6]];
    const chart = fakeChart({
      type: 'heatmap',
      series: rows.map((values, i) => ({ name: `R${i + 1}`, values })),
      labels: ['a', 'b', 'c'],
      draw: (dom) => {
        // Last series first, with data labels interleaved.
        for (const i of [1, 0]) {
          const group = dom.series(i, 'apexcharts-heatmap');
          rows[i].forEach((val, j) => {
            svg('rect', { class: 'apexcharts-heatmap-rect', i, j, val }, group);
            svg('g', { class: 'apexcharts-data-labels' }, group);
          });
        }
      },
    });

    const layer = layersOf(chart)[0];
    const data = layer.data as HeatmapData;
    const grid = layer.selectors as string[][];

    grid.forEach((row, r) => row.forEach((selector, c) => {
      const found = matches(selector);
      expect(found).toHaveLength(1);
      expect(Number(found[0].getAttribute('val'))).toBe(data.points[data.points.length - 1 - r][c]);
    }));
  });
});

describe('combo chart', () => {
  it('should tell bar series apart by realIndex although every group says rel="1"', () => {
    const chart = fakeChart({
      type: 'line',
      series: [
        { name: 'C1', type: 'column', values: [1, 2] },
        { name: 'Ln', type: 'line', values: [5, 6] },
        { name: 'C2', type: 'column', values: [3, 4] },
      ],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      draw: (dom) => {
        drawBars(dom.series(2), [3, 4], 2);
        drawBars(dom.series(0), [1, 2], 0);
        const line = dom.series(1, 'apexcharts-line-series');
        svg('path', { class: 'apexcharts-line', index: 1 }, line);
      },
    });

    const [bars, line] = layersOf(chart);
    const grid = bars.selectors as string[][];

    expect(grid.map(row => row.map(s => matches(s).map(e => e.getAttribute('val'))))).toEqual([
      [['1'], ['2']],
      [['3'], ['4']],
    ]);
    expect(matches((line.selectors as string[])[0])).toHaveLength(1);
  });
});

describe('pie and radial bar', () => {
  it('should match one slice per value, a zero slice included, and not MAIDR\'s copies', () => {
    const chart = fakeChart({
      type: 'pie',
      slices: [3, 0, 5],
      labels: ['a', 'b', 'c'],
      draw: (dom) => {
        [3, 0, 5].forEach((value, j) => {
          const group = dom.series(j, 'apexcharts-pie');
          svg('path', { 'class': `apexcharts-pie-area apexcharts-pie-slice-${j}`, j, 'data:value': value }, group);
        });
      },
    });

    const selector = layersOf(chart)[0].selectors as string;
    cloneLikeMaidr(matches(selector)[1]);

    expect(matches(selector).map(e => e.getAttribute('j'))).toEqual(['0', '1', '2']);
  });

  it('should put a ring\'s own slice first, not the background track', () => {
    const chart = fakeChart({
      type: 'radialBar',
      slices: [40, 70],
      labels: ['a', 'b'],
      draw: (dom) => {
        const tracks = svg('g', { class: 'apexcharts-tracks' }, dom.inner);
        svg('path', { class: 'apexcharts-radialbar-area' }, tracks);
        svg('path', { class: 'apexcharts-radialbar-area' }, tracks);
        [40, 70].forEach((value, j) => {
          const group = dom.series(j, 'apexcharts-radialbar');
          svg('path', { class: `apexcharts-radialbar-area apexcharts-radialbar-slice-${j}`, j }, group);
        });
      },
    });

    const layers = layersOf(chart);

    expect(layers.map(l => document.querySelector(l.selectors as string)?.getAttribute('j'))).toEqual(['0', '1']);
  });
});

describe('radar', () => {
  it('should match each series\' spoke markers, each in a markers group of its own', () => {
    const chart = fakeChart({
      type: 'radar',
      series: [{ name: 'A', values: [1, 2, 3] }, { name: 'B', values: [3, 2, 1] }],
      labels: ['x', 'y', 'z'],
      draw: (dom) => {
        for (const i of [0, 1]) {
          const group = dom.series(i, 'apexcharts-radar-series');
          svg('path', { class: 'apexcharts-radar' }, group);
          [0, 1, 2].forEach((j) => {
            const markers = svg('g', { class: 'apexcharts-series-markers' }, group);
            svg('path', { class: 'apexcharts-marker', j, rel: j }, markers);
          });
        }
      },
    });

    const selectors = layersOf(chart)[0].selectors as string[];

    expect(selectors.map(s => matches(s).map(e => e.getAttribute('j')))).toEqual([['0', '1', '2'], ['0', '1', '2']]);
  });
});

describe('bars with gaps', () => {
  it('should name each kept bar by its index so a null bar\'s path is skipped', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, null, 3] }],
      labels: ['a', 'b', 'c'],
      draw: dom => drawBars(dom.series(0), [1, null, 3], 0),
    });

    const selectors = layersOf(chart)[0].selectors as string[];

    expect(selectors.map(s => matches(s).map(e => e.getAttribute('val')))).toEqual([['1'], ['3']]);
  });
});
