/**
 * @jest-environment jsdom
 */

import type { UPlotSeries } from '@adapters/uplot/types';
import type { BarPoint, LinePoint, ScatterPoint } from '@type/grammar';
import { extractUPlotData, inferSeriesKind } from '@adapters/uplot/extractor';
import { Orientation, TraceType } from '@type/grammar';
import { BAR_PATHS, fakeUPlot, LINE_PATHS, POINT_PATHS } from './helpers';

/**
 * The uPlot extractor: what a live instance is read as.
 *
 * uPlot writes down neither what a series draws nor what unit its time scale
 * counts in, so both are inferred -- the kind from the path cache uPlot's own
 * builders leave on a series after drawing, the unit from the size of the
 * timestamps. These tests pin those inferences, the overrides that exist for
 * when they are wrong, and the layer shape each kind produces.
 */

function layersOf(u: ReturnType<typeof fakeUPlot>, options = {}) {
  return extractUPlotData(u, 'chart', options).maidr.subplots[0][0].layers;
}

describe('aligned line series', () => {
  it('reads series sharing a y scale as one line layer with a row per series', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30], [5, 6, 7]],
      series: [{}, { label: 'CPU', _paths: LINE_PATHS }, { label: 'Memory', _paths: LINE_PATHS }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    const layers = maidr.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('line-y');
    expect(layers[0].type).toBe(TraceType.LINE);
    const rows = layers[0].data as LinePoint[][];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      { x: 1, y: 10, z: 'CPU' },
      { x: 2, y: null, z: 'CPU' },
      { x: 3, y: 30, z: 'CPU' },
    ]);
    expect(rows[1].map(p => p.z)).toEqual(['Memory', 'Memory', 'Memory']);
    expect(sources.get('line-y')).toEqual({
      kind: 'line',
      seriesIdxs: [1, 2],
      sourceIdxs: [[0, 1, 2], [0, 1, 2]],
      xScale: 'x',
      yScale: 'y',
    });
    expect(maidr.live).toBe(true);
  });

  it('names an unlabelled series by its index', () => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, {}] });
    const rows = layersOf(u)[0].data as LinePoint[][];
    expect(rows[0][0].z).toBe('Series 1');
  });

  it('reads two y scales as two line layers, in series order', () => {
    const u = fakeUPlot({
      data: [[1, 2], [10, 20], [0.5, 0.6], [30, 40]],
      series: [
        {},
        { label: 'Load', scale: 'y', _paths: LINE_PATHS },
        { label: 'Ratio', scale: 'ratio', _paths: LINE_PATHS },
        { label: 'Load 2', scale: 'y', _paths: LINE_PATHS },
      ],
      axes: [{ scale: 'x' }, { scale: 'y', label: 'Load' }, { scale: 'ratio', label: 'Ratio' }],
    });
    const layers = layersOf(u);
    expect(layers.map(l => l.id)).toEqual(['line-y', 'line-ratio']);
    expect((layers[0].data as LinePoint[][]).length).toBe(2);
    expect((layers[1].data as LinePoint[][]).length).toBe(1);
    expect(layers[0].axes?.y).toEqual({ label: 'Load' });
    expect(layers[1].axes?.y).toEqual({ label: 'Ratio' });
  });

  it('labels a shared scale\'s y axis generically when the axis has no label', () => {
    const u = fakeUPlot({
      data: [[1], [1], [2]],
      series: [{}, { label: 'A' }, { label: 'B' }],
    });
    expect(layersOf(u)[0].axes?.y).toEqual({ label: 'Value' });
  });

  it('labels a single series\' y axis with the series label', () => {
    const u = fakeUPlot({ data: [[1], [1]], series: [{}, { label: 'A' }] });
    expect(layersOf(u)[0].axes?.y).toEqual({ label: 'A' });
  });
});

describe('series kind inference', () => {
  it('reads flags 0 as bars', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [4, null, 6]],
      series: [{}, { label: 'Sales', _paths: BAR_PATHS }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.id).toBe('bar-1');
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.title).toBe('Sales');
    expect(layer.orientation).toBeUndefined();
    // A null bar is left out, and the source indices skip it.
    expect(layer.data as BarPoint[]).toEqual([{ x: 1, y: 4 }, { x: 3, y: 6 }]);
    expect(sources.get('bar-1')?.sourceIdxs).toEqual([[0, 2]]);
  });

  it.each([
    ['a null path cache (paths returning nothing)', null],
    ['flags 3 (the points builder)', POINT_PATHS],
  ])('reads %s as scatter', (_name, cache) => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [4, 5, null]],
      series: [{}, { label: 'Dots', _paths: cache }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.id).toBe('scatter-1');
    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 1, y: 4 }, { x: 2, y: 5 }]);
    expect(sources.get('scatter-1')?.sourceIdxs).toEqual([[0, 1]]);
  });

  it.each([
    ['a hidden series', { show: false, _paths: BAR_PATHS }, 1],
    ['a series never drawn', {}, 1],
    ['a chart that has not drawn yet', { _paths: BAR_PATHS }, 0],
    ['an unknown flag', { _paths: { flags: 7 } }, 1],
  ])('defaults %s to line', (_name, series: UPlotSeries, status) => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, series], status });
    expect(inferSeriesKind(u, series)).toBe('line');
    expect(layersOf(u)[0].type).toBe(TraceType.LINE);
  });

  it('lets options.series override the inferred kind', () => {
    const u = fakeUPlot({
      data: [[1, 2], [3, 4]],
      series: [{}, { _paths: LINE_PATHS }],
    });
    expect(layersOf(u, { series: { 1: { kind: 'bar' } } })[0].type).toBe(TraceType.BAR);
  });

  it('lets series.maidr override the inferred kind', () => {
    const u = fakeUPlot({
      data: [[1, 2], [3, 4]],
      series: [{}, { _paths: BAR_PATHS, maidr: { kind: 'scatter' } }],
    });
    expect(layersOf(u)[0].type).toBe(TraceType.SCATTER);
  });

  it('prefers options.series over series.maidr', () => {
    const u = fakeUPlot({
      data: [[1, 2], [3, 4], [5, 6]],
      series: [{}, { maidr: false }, { label: 'kept' }],
    });
    const layers = layersOf(u, { series: { 1: { kind: 'bar' } } });
    expect(layers.map(l => l.type)).toEqual([TraceType.BAR, TraceType.LINE]);
  });

  it('leaves out series excluded by options, by exclude, or by maidr: false', () => {
    const u = fakeUPlot({
      data: [[1], [1], [2], [3], [4]],
      series: [{}, { label: 'a' }, { label: 'b', maidr: false }, { label: 'c', maidr: { exclude: true } }, { label: 'd' }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart', { series: { 1: { exclude: true } } });
    const rows = maidr.subplots[0][0].layers[0].data as LinePoint[][];
    expect(rows.map(r => r[0].z)).toEqual(['d']);
    expect(sources.get('line-y')?.seriesIdxs).toEqual([4]);
  });
});

describe('time scales', () => {
  const DAY_S = 86_400;
  const base = 1_700_000_000; // 2023-11-14, in seconds

  function timeChart(xs: number[]) {
    return fakeUPlot({
      data: [xs, xs.map((_, i) => i)],
      series: [{}, { label: 'v' }],
      scales: { x: { time: true, min: xs[0], max: xs[xs.length - 1] }, y: { min: 0, max: 10, ori: 1 } },
    });
  }

  it('reads seconds and converts them to milliseconds', () => {
    const layer = layersOf(timeChart([base, base + DAY_S]))[0];
    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual([base * 1000, (base + DAY_S) * 1000]);
    expect(layer.axes?.x?.format?.type).toBe('date');
  });

  it('reads milliseconds as they are', () => {
    const ms = base * 1000;
    const layer = layersOf(timeChart([ms, ms + 60_000]))[0];
    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual([ms, ms + 60_000]);
  });

  it('follows msPerUnit over the inference', () => {
    const layer = layersOf(timeChart([10, 20]), { msPerUnit: 1 })[0];
    expect((layer.data as LinePoint[][])[0].map(p => p.x)).toEqual([10, 20]);
    const inferred = layersOf(timeChart([10, 20]))[0];
    expect((inferred.data as LinePoint[][])[0].map(p => p.x)).toEqual([10_000, 20_000]);
  });

  it.each([
    ['day', DAY_S, { year: 'numeric', month: 'short', day: 'numeric' }],
    ['minute', 60, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }],
    ['second', 5, { hour: 'numeric', minute: '2-digit', second: '2-digit' }],
  ])('formats a %s-level series to that granularity', (_name, step, dateOptions) => {
    const layer = layersOf(timeChart([base, base + step, base + 2 * step]))[0];
    expect(layer.axes?.x?.format).toEqual({ type: 'date', dateOptions });
  });

  it('leaves a numeric x scale unformatted', () => {
    const u = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{}, {}] });
    expect(layersOf(u)[0].axes?.x?.format).toBeUndefined();
  });
});

describe('horizontal bars', () => {
  it('reads a bar series on a vertical x scale as horizontal, with value and category swapped', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, 20, 30]],
      series: [{}, { label: 'Count', _paths: BAR_PATHS }],
      axes: [{ scale: 'x', label: 'Item' }, { scale: 'y', label: 'Count' }],
      scales: { x: { min: 0, max: 4, ori: 1 }, y: { min: 0, max: 40, ori: 0 } },
    });
    const layer = layersOf(u)[0];
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([{ x: 10, y: 1 }, { x: 20, y: 2 }, { x: 30, y: 3 }]);
    expect(layer.axes?.x).toEqual({ label: 'Count' });
    expect(layer.axes?.y).toEqual({ label: 'Item' });
  });
});

describe('faceted mode', () => {
  it('reads every series of mode 2 as its own scatter layer', () => {
    const u = fakeUPlot({
      mode: 2,
      data: [null, [[1, 2, 3], [4, null, 6]], [[7, 8], [9, 10]]],
      series: [
        {},
        { label: 'A', facets: [{ scale: 'x' }, { scale: 'y' }] },
        { label: 'B', facets: [{ scale: 'x' }, { scale: 'y' }] },
      ],
      axes: [{ scale: 'x', label: 'Width' }, { scale: 'y', label: 'Height' }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    const layers = maidr.subplots[0][0].layers;
    expect(layers.map(l => [l.id, l.type, l.title])).toEqual([
      ['scatter-1', TraceType.SCATTER, 'A'],
      ['scatter-2', TraceType.SCATTER, 'B'],
    ]);
    expect(layers[0].data).toEqual([{ x: 1, y: 4 }, { x: 3, y: 6 }]);
    expect(layers[0].axes).toEqual({ x: { label: 'Width' }, y: { label: 'Height' } });
    expect(sources.get('scatter-1')?.sourceIdxs).toEqual([[0, 2]]);
  });

  it('honours exclusion in mode 2', () => {
    const u = fakeUPlot({
      mode: 2,
      data: [null, [[1], [2]], [[3], [4]]],
      series: [{}, { maidr: false }, {}],
    });
    expect(layersOf(u).map(l => l.id)).toEqual(['scatter-2']);
  });
});

describe('labels', () => {
  it('reads the title from .u-title and axis labels from the axes', () => {
    const u = fakeUPlot({
      title: '  Server load  ',
      data: [[1], [2]],
      series: [{ label: 'Time' }, { label: 'Load' }],
      axes: [{ scale: 'x', label: 'Hour' }, { scale: 'y', label: 'Percent' }],
    });
    const { maidr } = extractUPlotData(u, 'chart');
    expect(maidr.title).toBe('Server load');
    expect(maidr.subplots[0][0].layers[0].axes).toEqual({ x: { label: 'Hour' }, y: { label: 'Percent' } });
  });

  it('falls back to the x series label, then X', () => {
    const labelled = fakeUPlot({ data: [[1], [2]], series: [{ label: 'Time' }, {}] });
    expect(layersOf(labelled)[0].axes?.x).toEqual({ label: 'Time' });
    const bare = fakeUPlot({ data: [[1], [2]], series: [{}, {}] });
    expect(layersOf(bare)[0].axes?.x).toEqual({ label: 'X' });
    expect(extractUPlotData(bare, 'chart').maidr.title).toBeUndefined();
  });

  it('prefers the options over everything read from the chart', () => {
    const u = fakeUPlot({
      title: 'From chart',
      data: [[1], [2]],
      series: [{}, { label: 'Load' }],
      axes: [{ scale: 'x', label: 'Hour' }, { scale: 'y', label: 'Percent' }],
    });
    const { maidr } = extractUPlotData(u, 'chart', {
      title: 'T',
      subtitle: 'S',
      caption: 'C',
      xLabel: 'XL',
      yLabel: 'YL',
      live: false,
    });
    expect(maidr).toMatchObject({ id: 'chart', title: 'T', subtitle: 'S', caption: 'C' });
    expect(maidr.live).toBeUndefined();
    expect(maidr.subplots[0][0].layers[0].axes).toEqual({ x: { label: 'XL' }, y: { label: 'YL' } });
  });
});

describe('unreadable charts', () => {
  it.each([
    ['no x values', [[], []]],
    ['no y series', [[1, 2]]],
  ])('throws on %s', (_name, data) => {
    const u = fakeUPlot({ data: data as number[][], series: data.map(() => ({})) });
    expect(() => extractUPlotData(u, 'chart')).toThrow('no series with data to read');
  });

  it('throws when every series is excluded', () => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, { maidr: false }] });
    expect(() => extractUPlotData(u, 'chart')).toThrow('no series with data to read');
  });
});
