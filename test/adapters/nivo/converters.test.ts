/**
 * What each Nivo chart kind converts to, read off the props alone.
 *
 * The props here are the ones Nivo's own docs build each chart from. Where a
 * mapping rests on how Nivo draws rather than on what its props say — which
 * end a horizontal chart starts from, which quantiles a box plot's whiskers
 * sit at — the claim is measured against real rendered output in
 * `renderedDom.esm-test.tsx`; this file pins the payload.
 */

import type { BarPoint, BoxPoint, HeatmapData, LinePoint, MaidrLayer, PiePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { extractNivoLayers, nivoQuantile, nivoToMaidr, toMaidrLayer } from '@adapters/nivo/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { Orientation, PieDirection, TraceType } from '@type/grammar';

const FOOD = [
  { country: 'AD', hotdog: 10, burger: 20 },
  { country: 'AE', hotdog: 5, burger: 7 },
  { country: 'AF', hotdog: 3, burger: 4 },
];

/**
 * The single layer a chart's props convert to.
 * @param type - The Nivo chart kind
 * @param props - The chart's props
 * @returns The emitted layer
 */
function layerOf(type: Parameters<typeof extractNivoLayers>[0], props: Record<string, unknown>): MaidrLayer {
  const layers = nivoToMaidr({ id: 'chart', type, props }).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('nivo bar', () => {
  it('reads a single key as a plain bar chart in data order', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog'],
      indexBy: 'country',
      axisBottom: { legend: 'Country' },
      axisLeft: { legend: 'Hot dogs' },
    });

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.orientation).toBeUndefined();
    expect(layer.axes).toEqual({ x: { label: 'Country' }, y: { label: 'Hot dogs' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'AD', y: 10 },
      { x: 'AE', y: 5 },
      { x: 'AF', y: 3 },
    ]);
  });

  it('falls back to indexBy and the key for axis labels', () => {
    const layer = layerOf('bar', { data: FOOD, keys: ['hotdog'], indexBy: 'country' });
    expect(layer.axes).toEqual({ x: { label: 'country' }, y: { label: 'hotdog' } });
  });

  it('uses Nivo\'s defaults: indexBy "id" and keys ["value"]', () => {
    const layer = layerOf('bar', { data: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] });
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data).toEqual([{ x: 'a', y: 1 }, { x: 'b', y: 2 }]);
  });

  it('leaves out a bar Nivo does not draw', () => {
    const layer = layerOf('bar', {
      data: [{ c: 'A', v: 1 }, { c: 'B', v: null }, { c: 'C' }, { c: 'D', v: 4 }],
      keys: ['v'],
      indexBy: 'c',
    });
    expect(layer.data).toEqual([{ x: 'A', y: 1 }, { x: 'D', y: 4 }]);
  });

  it('stacks several keys by default, series by series from the baseline', () => {
    const layer = layerOf('bar', { data: FOOD, keys: ['hotdog', 'burger'], indexBy: 'country' });

    expect(layer.type).toBe(TraceType.STACKED);
    const data = layer.data as SegmentedPoint[][];
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual([
      { x: 'AD', y: 10, z: 'hotdog' },
      { x: 'AE', y: 5, z: 'hotdog' },
      { x: 'AF', y: 3, z: 'hotdog' },
    ]);
    expect(data[1].map(point => point.z)).toEqual(['burger', 'burger', 'burger']);
  });

  it('reads groupMode="grouped" as a dodged chart', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      groupMode: 'grouped',
    });
    expect(layer.type).toBe(TraceType.DODGED);
    expect(layer.data).toEqual([
      [{ x: 'AD', y: 10, z: 'hotdog' }, { x: 'AE', y: 5, z: 'hotdog' }, { x: 'AF', y: 3, z: 'hotdog' }],
      [{ x: 'AD', y: 20, z: 'burger' }, { x: 'AE', y: 7, z: 'burger' }, { x: 'AF', y: 4, z: 'burger' }],
    ]);
  });

  it('keeps a missing cell of a stacked chart as a gap', () => {
    const layer = layerOf('bar', {
      data: [{ c: 'A', x: 1, y: 2 }, { c: 'B', x: 3 }],
      keys: ['x', 'y'],
      indexBy: 'c',
    });
    const data = layer.data as SegmentedPoint[][];
    expect(Number.isNaN(data[1][1].y)).toBe(true);
  });

  it('swaps a horizontal chart into x = magnitude and keeps the drawn axes', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog'],
      indexBy: 'country',
      layout: 'horizontal',
      axisBottom: { legend: 'Hot dogs' },
      axisLeft: { legend: 'Country' },
    });

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'Hot dogs' }, y: { label: 'Country' } });
    // Nivo draws index 0 at the bottom of a horizontal chart, which is where
    // the core starts a horizontal bar layer, so data order is kept.
    expect(layer.data).toEqual([
      { x: 10, y: 'AD' },
      { x: 5, y: 'AE' },
      { x: 3, y: 'AF' },
    ]);
  });

  it('swaps every series of a horizontal stack', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      layout: 'horizontal',
    });
    expect(layer.type).toBe(TraceType.STACKED);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as SegmentedPoint[][])[1][0]).toEqual({ x: 20, y: 'AD', z: 'burger' });
  });

  it('drops keys the chart starts hidden, and reads what is left', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      initialHiddenIds: ['burger'],
    });
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data).toEqual([{ x: 'AD', y: 10 }, { x: 'AE', y: 5 }, { x: 'AF', y: 3 }]);
    expect(layer.axes).toEqual({ x: { label: 'country' }, y: { label: 'hotdog' } });
    const [info] = extractNivoLayers('bar', {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      initialHiddenIds: ['burger'],
    });
    expect(info.marks).toEqual({
      kind: 'bar',
      testIds: ['bar.item.hotdog.0', 'bar.item.hotdog.1', 'bar.item.hotdog.2'],
    });
  });

  it('accepts an indexBy function', () => {
    const layer = layerOf('bar', {
      data: FOOD,
      keys: ['hotdog'],
      indexBy: (d: { country: string }) => d.country.toLowerCase(),
    });
    expect((layer.data as BarPoint[]).map(point => point.x)).toEqual(['ad', 'ae', 'af']);
  });

  it('names the keys as the legend', () => {
    const figure = nivoToMaidr({
      id: 'c',
      type: 'bar',
      props: { data: FOOD, keys: ['hotdog', 'burger'], indexBy: 'country' },
    });
    expect(figure.subplots[0][0].legend).toEqual(['hotdog', 'burger']);
  });

  it('lists a grouped horizontal chart\'s keys bottom-up, the reverse of the order Nivo stacks them down each band', () => {
    const [info] = extractNivoLayers('bar', {
      data: FOOD,
      keys: ['hotdog', 'burger'],
      indexBy: 'country',
      groupMode: 'grouped',
      layout: 'horizontal',
    });
    const data = info.data as { kind: 'dodged'; points: SegmentedPoint[][] };

    // Row 0 is where Up starts; Nivo draws the first key at the top of its band.
    expect(data.kind).toBe('dodged');
    expect(data.points.map(row => row[0].z)).toEqual(['burger', 'hotdog']);
    expect(data.points[0][0]).toEqual({ x: 20, y: 'AD', z: 'burger' });
    expect(info.legend).toEqual(['burger', 'hotdog']);
    expect(info.marks).toEqual({
      kind: 'barGrid',
      testIds: [
        ['bar.item.burger.0', 'bar.item.burger.1', 'bar.item.burger.2'],
        ['bar.item.hotdog.0', 'bar.item.hotdog.1', 'bar.item.hotdog.2'],
      ],
    });
  });

  it('keeps a grouped vertical chart and a horizontal stack in key order', () => {
    const grouped = extractNivoLayers('bar', { data: FOOD, keys: ['hotdog', 'burger'], indexBy: 'country', groupMode: 'grouped' });
    const stacked = extractNivoLayers('bar', { data: FOOD, keys: ['hotdog', 'burger'], indexBy: 'country', layout: 'horizontal' });
    expect(grouped[0].legend).toEqual(['hotdog', 'burger']);
    expect(stacked[0].legend).toEqual(['hotdog', 'burger']);
  });

  it('reads an accessor that names a dotted key whole, as lodash get does', () => {
    const layer = layerOf('bar', {
      data: [{ 'first.name': 'x', 'v': 1 }],
      keys: ['v'],
      indexBy: 'first.name',
    });
    expect(layer.data).toEqual([{ x: 'x', y: 1 }]);
  });

  it('reads a dotted or bracketed accessor as a path when no key has its whole name', () => {
    const nested = layerOf('bar', { data: [{ who: { name: 'n' }, v: 1 }], keys: ['v'], indexBy: 'who.name' });
    const indexed = layerOf('bar', { data: [{ names: ['a', 'b'], v: 1 }], keys: ['v'], indexBy: 'names[1]' });
    const quoted = layerOf('bar', { data: [{ who: { 'a.b': 'q' }, v: 1 }], keys: ['v'], indexBy: 'who["a.b"]' });
    expect((nested.data as BarPoint[])[0].x).toBe('n');
    expect((indexed.data as BarPoint[])[0].x).toBe('b');
    expect((quoted.data as BarPoint[])[0].x).toBe('q');
  });
});

describe('nivo line: falsy ids', () => {
  it('leaves out a series whose id is falsy, as useLine does', () => {
    const [info] = extractNivoLayers('line', {
      data: [
        { id: 0, data: [{ x: 1, y: 1 }] },
        { id: '', data: [{ x: 1, y: 2 }] },
        { id: 1, data: [{ x: 1, y: 3 }] },
      ],
    });
    expect(info.legend).toEqual(['1']);
    expect(info.marks).toEqual({ kind: 'lines', points: [['line.point.1.0']], seriesCount: 1 });
    expect((info.data as { points: LinePoint[][] }).points).toEqual([[{ x: 1, y: 3, z: '1' }]]);
  });
});

describe('nivo line', () => {
  const SERIES = [
    { id: 'japan', data: [{ x: 'plane', y: 1 }, { x: 'boat', y: null }, { x: 'car', y: 3 }] },
    { id: 'france', data: [{ x: 'plane', y: 4 }, { x: 'boat', y: 5 }, { x: 'car', y: 6 }] },
  ];

  it('reads one row per series, skipping the points Nivo leaves out', () => {
    const layer = layerOf('line', {
      data: SERIES,
      axisBottom: { legend: 'transport' },
      axisLeft: { legend: 'count' },
    });

    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.axes).toEqual({ x: { label: 'transport' }, y: { label: 'count' } });
    const data = layer.data as LinePoint[][];
    expect(data).toEqual([
      [{ x: 'plane', y: 1, z: 'japan' }, { x: 'car', y: 3, z: 'japan' }],
      [{ x: 'plane', y: 4, z: 'france' }, { x: 'boat', y: 5, z: 'france' }, { x: 'car', y: 6, z: 'france' }],
    ]);
  });

  it('names the series as the legend', () => {
    const figure = nivoToMaidr({ id: 'c', type: 'line', props: { data: SERIES } });
    expect(figure.subplots[0][0].legend).toEqual(['japan', 'france']);
  });

  it.each([
    ['step', 'mid'],
    ['stepAfter', 'hv'],
    ['stepBefore', 'vh'],
  ])('reads curve="%s" as a step chart jumping %s', (curve, direction) => {
    const layer = layerOf('line', { data: SERIES, curve });
    expect(layer.type).toBe(TraceType.STEP);
    expect(layer.stepDirection).toBe(direction);
  });

  it('keeps a smooth curve a line', () => {
    const layer = layerOf('line', { data: SERIES, curve: 'monotoneX' });
    expect(layer.type).toBe(TraceType.LINE);
    expect(layer).not.toHaveProperty('stepDirection');
  });

  it('keeps numeric x values numeric', () => {
    const layer = layerOf('line', { data: [{ id: 'a', data: [{ x: 1, y: 2 }, { x: 2, y: 3 }] }] });
    expect((layer.data as LinePoint[][])[0][0]).toEqual({ x: 1, y: 2, z: 'a' });
  });
});

describe('nivo scatterplot', () => {
  it('reads each series as its own named scatter layer', () => {
    const figure = nivoToMaidr({
      id: 'c',
      type: 'scatterplot',
      props: {
        data: [
          { id: 'group A', data: [{ x: 1, y: 2 }, { x: 3, y: 1 }] },
          { id: 'group B', data: [{ x: 2, y: 2 }] },
        ],
        axisBottom: { legend: 'weight' },
        axisLeft: { legend: 'size' },
      },
    });
    const { layers, legend } = figure.subplots[0][0];

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.SCATTER]);
    expect(layers.map(layer => layer.name)).toEqual(['group A', 'group B']);
    expect(layers[0].data as ScatterPoint[]).toEqual([{ x: 1, y: 2 }, { x: 3, y: 1 }]);
    expect(layers[1].axes).toEqual({ x: { label: 'weight' }, y: { label: 'size' } });
    expect(legend).toEqual(['group A', 'group B']);
  });

  it('reads dates as timestamps and skips points with no position', () => {
    const when = new Date('2024-01-02T00:00:00Z');
    const [info] = extractNivoLayers('scatterplot', {
      data: [{ id: 's', data: [{ x: when, y: 1 }, { x: 'n/a', y: 2 }, { x: 3, y: null }, { x: 4, y: 5 }] }],
    });
    expect(info.data).toEqual({ kind: 'scatter', points: [{ x: when.getTime(), y: 1 }, { x: 4, y: 5 }] });
    // The skipped points still have nodes, so the tagger has to skip them too.
    expect(info.marks).toEqual({ kind: 'nodes', drawn: 4, offset: 0, kept: [0, 3] });
  });
});

describe('nivo pie', () => {
  const SLICES = [
    { id: 'go', label: 'Go', value: 1 },
    { id: 'rust', value: 5 },
    { id: 'c', value: 2 },
  ];

  it('reads one slice per datum, labelled the way Nivo labels them', () => {
    const layer = layerOf('pie', { data: SLICES });

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Go', y: 1 },
      { x: 'rust', y: 5 },
      { x: 'c', y: 2 },
    ]);
    // Nivo's default ring starts at 12 o'clock and runs clockwise, which is
    // the grammar's default: nothing is declared.
    expect(layer.startAngle).toBeUndefined();
    expect(layer.direction).toBeUndefined();
    expect(layer.axes).toEqual({ x: { label: 'Category' }, y: { label: 'Value' } });
  });

  it('carries startAngle over and reads a falling endAngle as counterclockwise', () => {
    const layer = layerOf('pie', { data: SLICES, startAngle: 90, endAngle: -270 });
    expect(layer.startAngle).toBe(90);
    expect(layer.direction).toBe(PieDirection.COUNTERCLOCKWISE);
  });

  it('reads a doughnut as the same layer', () => {
    const plain = layerOf('pie', { data: SLICES });
    const donut = layerOf('pie', { data: SLICES, innerRadius: 0.5 });
    expect(donut).toEqual(plain);
  });

  it('honours the id and value accessors', () => {
    const layer = layerOf('pie', {
      data: [{ lang: 'ts', stats: { n: 3 } }],
      id: 'lang',
      value: 'stats.n',
    });
    expect(layer.data).toEqual([{ x: 'ts', y: 3 }]);
  });

  it('lists slices in the order sortByValue lays them out, largest first', () => {
    const [info] = extractNivoLayers('pie', { data: SLICES, sortByValue: true });
    expect(info.data.points).toEqual([
      { x: 'rust', y: 5 },
      { x: 'c', y: 2 },
      { x: 'Go', y: 1 },
    ]);
    // Nivo still draws the arcs in data order, which a pie selector cannot
    // pair with the sorted ring.
    expect(info.marks).toMatchObject({ kind: 'arcs', ordered: false });
  });
});

describe('nivo scatterplot on a time scale', () => {
  it('parses string dates with the scale\'s format, in UTC by default', () => {
    const [info] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time', format: '%Y-%m-%d' },
      data: [{ id: 'A', data: [{ x: '2024-01-01', y: 2 }, { x: '2024-02-01', y: 4 }] }],
    });
    expect(info.data).toEqual({
      kind: 'scatter',
      points: [{ x: Date.UTC(2024, 0, 1), y: 2 }, { x: Date.UTC(2024, 1, 1), y: 4 }],
    });
    expect(info.marks).toEqual({ kind: 'nodes', drawn: 2, offset: 0, kept: [0, 1] });
  });

  it('announces a time axis as dates, in the zone Nivo placed them in', () => {
    const layer = layerOf('scatterplot', {
      xScale: { type: 'time', format: '%Y-%m-%d' },
      axisBottom: { legend: 'Day' },
      data: [{ id: 'A', data: [{ x: '2024-01-01', y: 2 }] }],
    });
    expect(layer.axes?.x).toEqual({
      label: 'Day',
      format: { type: 'date', dateOptions: { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } },
    });
    expect(layer.axes?.y).toBeUndefined();
  });

  it('reads times of day, 12-hour clocks and month names', () => {
    const [info] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time', format: '%d %b %Y %I:%M %p' },
      data: [{ id: 'A', data: [{ x: '05 Mar 2024 01:30 PM', y: 1 }] }],
    });
    const x = (info.data as { points: ScatterPoint[] }).points[0].x;
    expect(x).toBe(Date.UTC(2024, 2, 5, 13, 30));
    expect(info.xAxisFormat).toMatchObject({ dateOptions: { hour: 'numeric', minute: '2-digit' } });
  });

  it('reads native Dates on a time scale and honours useUTC: false', () => {
    const when = new Date(2024, 0, 1);
    const [native] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time' },
      data: [{ id: 'A', data: [{ x: when, y: 1 }] }],
    });
    const [local] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time', format: '%Y-%m-%d', useUTC: false },
      data: [{ id: 'A', data: [{ x: '2024-01-01', y: 1 }] }],
    });
    expect((native.data as { points: ScatterPoint[] }).points[0].x).toBe(when.getTime());
    expect((local.data as { points: ScatterPoint[] }).points[0].x).toBe(when.getTime());
    expect(local.xAxisFormat).toEqual({ type: 'date', dateOptions: { year: 'numeric', month: 'short', day: 'numeric' } });
  });

  it('reads a time y scale too', () => {
    const [info] = extractNivoLayers('scatterplot', {
      yScale: { type: 'time', format: '%Y' },
      data: [{ id: 'A', data: [{ x: 1, y: '2020' }] }],
    });
    expect((info.data as { points: ScatterPoint[] }).points[0]).toEqual({ x: 1, y: Date.UTC(2020, 0, 1) });
    expect(info.yAxisFormat).toMatchObject({ type: 'date' });
  });

  it('reads a number under a format as its text, as d3\'s parser coerces it', () => {
    const [info] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time', format: '%Y' },
      data: [{ id: 'A', data: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }],
    });
    expect((info.data as { points: ScatterPoint[] }).points).toEqual([
      { x: Date.UTC(2020, 0, 1), y: 1 },
      { x: Date.UTC(2021, 0, 1), y: 2 },
    ]);
  });

  it('leaves a falsy number unparsed, as Nivo does, so 0 sits at the epoch', () => {
    const [info] = extractNivoLayers('scatterplot', {
      xScale: { type: 'time', format: '%Y' },
      data: [{ id: 'A', data: [{ x: 0, y: 1 }, { x: 2020, y: 2 }] }],
    });
    expect((info.data as { points: ScatterPoint[] }).points).toEqual([
      { x: 0, y: 1 },
      { x: Date.UTC(2020, 0, 1), y: 2 },
    ]);
  });

  it('warns when a series has points but none can be placed', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const layers = extractNivoLayers('scatterplot', {
      data: [{ id: 'A', data: [{ x: '2024-01-01', y: 2 }] }],
    });
    expect(layers).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"A"');
    warn.mockRestore();
  });
});

describe('nivo heatmap', () => {
  it('builds cell test ids the way Nivo concatenates them, so a Date x matches', () => {
    const when = new Date(Date.UTC(2024, 0, 1));
    const [info] = extractNivoLayers('heatmap', {
      data: [{ id: 'r', data: [{ x: when, y: 1 }] }],
    });
    expect(info.marks).toEqual({ kind: 'cells', testIds: [[`cell.r.${String(when)}`]] });
    // The announced column label stays readable.
    expect((info.data as { points: HeatmapData }).points.x).toEqual(['2024-01-01T00:00:00.000Z']);
  });

  it('reads rows top-first, columns in first-seen order, and nulls as absent', () => {
    const layer = layerOf('heatmap', {
      data: [
        { id: 'Japan', data: [{ x: 'Train', y: 10 }, { x: 'Subway', y: null }] },
        { id: 'France', data: [{ x: 'Train', y: 3 }, { x: 'Bus', y: 4 }] },
      ],
      axisTop: { legend: 'Vehicle' },
      axisLeft: { legend: 'Country' },
    });

    expect(layer.type).toBe(TraceType.HEATMAP);
    expect(layer.axes).toEqual({ x: { label: 'Vehicle' }, y: { label: 'Country' } });
    expect(layer.data as HeatmapData).toEqual({
      x: ['Train', 'Subway', 'Bus'],
      y: ['Japan', 'France'],
      points: [
        [10, null, null],
        [3, null, 4],
      ],
    });
  });
});

describe('nivo boxplot', () => {
  /** Ten observations per group, the second group shifted up by five. */
  const OBSERVATIONS = ['A', 'B'].flatMap(group =>
    Array.from({ length: 10 }, (_, i) => ({ group, value: i + (group === 'B' ? 5 : 0) })));

  it('summarises each group with Nivo\'s default 10/25/50/75/90 quantiles', () => {
    const layer = layerOf('boxplot', { data: OBSERVATIONS });

    expect(layer.type).toBe(TraceType.BOX);
    const [a, b] = layer.data as BoxPoint[];
    // 0..9: the 10th percentile is rank 0.9 → 0.9, the median rank 4.5 → 4.5.
    expect(a).toEqual({
      z: 'A',
      lowerOutliers: [],
      min: 0.9,
      q1: 2.25,
      q2: 4.5,
      q3: 6.75,
      max: 8.1,
      upperOutliers: [],
    });
    expect(b.z).toBe('B');
    expect(b.min).toBeCloseTo(5.9);
    expect(b.max).toBeCloseTo(13.1);
  });

  it('honours a quantiles prop', () => {
    const layer = layerOf('boxplot', { data: OBSERVATIONS, quantiles: [0, 0.25, 0.5, 0.75, 1] });
    const [a] = layer.data as BoxPoint[];
    expect([a.min, a.max]).toEqual([0, 9]);
  });

  it('says which quantiles the whiskers end at, so they are not called a minimum and maximum', () => {
    expect(layerOf('boxplot', { data: OBSERVATIONS }).whiskerQuantiles).toEqual([0.1, 0.9]);
    expect(layerOf('boxplot', { data: OBSERVATIONS, quantiles: [0.05, 0.25, 0.5, 0.75, 0.95] }).whiskerQuantiles)
      .toEqual([0.05, 0.95]);
  });

  it('omits whiskerQuantiles when the whiskers end at the extremes', () => {
    const layer = layerOf('boxplot', { data: OBSERVATIONS, quantiles: [0, 0.25, 0.5, 0.75, 1] });
    expect(layer).not.toHaveProperty('whiskerQuantiles');
  });

  it('takes a precomputed summary\'s whisker quantiles from its own quantiles', () => {
    const layer = layerOf('boxplot', {
      data: [{ group: 'x', subGroup: '', n: 3, mean: 2, extrema: [0, 5], quantiles: [0.02, 0.25, 0.5, 0.75, 0.98], values: [1, 2, 3, 4, 5] }],
    });
    expect(layer.whiskerQuantiles).toEqual([0.02, 0.98]);
  });

  it('interpolates between ranks the way Nivo does', () => {
    expect(nivoQuantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(nivoQuantile([1, 2, 3, 4], 0)).toBe(1);
    expect(nivoQuantile([1, 2, 3, 4], 1)).toBe(4);
    expect(nivoQuantile([10], 0.1)).toBe(10);
  });

  it('sorts observations numerically, not as strings', () => {
    const layer = layerOf('boxplot', {
      data: [9, 10, 100, 2, 1].map(value => ({ group: 'g', value })),
      quantiles: [0, 0.25, 0.5, 0.75, 1],
    });
    const [box] = layer.data as BoxPoint[];
    expect([box.min, box.q2, box.max]).toEqual([1, 9, 100]);
  });

  it('draws a precomputed summary as given', () => {
    const layer = layerOf('boxplot', {
      data: [{ group: 'x', subGroup: '', n: 3, mean: 2, extrema: [0, 5], quantiles: [0.1, 0.25, 0.5, 0.75, 0.9], values: [1, 2, 3, 4, 5] }],
    });
    const [box] = layer.data as BoxPoint[];
    expect([box.min, box.q1, box.q2, box.q3, box.max]).toEqual([1, 2, 3, 4, 5]);
  });

  it('lists a horizontal chart top-first, which is group order reversed', () => {
    const layer = layerOf('boxplot', {
      data: OBSERVATIONS,
      layout: 'horizontal',
      axisBottom: { legend: 'Value' },
      axisLeft: { legend: 'Group' },
    });
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BoxPoint[]).map(box => box.z)).toEqual(['B', 'A']);
    expect(layer.axes).toEqual({ x: { label: 'Value' }, y: { label: 'Group' } });
  });

  it('reads each sub-group as its own named layer', () => {
    const data = ['A', 'B'].flatMap(group => ['M', 'F'].flatMap(subGroup =>
      [1, 2, 3].map(value => ({ group, subGroup, value }))));
    const figure = nivoToMaidr({ id: 'c', type: 'boxplot', props: { data, subGroupBy: 'subGroup' } });
    const { layers, legend } = figure.subplots[0][0];

    expect(layers.map(layer => layer.name)).toEqual(['M', 'F']);
    expect(layers.map(layer => (layer.data as BoxPoint[]).map(box => box.z))).toEqual([['A', 'B'], ['A', 'B']]);
    expect(legend).toEqual(['M', 'F']);
  });

  it('declines fewer than five quantiles', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractNivoLayers('boxplot', { data: OBSERVATIONS, quantiles: [0.5] })).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('nivoToMaidr', () => {
  it('carries the figure metadata and emits no selectors without a scope', () => {
    const figure = nivoToMaidr({
      id: 'sales',
      title: 'Sales',
      subtitle: 'by quarter',
      caption: 'Source: us',
      type: 'bar',
      props: { data: FOOD, keys: ['hotdog'], indexBy: 'country' },
    });
    expect(figure).toMatchObject({ id: 'sales', title: 'Sales', subtitle: 'by quarter', caption: 'Source: us' });
    expect(figure.subplots[0][0].layers[0].selectors).toBeUndefined();
  });

  it('returns an empty subplot for empty data', () => {
    const figure = nivoToMaidr({ id: 'c', type: 'bar', props: { data: [] } });
    expect(figure.subplots).toEqual([[{ layers: [] }]]);
  });

  it('warns on an unknown chart type', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractNivoLayers('sankey' as never, {})).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('converts a layer through toMaidrLayer with the selectors given', () => {
    const [info] = extractNivoLayers('bar', { data: FOOD, keys: ['hotdog'], indexBy: 'country' });
    expect(toMaidrLayer(info, '#x rect').selectors).toBe('#x rect');
  });
});
