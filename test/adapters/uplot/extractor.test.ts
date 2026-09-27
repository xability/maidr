/**
 * @jest-environment jsdom
 */

import type { UPlotSeries } from '@adapters/uplot/types';
import type { BarPoint, LinePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
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

  it('remembers what a series last drew once it is hidden or its cache is cleared', () => {
    const series: UPlotSeries = { label: 'Sales', _paths: BAR_PATHS };
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, series] });
    expect(inferSeriesKind(u, series)).toBe('bar');

    // Hidden from the legend: uPlot keeps no cache for it.
    series.show = false;
    series._paths = undefined;
    expect(inferSeriesKind(u, series)).toBe('bar');
    expect(layersOf(u)[0].type).toBe(TraceType.BAR);

    // Shown again, before the draw that rebuilds the cache.
    series.show = true;
    expect(inferSeriesKind(u, series)).toBe('bar');

    // A later draw with other paths is what it is now.
    series._paths = POINT_PATHS;
    expect(inferSeriesKind(u, series)).toBe('scatter');
    series._paths = undefined;
    expect(inferSeriesKind(u, series)).toBe('scatter');
  });

  it('remembers each series object on its own', () => {
    const bars: UPlotSeries = { _paths: BAR_PATHS };
    const other: UPlotSeries = { show: false };
    const u = fakeUPlot({ data: [[1], [2], [3]], series: [{}, bars, other] });
    inferSeriesKind(u, bars);
    expect(inferSeriesKind(u, other)).toBe('line');
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

  it('treats uPlot\'s default series labels as no label', () => {
    // uPlot fills an unlabelled series in with 'Value', and the x series of a
    // time scale with 'Time'.
    const u = fakeUPlot({
      data: [[1, 2], [3, 4], [5, 6], [7, 8]],
      series: [{ label: 'Value' }, { label: 'Value' }, { label: 'Value', _paths: BAR_PATHS }, { label: 'Value' }],
    });
    const layers = layersOf(u);
    expect((layers[0].data as LinePoint[][]).map(row => row[0].z)).toEqual(['Series 1', 'Series 3']);
    expect(layers[1].title).toBe('Series 2');
    expect(layers[1].axes).toEqual({ x: { label: 'X' }, y: { label: 'Value' } });
  });

  it('names the x axis of a time scale Time when nothing labels it', () => {
    const scales = { x: { time: true, min: 0, max: 10 }, y: { min: 0, max: 10, ori: 1 } };
    const bare = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{}, {}], scales });
    expect(layersOf(bare)[0].axes?.x?.label).toBe('Time');
    const defaulted = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{ label: 'Time' }, {}], scales });
    expect(layersOf(defaulted)[0].axes?.x?.label).toBe('Time');
    const authored = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{ label: 'When' }, {}], scales });
    expect(layersOf(authored)[0].axes?.x?.label).toBe('When');
  });

  it('keeps an x series labelled Time on a numeric scale', () => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{ label: 'Time' }, {}] });
    expect(layersOf(u)[0].axes?.x).toEqual({ label: 'Time' });
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

describe('charts with nothing to read', () => {
  // A dashboard that fills on its first poll is bound before it has data; it
  // reads as a subplot with no layers, and MAIDR announces it as empty.
  it.each([
    ['no x values', [[], []], [{}, {}]],
    ['no y series', [[1, 2]], [{}]],
    ['no data at all', [], [{}, {}]],
  ])('reads %s as a subplot with no layers', (_name, data, series) => {
    const u = fakeUPlot({ data: data as number[][], series });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    expect(maidr.subplots).toEqual([[{ layers: [] }]]);
    expect(sources.size).toBe(0);
    expect(maidr.id).toBe('chart');
  });

  it('reads a chart whose every series is excluded as empty', () => {
    const u = fakeUPlot({ data: [[1], [2]], series: [{}, { maidr: false }] });
    expect(extractUPlotData(u, 'chart').maidr.subplots).toEqual([[{ layers: [] }]]);
  });

  it.each([
    ['bar', BAR_PATHS, 'bar'],
    ['scatter', POINT_PATHS, 'scatter'],
  ])('leaves out a %s series with no readable points', (_name, cache, kind) => {
    const u = fakeUPlot({
      data: [[1, 2], [null, null], [3, 4]],
      series: [{}, { label: 'Gone', _paths: cache }, { label: 'Kept', _paths: cache }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart');
    expect(maidr.subplots[0][0].layers.map(l => l.id)).toEqual([`${kind}-2`]);
    expect([...sources.keys()]).toEqual([`${kind}-2`]);
  });

  it('keeps a line row whose every value is null', () => {
    const u = fakeUPlot({
      data: [[1, 2], [null, null]],
      series: [{}, { label: 'Quiet', _paths: LINE_PATHS }],
    });
    const layers = layersOf(u);
    expect(layers.map(l => l.id)).toEqual(['line-y']);
    expect(layers[0].data).toEqual([[{ x: 1, y: null, z: 'Quiet' }, { x: 2, y: null, z: 'Quiet' }]]);
  });

  it('leaves out a faceted series with no readable points', () => {
    const u = fakeUPlot({
      mode: 2,
      data: [null, [[1, 2], [null, null]], [[3], [4]]],
      series: [{}, {}, {}],
    });
    expect(layersOf(u).map(l => l.id)).toEqual(['scatter-2']);
  });
});

describe('stacked charts', () => {
  // uPlot draws a stack from running totals: Errors 10/20, Warnings 5/15 on
  // top of them, Info 1/2 on top of those.
  const totals = [[1, 2], [10, 20], [15, 35], [16, 37]];
  const bands = [{ series: [3, 2] }, { series: [2, 1] }];

  function stackedLines() {
    return fakeUPlot({
      data: totals,
      bands,
      series: [
        {},
        { label: 'Errors', _paths: LINE_PATHS },
        { label: 'Warnings', _paths: LINE_PATHS },
        { label: 'Info', _paths: LINE_PATHS },
      ],
    });
  }

  function stackedBars(scales?: Parameters<typeof fakeUPlot>[0]['scales']) {
    return fakeUPlot({
      data: totals,
      bands,
      scales,
      series: [
        {},
        { label: 'Errors', _paths: BAR_PATHS },
        { label: 'Warnings', _paths: BAR_PATHS },
        { label: 'Info', _paths: BAR_PATHS },
      ],
      axes: [{ scale: 'x', label: 'Day' }, { scale: 'y', label: 'Lines' }],
    });
  }

  it('reads banded series at face value -- the running totals -- without stacked', () => {
    const rows = layersOf(stackedLines())[0].data as LinePoint[][];
    expect(rows.map(r => r.map(p => p.y))).toEqual([[10, 20], [15, 35], [16, 37]]);
    const layers = layersOf(stackedBars());
    expect(layers.map(l => l.type)).toEqual([TraceType.BAR, TraceType.BAR, TraceType.BAR]);
    expect(layers.map(l => (l.data as BarPoint[]).map(p => p.y))).toEqual([[10, 20], [15, 35], [16, 37]]);
  });

  it('un-stacks line series into each one\'s own share', () => {
    const layers = layersOf(stackedLines(), { stacked: true });
    expect(layers.map(l => [l.id, l.type])).toEqual([['line-y', TraceType.LINE]]);
    expect((layers[0].data as LinePoint[][]).map(r => r.map(p => p.y))).toEqual([[10, 20], [5, 15], [1, 2]]);
  });

  it('keeps a gap in a stacked line a gap, and reads a gap beneath as nothing', () => {
    const u = fakeUPlot({
      data: [[1, 2], [null, 20], [15, null]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'Low', _paths: LINE_PATHS }, { label: 'High', _paths: LINE_PATHS }],
    });
    const rows = layersOf(u, { stacked: true })[0].data as LinePoint[][];
    expect(rows.map(r => r.map(p => p.y))).toEqual([[null, 20], [15, null]]);
  });

  it('reads stacked bars as one stacked_bar layer with a row per series, bottom first', () => {
    const { maidr, sources } = extractUPlotData(stackedBars(), 'chart', { stacked: true });
    const layers = maidr.subplots[0][0].layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe('stacked-y');
    expect(layers[0].type).toBe(TraceType.STACKED);
    expect(layers[0].orientation).toBeUndefined();
    expect(layers[0].axes).toEqual({ x: { label: 'Day' }, y: { label: 'Lines' } });
    expect(layers[0].data as SegmentedPoint[][]).toEqual([
      [{ x: 1, y: 10, z: 'Errors' }, { x: 2, y: 20, z: 'Errors' }],
      [{ x: 1, y: 5, z: 'Warnings' }, { x: 2, y: 15, z: 'Warnings' }],
      [{ x: 1, y: 1, z: 'Info' }, { x: 2, y: 2, z: 'Info' }],
    ]);
    expect(sources.get('stacked-y')).toEqual({
      kind: 'stacked',
      seriesIdxs: [1, 2, 3],
      sourceIdxs: [[0, 1], [0, 1], [0, 1]],
      bases: [null, 1, 2],
      xScale: 'x',
      yScale: 'y',
    });
  });

  it('keeps every stacked row rectangular, reading a missing value as 0', () => {
    const u = fakeUPlot({
      data: [[1, 2, 3], [10, null, 30], [15, 25, null]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'A', _paths: BAR_PATHS }, { label: 'B', _paths: BAR_PATHS }],
    });
    const rows = layersOf(u, { stacked: true })[0].data as SegmentedPoint[][];
    expect(rows.map(r => r.length)).toEqual([3, 3]);
    // B at x 2 sits on a missing A: its whole height is its own.
    expect(rows.map(r => r.map(p => p.y))).toEqual([[10, 0, 30], [5, 25, 0]]);
  });

  it('reads horizontal stacked bars with value and category swapped', () => {
    const u = stackedBars({ x: { min: 0, max: 3, ori: 1 }, y: { min: 0, max: 40, ori: 0 } });
    const layer = layersOf(u, { stacked: true })[0];
    expect(layer.type).toBe(TraceType.STACKED);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'Lines' }, y: { label: 'Day' } });
    expect((layer.data as SegmentedPoint[][])[1]).toEqual([
      { x: 5, y: 1, z: 'Warnings' },
      { x: 15, y: 2, z: 'Warnings' },
    ]);
  });

  it.each([
    ['the x series', [{ series: [2, 0] }]],
    ['an index past the last series', [{ series: [2, 9] }]],
    ['a series banded to itself', [{ series: [2, 2] }]],
    ['a fractional index', [{ series: [2, 1.5] }]],
    ['a band without series', [{}]],
    ['a band with one series', [{ series: [2] }]],
  ])('ignores a band naming %s', (_name, badBands) => {
    const u = fakeUPlot({
      data: [[1], [10], [15]],
      bands: badBands,
      series: [{}, { label: 'A', _paths: BAR_PATHS }, { label: 'B', _paths: BAR_PATHS }],
    });
    const layers = layersOf(u, { stacked: true });
    expect(layers.map(l => l.id)).toEqual(['bar-1', 'bar-2']);
    expect((layers[1].data as BarPoint[])[0].y).toBe(15);
  });

  it('keeps the first band for a series banded twice', () => {
    const u = fakeUPlot({
      data: [[1], [10], [15], [18]],
      bands: [{ series: [3, 2] }, { series: [3, 1] }],
      series: [{}, { label: 'A', _paths: BAR_PATHS }, { label: 'B', _paths: BAR_PATHS }, { label: 'C', _paths: BAR_PATHS }],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart', { stacked: true });
    const layers = maidr.subplots[0][0].layers;
    // The second band is ignored, so A is in no stack at all.
    expect(layers.map(l => l.id)).toEqual(['bar-1', 'stacked-y']);
    // C less B, not C less A.
    expect((layers[1].data as SegmentedPoint[][]).map(r => r[0].y)).toEqual([15, 3]);
    expect(sources.get('stacked-y')?.bases).toEqual([null, 2]);
  });

  it('leaves bars outside every band as bars of their own', () => {
    const u = fakeUPlot({
      data: [[1], [10], [15], [7]],
      bands: [{ series: [2, 1] }],
      series: [{}, { label: 'A', _paths: BAR_PATHS }, { label: 'B', _paths: BAR_PATHS }, { label: 'Solo', _paths: BAR_PATHS }],
    });
    expect(layersOf(u, { stacked: true }).map(l => [l.id, l.type])).toEqual([
      ['stacked-y', TraceType.STACKED],
      ['bar-3', TraceType.BAR],
    ]);
  });

  it('reads band members drawn as lines as lines, un-stacked', () => {
    const u = fakeUPlot({
      data: [[1, 2], [1, 2], [3, 5], [10, 20]],
      bands: [{ series: [2, 1] }],
      series: [
        {},
        { label: 'Low', _paths: LINE_PATHS },
        { label: 'High', _paths: LINE_PATHS },
        { label: 'Bars', _paths: BAR_PATHS },
      ],
    });
    const layers = layersOf(u, { stacked: true });
    expect(layers.map(l => [l.id, l.type])).toEqual([
      ['line-y', TraceType.LINE],
      ['bar-3', TraceType.BAR],
    ]);
    expect((layers[0].data as LinePoint[][]).map(r => r.map(p => p.y))).toEqual([[1, 2], [2, 3]]);
  });
});

describe('filled areas', () => {
  function filled(fill: unknown, extra: Partial<UPlotSeries> = {}) {
    return fakeUPlot({
      data: [[1, 2], [3, 4]],
      series: [{}, { label: 'Load', _paths: LINE_PATHS, fill, ...extra }],
    });
  }

  it('reads a filled line as a line without areas', () => {
    expect(layersOf(filled(() => 'red'))[0].type).toBe(TraceType.LINE);
  });

  it.each([
    ['a fill function returning a color', () => 'rgba(0,0,255,0.3)'],
    ['a fill function that throws without a drawing context', () => {
      throw new Error('no ctx');
    }],
    ['a fill left as a plain value', '#f00'],
  ])('reads %s as an area with areas: true', (_name, fill) => {
    const { maidr, sources } = extractUPlotData(filled(fill), 'chart', { areas: true });
    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.id).toBe('area-y');
    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.data).toEqual([[{ x: 1, y: 3, z: 'Load' }, { x: 2, y: 4, z: 'Load' }]]);
    expect(sources.get('area-y')?.kind).toBe('area');
  });

  it.each([
    ['a fill function returning null', () => null],
    ['a fill function returning undefined', () => undefined],
    ['no fill', undefined],
  ])('reads %s as a line even with areas: true', (_name, fill) => {
    expect(layersOf(filled(fill), { areas: true })[0].type).toBe(TraceType.LINE);
  });

  it('passes the instance and series index to the fill function', () => {
    const fill = jest.fn(() => 'red');
    const u = filled(fill);
    layersOf(u, { areas: true });
    expect(fill).toHaveBeenCalledWith(u, 1);
  });

  it('does not read filled bars or points as areas', () => {
    const u = fakeUPlot({
      data: [[1, 2], [3, 4], [5, 6]],
      series: [{}, { _paths: BAR_PATHS, fill: () => 'red' }, { _paths: POINT_PATHS, fill: () => 'red' }],
    });
    expect(layersOf(u, { areas: true }).map(l => l.type)).toEqual([TraceType.BAR, TraceType.SCATTER]);
  });

  it('reads kind: \'area\' as an area without areas or a fill', () => {
    const u = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{}, { _paths: LINE_PATHS }] });
    expect(layersOf(u, { series: { 1: { kind: 'area' } } })[0].type).toBe(TraceType.AREA);
    const own = fakeUPlot({ data: [[1, 2], [3, 4]], series: [{}, { maidr: { kind: 'area' } }] });
    expect(layersOf(own)[0].type).toBe(TraceType.AREA);
  });

  it('lets kind: \'line\' keep a filled series a line under areas: true', () => {
    const u = filled(() => 'red', { maidr: { kind: 'line' } });
    expect(layersOf(u, { areas: true })[0].type).toBe(TraceType.LINE);
  });

  it('reads an area and a line on one scale as two layers, in series order', () => {
    const u = fakeUPlot({
      data: [[1, 2], [3, 4], [5, 6], [7, 8]],
      series: [
        {},
        { label: 'Plain', _paths: LINE_PATHS },
        { label: 'Filled', _paths: LINE_PATHS, fill: () => 'red' },
        { label: 'Plain 2', _paths: LINE_PATHS },
      ],
    });
    const { maidr, sources } = extractUPlotData(u, 'chart', { areas: true });
    const layers = maidr.subplots[0][0].layers;
    expect(layers.map(l => [l.id, l.type])).toEqual([
      ['line-y', TraceType.LINE],
      ['area-y', TraceType.AREA],
    ]);
    expect(sources.get('line-y')?.seriesIdxs).toEqual([1, 3]);
    expect(sources.get('area-y')?.seriesIdxs).toEqual([2]);
  });

  it('un-stacks stacked areas', () => {
    const u = fakeUPlot({
      data: [[1, 2], [1, 2], [3, 5]],
      bands: [{ series: [2, 1] }],
      series: [
        {},
        { label: 'Low', _paths: LINE_PATHS, fill: () => 'red' },
        { label: 'High', _paths: LINE_PATHS, fill: () => 'blue' },
      ],
    });
    const layer = layersOf(u, { areas: true, stacked: true })[0];
    expect(layer.type).toBe(TraceType.AREA);
    expect((layer.data as LinePoint[][]).map(r => r.map(p => p.y))).toEqual([[1, 2], [2, 3]]);
  });
});
