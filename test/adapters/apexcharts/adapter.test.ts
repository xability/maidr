/**
 * @jest-environment jsdom
 */

import type {
  BoxPoint,
  BoxSelector,
  CandlestickPoint,
  CandlestickSelector,
  GanttData,
  GaugePoint,
  HeatmapData,
  LinePoint,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  TreemapPoint,
} from '@type/grammar';
import type { FakeChart } from './helpers';
import { apexchartsToMaidr } from '@adapters/apexcharts';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { drawBars, drawMarkers, fakeChart, svg } from './helpers';

/**
 * What the adapter reads off an ApexCharts 7.6.0 chart, one chart type at a
 * time. The `w.globals` shapes are the ones measured in a browser: line and
 * combo charts keep their category names in `categoryLabels` and indices in
 * `labels`, bar charts the names in `labels`, a box plot its five numbers in
 * the candlestick fields, and a series hidden through the legend an empty
 * value array.
 */

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warn.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
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
 * The single layer of a chart.
 *
 * @param chart - The chart
 * @returns The layer
 */
function onlyLayer(chart: FakeChart): MaidrLayer {
  const layers = layersOf(chart);
  expect(layers).toHaveLength(1);
  return layers[0];
}

const ROOT = (chart: FakeChart): string => `#apexcharts${chart.w.globals.chartID}`;
function GROUP(chart: FakeChart, i: number): string {
  return `${ROOT(chart)} g.apexcharts-series[data\\:realIndex="${i}"]`;
}

describe('figure', () => {
  it('should read the title, subtitle and axis titles from the config', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Sales', values: [1, 2] }],
      labels: ['a', 'b'],
      config: {
        title: { text: 'Fruit' },
        subtitle: { text: 'By month' },
        xaxis: { title: { text: 'Fruit type' } },
        yaxis: [{ title: { text: 'Count' } }],
      },
    });

    const maidr = apexchartsToMaidr(chart);

    expect(maidr.id).toBe(`maidr-apexcharts-${chart.w.globals.chartID}`);
    expect(maidr.title).toBe('Fruit');
    expect(maidr.subtitle).toBe('By month');
    expect(maidr.subplots[0][0].layers[0].axes).toEqual({ x: { label: 'Fruit type' }, y: { label: 'Count' } });
  });

  it('should let the options override the id, titles and axis labels', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Sales', values: [1, 2] }],
      labels: ['a', 'b'],
      config: { title: { text: 'Fruit' }, xaxis: { title: { text: 'Fruit type' } } },
    });

    const maidr = apexchartsToMaidr(chart, {
      id: 'my-chart',
      title: 'Override',
      subtitle: 'Sub',
      caption: 'Cap',
      axes: { x: 'X!', y: 'Y!' },
    });

    expect(maidr).toMatchObject({ id: 'my-chart', title: 'Override', subtitle: 'Sub', caption: 'Cap' });
    expect(maidr.subplots[0][0].layers[0].id).toBe('my-chart-layer-0');
    expect(maidr.subplots[0][0].layers[0].axes).toEqual({ x: { label: 'X!' }, y: { label: 'Y!' } });
  });

  it('should produce the same payload when converted twice', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }],
      labels: ['a', 'b'],
      draw: (dom) => {
        drawBars(dom.series(0), [1, 2], 0);
        drawBars(dom.series(1), [3, 4], 1);
      },
    });

    expect(JSON.stringify(apexchartsToMaidr(chart))).toBe(JSON.stringify(apexchartsToMaidr(chart)));
  });

  it('should warn once when ApexCharts\' own keyboard navigation is left on', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1] }],
      labels: ['a'],
      chartOptions: { accessibility: { enabled: true, keyboard: { enabled: true, navigation: { enabled: true } } } },
    });

    apexchartsToMaidr(chart);
    apexchartsToMaidr(chart);

    const messages = warn.mock.calls.map(call => String(call[0])).filter(m => m.includes('keyboard navigation'));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('chart.accessibility.enabled');
  });

  it('should not warn about keyboard navigation when accessibility is disabled', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1] }],
      labels: ['a'],
      draw: dom => drawBars(dom.series(0), [1], 0),
    });

    apexchartsToMaidr(chart);

    expect(warn).not.toHaveBeenCalled();
  });

  it('should warn when the chart has not been drawn', () => {
    const chart = fakeChart({ type: 'bar', series: [{ name: 'A', values: [1] }], labels: ['a'] });

    const layer = apexchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.BAR);
    expect(String(warn.mock.calls[0][0])).toContain('has not been drawn');
  });

  it('should skip series hidden through the legend', () => {
    const chart = fakeChart({
      type: 'line',
      series: [
        { name: 'A', values: [1, 2] },
        { name: 'B', values: [] },
        { name: 'C', values: [5, 6] },
      ],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      globals: { collapsedSeriesIndices: [1] },
    });

    const maidr = apexchartsToMaidr(chart);
    const layer = maidr.subplots[0][0].layers[0];

    expect((layer.data as LinePoint[][]).map(row => row[0].z)).toEqual(['A', 'C']);
    expect(layer.selectors).toEqual([
      `${GROUP(chart, 0)} path.apexcharts-line:not([data-maidr-owned])`,
      `${GROUP(chart, 2)} path.apexcharts-line:not([data-maidr-owned])`,
    ]);
    expect(maidr.subplots[0][0].legend).toEqual(['A', 'C']);
  });

  it('should warn once when every series is hidden, since MAIDR then answers no key', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [] }, { name: 'B', values: [] }],
      labels: ['a'],
      globals: { collapsedSeriesIndices: [0, 1] },
    });

    const layers = layersOf(chart);
    layersOf(chart);

    const messages = warn.mock.calls.map(call => String(call[0])).filter(m => m.includes('nothing MAIDR can read'));
    expect(layers).toEqual([]);
    expect(messages).toHaveLength(1);
  });

  it('should warn once and skip a series type it cannot read', () => {
    const chart = fakeChart({ type: 'rangeArea', series: [{ name: 'R', values: [3] }], labels: ['a'] });

    const layers = layersOf(chart);
    layersOf(chart);

    const messages = warn.mock.calls.map(call => String(call[0])).filter(m => m.includes('rangeArea'));
    expect(layers).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('cannot read yet');
  });
});

describe('bar', () => {
  it('should emit one selector per bar and drop null bars', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Sales', values: [1, null, 0, 4] }],
      labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.name).toBe('Sales');
    expect(layer.orientation).toBeUndefined();
    expect(layer.data).toEqual([{ x: 'Jan', y: 1 }, { x: 'Mar', y: 0 }, { x: 'Apr', y: 4 }]);
    expect(layer.selectors).toEqual([0, 2, 3].map(j => `${GROUP(chart, 0)} path.apexcharts-bar-area[j="${j}"]`));
  });

  it('should name a bar past the last category by its position', () => {
    // ApexCharts draws every point of a series longer than its categories.
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Sales', values: [1, 2, 3] }],
      labels: ['Jan', 'Feb'],
    });

    expect(onlyLayer(chart).data).toEqual([{ x: 'Jan', y: 1 }, { x: 'Feb', y: 2 }, { x: '3', y: 3 }]);
  });

  it('should put the magnitude in x for a horizontal bar', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Sales', values: [5, 7] }],
      labels: ['a', 'b'],
      globals: { isBarHorizontal: true },
      config: { plotOptions: { bar: { horizontal: true } } },
    });

    const layer = onlyLayer(chart);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data).toEqual([{ x: 5, y: 'a' }, { x: 7, y: 'b' }]);
  });

  it('should name datetime bars by their formatted date', () => {
    const day = Date.UTC(2023, 10, 14);
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 3], x: [day, day + 86_400_000] }],
      labels: [day, day + 86_400_000],
      isXNumeric: true,
      config: { xaxis: { type: 'datetime', title: {} } },
    });

    const layer = onlyLayer(chart);

    expect((layer.data as SegmentedPoint[]).map(p => p.x)).toEqual(['Nov 14, 2023', 'Nov 15, 2023']);
  });

  it.each([
    [undefined, undefined, TraceType.DODGED],
    [true, undefined, TraceType.STACKED],
    [true, '100%', TraceType.NORMALIZED],
  ])('should read stacked=%s stackType=%s as %s', (stacked, stackType, type) => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 3] }, { name: 'B', values: [3, 1] }],
      labels: ['a', 'b'],
      chartOptions: { stacked, stackType },
    });

    expect(onlyLayer(chart).type).toBe(type);
  });

  it('should emit a series-major grid, a gap as NaN and an undrawn cell as null', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, null, 3] }, { name: 'B', values: [4, 5] }],
      labels: ['a', 'b', 'c'],
      chartOptions: { stacked: true },
      draw: (dom) => {
        drawBars(dom.series(0), [1, null, 3], 0);
        drawBars(dom.series(1), [4, 5], 1);
      },
    });

    const layer = onlyLayer(chart);
    const data = layer.data as SegmentedPoint[][];

    expect(data[0].map(p => [p.x, p.y, p.z])).toEqual([['a', 1, 'A'], ['b', Number.NaN, 'A'], ['c', 3, 'A']]);
    expect(data[1].map(p => p.y)).toEqual([4, 5, Number.NaN]);
    expect(layer.selectors).toEqual([
      [0, 1, 2].map(j => `${GROUP(chart, 0)} path.apexcharts-bar-area[j="${j}"]`),
      [`${GROUP(chart, 1)} path.apexcharts-bar-area[j="0"]`, `${GROUP(chart, 1)} path.apexcharts-bar-area[j="1"]`, null],
    ]);
  });

  it('should emit each band\'s share of its category for a 100% stack', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 3] }, { name: 'B', values: [3, 0] }],
      labels: ['a', 'b'],
      chartOptions: { stacked: true, stackType: '100%' },
      globals: { isBarHorizontal: true },
    });

    const layer = onlyLayer(chart);
    const data = layer.data as SegmentedPoint[][];

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(data.map(row => row.map(p => p.x))).toEqual([[25, 100], [75, 0]]);
    expect(data[0][0].y).toBe('a');
  });

  it('should emit one stacked layer per group when the series name several stacks', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [
        { name: 'Q1 A', values: [1, 2] },
        { name: 'Q1 B', values: [3, 4] },
        { name: 'Q1 actual', values: [10, 20] },
      ],
      labels: ['x', 'y'],
      chartOptions: { stacked: true },
    });
    const groups = ['budget', 'budget', 'actual'];
    chart.w.config.series.forEach((series, i) => {
      series.group = groups[i];
    });

    const layers = layersOf(chart);

    expect(layers.map(l => [l.type, l.name])).toEqual([[TraceType.STACKED, 'budget'], [TraceType.STACKED, 'actual']]);
    expect((layers[0].data as SegmentedPoint[][]).map(row => row.map(p => p.y))).toEqual([[1, 2], [3, 4]]);
    expect((layers[1].data as SegmentedPoint[][]).map(row => row[0].z)).toEqual(['Q1 actual']);
  });

  it('should keep one stacked layer when every series is in ApexCharts\' default group', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }],
      labels: ['x', 'y'],
      chartOptions: { stacked: true },
    });
    chart.w.config.series.forEach((series) => {
      series.group = 'apexcharts-axis-0';
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.STACKED);
    expect(layer.name).toBeUndefined();
  });

  it('should read a funnel as a horizontal funnel layer', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'Leads', values: [100, 60, 20] }],
      labels: ['Visit', 'Signup', 'Buy'],
      globals: { isBarHorizontal: true },
      config: { plotOptions: { bar: { horizontal: true, isFunnel: true } } },
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data).toEqual([{ x: 100, y: 'Visit' }, { x: 60, y: 'Signup' }, { x: 20, y: 'Buy' }]);
    expect(layer.axes).toEqual({ x: { label: 'Count' }, y: { label: 'Stage' } });
  });
});

describe('line and area', () => {
  const categories = { labels: [1, 2, 3], categoryLabels: ['a', 'b', 'c'], isXNumeric: true };

  it('should highlight along each series\' path when no series has a gap', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2, 3] }, { name: 'B', values: [3, 2, 1] }],
      ...categories,
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.name).toBeUndefined();
    expect((layer.data as LinePoint[][])[1]).toEqual([
      { x: 'a', y: 3, z: 'B' },
      { x: 'b', y: 2, z: 'B' },
      { x: 'c', y: 1, z: 'B' },
    ]);
    expect(layer.selectors).toEqual([0, 1].map(i => `${GROUP(chart, i)} path.apexcharts-line:not([data-maidr-owned])`));
  });

  it('should name a point past the last category by its position', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2, 3, 4] }],
      labels: [1, 2, 3, 4],
      categoryLabels: ['a', 'b', 'c'],
      isXNumeric: true,
    });

    expect((onlyLayer(chart).data as LinePoint[][])[0].map(point => point.x)).toEqual(['a', 'b', 'c', '4']);
  });

  it('should highlight markers, dropping the points without one, when every series draws markers', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, null, 3] }],
      ...categories,
      config: { markers: { size: 4 } },
      draw: dom => drawMarkers(dom.series(0, 'apexcharts-line-series'), [1, null, 3], true),
    });

    const layer = onlyLayer(chart);

    expect(layer.data).toEqual([[{ x: 'a', y: 1, z: 'A' }, { x: 'c', y: 3, z: 'A' }]]);
    expect(layer.selectors).toEqual([
      `${GROUP(chart, 0)} .apexcharts-series-markers > path.apexcharts-marker[j]:not([data-maidr-owned])`,
    ]);
  });

  it('should leave a gapped line without markers unhighlighted, and say why', () => {
    const chart = fakeChart({ type: 'line', series: [{ name: 'A', values: [1, null, 3] }], ...categories });

    const layer = onlyLayer(chart);

    expect(layer.selectors).toBeUndefined();
    expect((layer.data as LinePoint[][])[0][1].y).toBeNull();
    expect(warn.mock.calls.some(call => String(call[0]).includes('markers.size'))).toBe(true);
  });

  it.each([
    ['stepline', 'hv'],
    ['linestep', 'vh'],
  ])('should read the %s curve as a %s step layer', (curve, direction) => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2, 3] }],
      ...categories,
      config: { stroke: { curve } },
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.STEP);
    expect(layer.stepDirection).toBe(direction);
  });

  it('should keep a line and a step line in separate layers', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2, 3] }, { name: 'B', values: [1, 2, 3] }],
      ...categories,
      config: { stroke: { curve: ['smooth', 'stepline'] } },
    });

    expect(layersOf(chart).map(l => l.type)).toEqual([TraceType.LINE, TraceType.STEP]);
  });

  it('should carry datetime x as epoch milliseconds with a date format', () => {
    const start = Date.UTC(2023, 0, 1);
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2], x: [start, start + 86_400_000] }],
      labels: [start, start + 86_400_000],
      isXNumeric: true,
      config: { xaxis: { type: 'datetime', title: { text: 'Day' } } },
    });

    const layer = onlyLayer(chart);

    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual([start, start + 86_400_000]);
    expect(layer.axes?.x).toEqual({
      label: 'Day',
      format: { type: 'date', dateOptions: { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } },
    });
  });

  it('should read a numeric x axis from the series\' own x values', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2], x: [1, 5] }],
      labels: [1, 2, 3, 4, 5],
      isXNumeric: true,
    });

    expect((onlyLayer(chart).data as LinePoint[][])[0].map(p => p.x)).toEqual([1, 5]);
  });

  it.each([
    [undefined, undefined, TraceType.AREA],
    [true, undefined, TraceType.STACKED_AREA],
    [true, '100%', TraceType.NORMALIZED_AREA],
  ])('should read an area chart with stacked=%s stackType=%s as %s', (stacked, stackType, type) => {
    const chart = fakeChart({
      type: 'area',
      series: [{ name: 'A', values: [1, 3] }, { name: 'B', values: [3, 1] }],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      chartOptions: { stacked, stackType },
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(type);
    expect(layer.selectors).toEqual([0, 1].map(i => `${GROUP(chart, i)} path.apexcharts-area[fill="none"]:not([data-maidr-owned])`));
    const ys = (layer.data as LinePoint[][]).map(row => row.map(p => p.y));
    expect(ys).toEqual(type === TraceType.NORMALIZED_AREA ? [[25, 75], [75, 25]] : [[1, 3], [3, 1]]);
  });
});

describe('100% stacked lines and areas', () => {
  it('should warn that ApexCharts draws them outside the plot, and still read the shares', () => {
    const chart = fakeChart({
      type: 'area',
      series: [{ name: 'A', values: [1, 3] }, { name: 'B', values: [3, 1] }],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      chartOptions: { stacked: true, stackType: '100%' },
    });

    const layer = onlyLayer(chart);
    layersOf(chart);

    const messages = warn.mock.calls.map(call => String(call[0])).filter(m => m.includes('100%'));
    expect(layer.type).toBe(TraceType.NORMALIZED_AREA);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('outside the plot area');
  });

  it('should not warn for a 100% stacked bar chart', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 3] }, { name: 'B', values: [3, 1] }],
      labels: ['a', 'b'],
      chartOptions: { stacked: true, stackType: '100%' },
    });

    layersOf(chart);

    expect(warn.mock.calls.map(call => String(call[0])).filter(m => m.includes('outside the plot area'))).toEqual([]);
  });
});

describe('y axes', () => {
  const twoAxes = {
    yaxis: [{ title: { text: 'Left' } }, { title: { text: 'Right' } }],
  };

  it('should give lines on differently titled y axes a layer each, named after its axis', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [100, 200] }],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      config: twoAxes,
      globals: { seriesYAxisReverseMap: [0, 1] },
    });

    const layers = layersOf(chart);

    expect(layers.map(l => [l.name, l.axes?.y])).toEqual([['A', { label: 'Left' }], ['B', { label: 'Right' }]]);
  });

  it('should leave the y label off a bar layer whose series use differently titled axes', () => {
    const chart = fakeChart({
      type: 'bar',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [100, 200] }],
      labels: ['a', 'b'],
      config: twoAxes,
      globals: { seriesYAxisReverseMap: [0, 1] },
    });

    expect(onlyLayer(chart).axes?.y).toEqual({});
  });

  it('should use the y label the options give for every layer', () => {
    const chart = fakeChart({
      type: 'line',
      series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [100, 200] }],
      labels: [1, 2],
      categoryLabels: ['a', 'b'],
      isXNumeric: true,
      config: twoAxes,
      globals: { seriesYAxisReverseMap: [0, 1] },
    });

    const layer = apexchartsToMaidr(chart, { axes: { y: 'Value' } }).subplots[0][0].layers;

    expect(layer.map(l => l.axes?.y)).toEqual([{ label: 'Value' }]);
  });
});

describe('scatter', () => {
  it('should emit one layer per series with a marker selector', () => {
    const chart = fakeChart({
      type: 'scatter',
      series: [{ name: 'A', values: [2, 3], x: [1, 2] }, { name: 'B', values: [1, null], x: [4, 5] }],
      isXNumeric: true,
    });

    const layers = layersOf(chart);

    expect(layers.map(l => [l.type, l.name])).toEqual([[TraceType.SCATTER, 'A'], [TraceType.SCATTER, 'B']]);
    expect(layers[1].data).toEqual([{ x: 4, y: 1 }]);
    expect(layers[0].selectors).toBe(`${GROUP(chart, 0)} .apexcharts-series-markers > path.apexcharts-marker[j]:not([data-maidr-owned])`);
  });

  it('should keep only the points ApexCharts drew a marker for', () => {
    const chart = fakeChart({
      type: 'scatter',
      series: [{ name: 'A', values: [2, 3, 4], x: [1, 2, 3] }],
      isXNumeric: true,
      draw: dom => drawMarkers(dom.series(0, 'apexcharts-scatter-series'), [2, 3]),
    });

    expect((onlyLayer(chart).data as ScatterPoint[]).map(p => p.y)).toEqual([2, 3]);
  });

  it('should read a bubble chart as scatter layers', () => {
    const chart = fakeChart({ type: 'bubble', series: [{ name: 'A', values: [2], x: [1] }], isXNumeric: true });

    expect(onlyLayer(chart).type).toBe(TraceType.SCATTER);
  });
});

describe('pie, polar area and gauge', () => {
  it('should keep a zero slice and read the start angle clockwise from 12 o\'clock', () => {
    const chart = fakeChart({
      type: 'donut',
      slices: [3, 0, 5],
      labels: ['a', 'b', 'c'],
      config: { plotOptions: { pie: { startAngle: 90 } } },
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.data as PiePoint[]).toEqual([{ x: 'a', y: 3 }, { x: 'b', y: 0 }, { x: 'c', y: 5 }]);
    expect(layer.startAngle).toBe(90);
    expect(layer.direction).toBeUndefined();
    expect(layer.selectors).toBe(`${ROOT(chart)} path.apexcharts-pie-area:not([data-maidr-owned])`);
  });

  it('should leave out a slice hidden through the legend and list the others by series group', () => {
    const chart = fakeChart({
      type: 'pie',
      slices: [10, 0, 30],
      labels: ['a', 'b', 'c'],
      globals: { collapsedSeriesIndices: [1] },
    });

    const layer = onlyLayer(chart);

    expect(layer.data as PiePoint[]).toEqual([{ x: 'a', y: 10 }, { x: 'c', y: 30 }]);
    expect(layer.selectors).toBe([0, 2].map(j => `${GROUP(chart, j)} path.apexcharts-pie-area:not([data-maidr-owned])`).join(', '));
  });

  it('should leave out a hidden polar area spoke and a hidden radial bar ring', () => {
    const polar = fakeChart({ type: 'polarArea', slices: [3, 0, 5], labels: ['a', 'b', 'c'], globals: { collapsedSeriesIndices: [1] } });
    const radial = fakeChart({ type: 'radialBar', slices: [40, 0], labels: ['CPU', 'RAM'], globals: { collapsedSeriesIndices: [1] } });

    expect(onlyLayer(polar).data).toEqual([[{ x: 'a', y: 3 }, { x: 'c', y: 5 }]]);
    expect(layersOf(radial).map(l => l.name)).toEqual(['CPU']);
  });

  it('should read a polar area chart as one series of spokes', () => {
    const chart = fakeChart({ type: 'polarArea', slices: [3, 4], labels: ['a', 'b'] });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.POLAR_AREA);
    expect(layer.data).toEqual([[{ x: 'a', y: 3 }, { x: 'b', y: 4 }]]);
    expect(layer.selectors).toEqual([`${ROOT(chart)} path.apexcharts-pie-area:not([data-maidr-owned])`]);
  });

  it('should read each radial bar ring as a 0-100 gauge', () => {
    const chart = fakeChart({ type: 'radialBar', slices: [40, 70], labels: ['CPU', 'RAM'] });

    const layers = layersOf(chart);

    expect(layers.map(l => l.data as GaugePoint)).toEqual([
      { value: 40, min: 0, max: 100, label: 'CPU' },
      { value: 70, min: 0, max: 100, label: 'RAM' },
    ]);
    expect(layers[1].selectors).toBe(`${ROOT(chart)} path.apexcharts-radialbar-area.apexcharts-radialbar-slice-1`);
    expect(layers[0].axes?.x).toEqual({ label: 'Measure' });
  });
});

describe('heatmap', () => {
  const series = [
    { name: 'R1', values: [1, 2] },
    { name: 'R2', values: [3, null] },
    { name: 'R3', values: [5] },
  ];

  it('should run the rows top-first, the last series on top, and index the grid bottom-first', () => {
    const chart = fakeChart({
      type: 'heatmap',
      series,
      labels: ['a', 'b'],
      draw: (dom) => {
        // ApexCharts draws the last series first; R3 has no second cell.
        for (const [i, values] of [[2, [5]], [1, [3, null]], [0, [1, 2]]] as [number, (number | null)[]][]) {
          const group = dom.series(i, 'apexcharts-heatmap');
          values.forEach((val, j) => svg('rect', { class: 'apexcharts-heatmap-rect', i, j, val: val ?? undefined }, group));
        }
      },
    });

    const layer = onlyLayer(chart);
    const data = layer.data as HeatmapData;
    const cell = (i: number, j: number): string => `${ROOT(chart)} rect.apexcharts-heatmap-rect[i="${i}"][j="${j}"]`;

    expect(layer.type).toBe(TraceType.HEATMAP);
    expect(data.x).toEqual(['a', 'b']);
    expect(data.y).toEqual(['R3', 'R2', 'R1']);
    expect(data.points).toEqual([[5, null], [3, null], [1, 2]]);
    expect(layer.selectors).toEqual([[cell(0, 0), cell(0, 1)], [cell(1, 0), cell(1, 1)], [cell(2, 0), null]]);
  });

  it('should keep the series order top-first on a reversed y axis', () => {
    const chart = fakeChart({
      type: 'heatmap',
      series: series.slice(0, 2),
      labels: ['a', 'b'],
      config: { yaxis: [{ reversed: true, title: {} }] },
    });

    const layer = onlyLayer(chart);

    expect((layer.data as HeatmapData).y).toEqual(['R1', 'R2']);
    expect((layer.selectors as string[][])[0][0]).toBe(`${ROOT(chart)} rect.apexcharts-heatmap-rect[i="1"][j="0"]`);
  });
});

describe('candlestick and box plot', () => {
  it('should read open, high, low and close and name each candle\'s parts', () => {
    const chart = fakeChart({
      type: 'candlestick',
      series: [{ name: 'Price', values: [30, 20] }],
      labels: [1, 2],
      categoryLabels: ['d1', 'd2'],
      isXNumeric: true,
      globals: {
        seriesCandleO: [[20, 30]],
        seriesCandleH: [[40, 35]],
        seriesCandleL: [[10, 15]],
        seriesCandleC: [[30, 20]],
      },
    });

    const layer = onlyLayer(chart);
    const selectors = layer.selectors as CandlestickSelector;

    expect(layer.type).toBe(TraceType.CANDLESTICK);
    expect(layer.data as CandlestickPoint[]).toEqual([
      { value: 'd1', open: 20, high: 40, low: 10, close: 30, volatility: 30 },
      { value: 'd2', open: 30, high: 35, low: 15, close: 20, volatility: 20 },
    ]);
    expect(selectors.body).toEqual([0, 1].map(j => `${GROUP(chart, 0)} path[data-maidr-index="${j}"][data-maidr-part="body"]`));
    expect(selectors.wickHigh).toHaveLength(2);
    expect(selectors.wickLow).toHaveLength(2);
  });

  it('should label datetime candles with the date', () => {
    const start = Date.UTC(2024, 2, 1);
    const chart = fakeChart({
      type: 'candlestick',
      series: [{ name: 'Price', values: [30], x: [start] }],
      labels: [start],
      isXNumeric: true,
      config: { xaxis: { type: 'datetime', title: {} } },
      globals: { seriesCandleO: [[20]], seriesCandleH: [[40]], seriesCandleL: [[10]], seriesCandleC: [[30]] },
    });

    expect((onlyLayer(chart).data as CandlestickPoint[])[0].value).toBe('Mar 1, 2024');
  });

  const boxGlobals = {
    seriesCandleO: [[10, 5]],
    seriesCandleH: [[20, 15]],
    seriesCandleM: [[30, 25]],
    seriesCandleL: [[40, 35]],
    seriesCandleC: [[50, 45]],
  };

  it('should map ApexCharts\' candlestick fields to the five numbers of each box', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [{ name: 'B', values: [50, 45] }],
      labels: [1, 2],
      categoryLabels: ['g1', 'g2'],
      isXNumeric: true,
      globals: boxGlobals,
    });

    const layer = onlyLayer(chart);
    const part = (j: number, name: string): string => `${GROUP(chart, 0)} path[data-maidr-index="${j}"][data-maidr-part="${name}"]`;

    expect(layer.type).toBe(TraceType.BOX);
    expect((layer.data as BoxPoint[])[0]).toEqual({
      z: 'g1',
      lowerOutliers: [],
      min: 10,
      q1: 20,
      q2: 30,
      q3: 40,
      max: 50,
      upperOutliers: [],
    });
    expect((layer.selectors as BoxSelector[])[1]).toEqual({
      lowerOutliers: [],
      min: part(1, 'min'),
      iq: part(1, 'iq'),
      q1: part(1, 'q1'),
      q2: part(1, 'q2'),
      q3: part(1, 'q3'),
      max: part(1, 'max'),
      upperOutliers: [],
    });
  });

  it('should mark a horizontal box plot horizontal without reordering the boxes', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [{ name: 'B', values: [50, 45], x: ['g1', 'g2'] }],
      labels: ['g1', 'g2'],
      globals: { ...boxGlobals, isBarHorizontal: true },
    });

    const layer = onlyLayer(chart);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BoxPoint[]).map(b => b.z)).toEqual(['g1', 'g2']);
  });

  it('should fold a scatter series of points outside the whiskers into the boxes\' outliers', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [
        { name: 'B', type: 'boxPlot', values: [50, 45] },
        { name: 'Outliers', type: 'scatter', values: [70, 1], x: [1, 2], written: [{ x: 'g1', y: 70 }, { x: 'g2', y: 1 }] },
      ],
      labels: [1, 2],
      categoryLabels: ['g1', 'g2'],
      isXNumeric: true,
      globals: { seriesCandleO: [[10, 5], []], seriesCandleH: [[20, 15], []], seriesCandleM: [[30, 25], []], seriesCandleL: [[40, 35], []], seriesCandleC: [[50, 45], []] },
    });

    const layers = layersOf(chart);
    const data = layers[0].data as BoxPoint[];
    const selectors = layers[0].selectors as BoxSelector[];

    expect(layers).toHaveLength(1);
    expect(data.map(b => [b.lowerOutliers, b.upperOutliers])).toEqual([[[], [70]], [[1], []]]);
    expect(selectors[0].upperOutliers).toEqual([
      `${GROUP(chart, 1)} .apexcharts-series-markers > path.apexcharts-marker[j="0"]:not([data-maidr-owned])`,
    ]);
    expect(selectors[1].lowerOutliers).toHaveLength(1);
  });

  it('should keep a scatter series with a point inside a box as its own layer', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [
        { name: 'B', type: 'boxPlot', values: [50, 45] },
        { name: 'Means', type: 'scatter', values: [30, 25], x: [1, 2], written: [{ x: 'g1', y: 30 }, { x: 'g2', y: 25 }] },
      ],
      labels: [1, 2],
      categoryLabels: ['g1', 'g2'],
      isXNumeric: true,
      globals: { seriesCandleO: [[10, 5], []], seriesCandleH: [[20, 15], []], seriesCandleM: [[30, 25], []], seriesCandleL: [[40, 35], []], seriesCandleC: [[50, 45], []] },
    });

    expect(layersOf(chart).map(l => l.type)).toEqual([TraceType.BOX, TraceType.SCATTER]);
  });
});

describe('radar, treemap and gantt', () => {
  it('should read a radar chart with one spoke-marker selector per series', () => {
    const chart = fakeChart({
      type: 'radar',
      series: [{ name: 'A', values: [1, null, 3] }, { name: 'B', values: [3, 2, 1] }],
      labels: ['x', 'y', 'z'],
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.RADAR);
    expect((layer.data as LinePoint[][])[0]).toEqual([
      { x: 'x', y: 1, z: 'A' },
      { x: 'y', y: null, z: 'A' },
      { x: 'z', y: 3, z: 'A' },
    ]);
    expect(layer.selectors).toEqual([0, 1].map(i => `${GROUP(chart, i)} path.apexcharts-marker[j]:not([data-maidr-owned])`));
  });

  it('should read treemap leaves from the written options, under their series when there are several', () => {
    const chart = fakeChart({
      type: 'treemap',
      series: [
        { name: 'S1', values: [1, 10], written: [{ x: 'small', y: 1 }, { x: 'big', y: 10 }] },
        { name: 'S2', values: [3], written: [{ x: 'q', y: 3 }] },
      ],
      categoryLabels: ['small', 'big'],
    });

    const layer = onlyLayer(chart);

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'small', y: 1, path: ['S1'] },
      { x: 'big', y: 10, path: ['S1'] },
      { x: 'q', y: 3, path: ['S2'] },
    ]);
    expect((layer.selectors as string[])[2]).toBe(`${ROOT(chart)} rect.apexcharts-treemap-rect[i="1"][j="0"]`);
  });

  it('should regroup range bars lane by lane, each lane by start', () => {
    const chart = fakeChart({
      type: 'rangeBar',
      series: [
        { name: 'Bob', values: [3, 6], x: ['Build', 'Test', 'Deploy'] },
        { name: 'Al', values: [5, 9], x: ['Build', 'Deploy'] },
      ],
      labels: ['Build', 'Test', 'Deploy'],
      globals: {
        isBarHorizontal: true,
        seriesRangeStart: [[2, 4], [1, 8]],
        seriesRangeEnd: [[3, 6], [5, 9]],
      },
      config: { xaxis: { title: { text: 'Day' } }, yaxis: [{ title: { text: 'Task' } }] },
    });

    const layer = onlyLayer(chart);
    const data = layer.data as GanttData;
    const bar = (i: number, j: number): string => `${GROUP(chart, i)} path.apexcharts-rangebar-area[j="${j}"]`;

    expect(layer.type).toBe(TraceType.GANTT);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(data.lanes).toEqual(['Build', 'Test', 'Deploy']);
    expect(data.points).toEqual([
      [{ x: 'Build', start: 1, end: 5, label: 'Al' }, { x: 'Build', start: 2, end: 3, label: 'Bob' }],
      [{ x: 'Test', start: 4, end: 6, label: 'Bob' }],
      [{ x: 'Deploy', start: 8, end: 9, label: 'Al' }],
    ]);
    expect(layer.selectors).toEqual([bar(1, 0), bar(0, 0), bar(0, 1), bar(1, 1)]);
    expect(layer.axes).toEqual({ x: { label: 'Day' }, y: { label: 'Task' } });
  });
});

describe('after an update', () => {
  // ApexCharts copies new data into `w.globals.initialSeries` and
  // `w.config.series` on updateSeries()/updateOptions(), and never into
  // `chart.opts`, which keeps the data the chart was created with.

  /**
   * Replaces the data a chart holds, the way ApexCharts does, leaving
   * `chart.opts` as it was.
   *
   * @param chart   - The chart
   * @param written - The new data, one array of written points per series
   */
  function update(chart: FakeChart, written: unknown[][]): void {
    const series = written.map((data, i) => ({ ...chart.w.config.series[i], data }));
    chart.w.globals.initialSeries = series;
    chart.w.config.series = series;
  }

  it('should name treemap leaves from the data on screen, not the data the chart was created with', () => {
    const chart = fakeChart({
      type: 'treemap',
      series: [{ name: 'S', values: [10, 4], written: [{ x: 'a', y: 10 }, { x: 'b', y: 4 }] }],
      categoryLabels: ['a', 'b'],
    });
    update(chart, [[{ x: 'NEW1', y: 3 }, { x: 'NEW2', y: 9 }]]);
    chart.w.globals.series = [[3, 9]];

    expect((onlyLayer(chart).data as TreemapPoint[]).map(p => p.x)).toEqual(['NEW1', 'NEW2']);
  });

  it('should put range bars in the lanes the new data names', () => {
    const chart = fakeChart({
      type: 'rangeBar',
      series: [{ name: 'S', values: [2, 6], written: [{ x: 'Design', y: [0, 2] }, { x: 'Build', y: [3, 6] }] }],
      labels: ['Design', 'Build'],
      globals: { isBarHorizontal: true, seriesRangeStart: [[0, 3]], seriesRangeEnd: [[2, 6]] },
    });
    update(chart, [[{ x: 'Plan', y: [0, 2] }, { x: 'Ship', y: [3, 6] }]]);
    chart.w.globals.labels = ['Plan', 'Ship'];

    const data = onlyLayer(chart).data as GanttData;

    expect(data.lanes).toEqual(['Plan', 'Ship']);
    expect(data.points).toEqual([[{ x: 'Plan', start: 0, end: 2 }], [{ x: 'Ship', start: 3, end: 6 }]]);
  });

  it('should assign box outliers by the categories the new data names', () => {
    const chart = fakeChart({
      type: 'boxPlot',
      series: [
        { name: 'B', type: 'boxPlot', values: [50, 45] },
        { name: 'Outliers', type: 'scatter', values: [70, 1], x: [1, 2], written: [{ x: 'g1', y: 70 }, { x: 'g2', y: 1 }] },
      ],
      labels: [1, 2],
      categoryLabels: ['g1', 'g2'],
      isXNumeric: true,
      globals: { seriesCandleO: [[10, 5], []], seriesCandleH: [[20, 15], []], seriesCandleM: [[30, 25], []], seriesCandleL: [[40, 35], []], seriesCandleC: [[50, 45], []] },
    });
    update(chart, [chart.w.config.series[0].data as unknown[], [{ x: 'g2', y: 1 }, { x: 'g1', y: 80 }]]);
    (chart.w.globals.series as number[][])[1] = [1, 80];
    chart.w.globals.seriesX = [[], [2, 1]];

    const data = layersOf(chart)[0].data as BoxPoint[];

    expect(data.map(b => [b.lowerOutliers, b.upperOutliers])).toEqual([[[], [80]], [[1], []]]);
  });
});

describe('gantt on a datetime axis', () => {
  const day = 86_400_000;

  /**
   * A range bar chart on a datetime axis.
   *
   * @param starts - Each task's start, in epoch milliseconds
   * @param ends   - Each task's end
   * @returns The chart
   */
  function datetimeGantt(starts: number[], ends: number[]): FakeChart {
    return fakeChart({
      type: 'rangeBar',
      series: [{ name: 'S', values: ends, x: starts.map((_, j) => `T${j}`) }],
      labels: starts.map((_, j) => `T${j}`),
      globals: { isBarHorizontal: true, seriesRangeStart: [starts], seriesRangeEnd: [ends] },
      config: { xaxis: { type: 'datetime', title: { text: 'Date' } } },
    });
  }

  it('should state the positions in days and format them back into dates', () => {
    const start = Date.UTC(2025, 0, 6);
    const layer = onlyLayer(datetimeGantt([start, start + 7 * day], [start + 11 * day, start + 10 * day]));
    const data = layer.data as GanttData;

    expect(data.unit).toBe('days');
    expect(data.points.flat().map(p => p.end - p.start)).toEqual([11, 3]);
    const format = layer.axes?.x?.format?.function ?? '';
    // eslint-disable-next-line no-new-func
    const render = new Function('value', format) as (value: number) => string;
    expect(render(data.points[0][0].start)).toBe('Jan 6, 2025');
  });

  it('should fall back to hours for tasks shorter than a day', () => {
    const start = Date.UTC(2025, 0, 6, 9);
    const data = onlyLayer(datetimeGantt([start], [start + 3 * 3_600_000])).data as GanttData;

    expect(data.unit).toBe('hours');
    expect(data.points[0][0].end - data.points[0][0].start).toBe(3);
  });

  it('should leave a numeric axis unscaled and without a unit', () => {
    const chart = fakeChart({
      type: 'rangeBar',
      series: [{ name: 'S', values: [5], x: ['T'] }],
      labels: ['T'],
      globals: { isBarHorizontal: true, seriesRangeStart: [[2]], seriesRangeEnd: [[5]] },
    });

    const data = onlyLayer(chart).data as GanttData;

    expect(data.unit).toBeUndefined();
    expect(data.points).toEqual([[{ x: 'T', start: 2, end: 5 }]]);
  });
});

describe('combo charts', () => {
  it('should emit one layer per kind of series, in the order they first appear', () => {
    const chart = fakeChart({
      type: 'line',
      series: [
        { name: 'Line', type: 'line', values: [3, 2, 1] },
        { name: 'C1', type: 'column', values: [1, 2, 3] },
        { name: 'C2', type: 'column', values: [2, 1, 2] },
        { name: 'Area', type: 'area', values: [2, 2, 2] },
      ],
      labels: [1, 2, 3],
      categoryLabels: ['a', 'b', 'c'],
      isXNumeric: true,
    });

    const maidr = apexchartsToMaidr(chart);
    const layers = maidr.subplots[0][0].layers;

    expect(layers.map(l => l.type)).toEqual([TraceType.LINE, TraceType.DODGED, TraceType.AREA]);
    expect((layers[1].data as SegmentedPoint[][])[0].map(p => p.x)).toEqual(['a', 'b', 'c']);
    expect(new Set(layers.map(l => l.id)).size).toBe(3);
    expect(maidr.subplots[0][0].legend).toEqual(['Line', 'C1', 'C2', 'Area']);
  });
});
