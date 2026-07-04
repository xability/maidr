import type { BarPoint, MaidrLayer } from '@type/grammar';
import { findXYCharts, fromAmCharts, fromXYChart } from '@adapters/amcharts/adapter';
import { TraceType } from '@type/grammar';
import {
  fakeBarSeries,
  fakeChart,
  fakeContainer,
  fakeContainerEl,
  fakeLineSeries,
  fakeRoot,
} from './helpers';

const BAR_DATA = [
  { categoryX: 'Sat', valueY: 87 },
  { categoryX: 'Sun', valueY: 76 },
];

describe('findXYCharts', () => {
  it('finds every XYChart at the top level of root.container', () => {
    const chartA = fakeChart({ series: [fakeBarSeries('A', BAR_DATA)] });
    const chartB = fakeChart({ series: [fakeBarSeries('B', BAR_DATA)] });
    const root = fakeRoot([chartA, chartB]);

    expect(findXYCharts(root)).toEqual([chartA, chartB]);
  });

  it('recurses into nested containers (am5stock StockPanel pattern)', () => {
    const panelA = fakeChart({ series: [fakeBarSeries('A', BAR_DATA)] });
    const panelB = fakeChart({ series: [fakeLineSeries('B', BAR_DATA)] });
    // StockChart itself has no series/xAxes/yAxes; panels are nested deeper.
    const panelsContainer = fakeContainer([panelA, panelB]);
    const stockChartLike = fakeContainer([panelsContainer]);
    const root = fakeRoot([stockChartLike]);

    expect(findXYCharts(root)).toEqual([panelA, panelB]);
  });

  it('excludes XYChartScrollbar preview charts (am5stock toolsContainer pattern)', () => {
    // A real XYChartScrollbar is NOT chart-like itself (no series/xAxes/yAxes);
    // its preview is a plain XYChart child holding a copy of the main data.
    const previewChart = fakeChart({ series: [fakeBarSeries('A', BAR_DATA)] });
    const scrollbar = fakeContainer([previewChart], 'XYChartScrollbar');

    const mainPanel = fakeChart({ series: [fakeBarSeries('A', BAR_DATA)] });
    const panelsContainer = fakeContainer([mainPanel]);
    const toolsContainer = fakeContainer([scrollbar]);
    // stockChart.toolsContainer.children.push(scrollbar) re-parents the
    // scrollbar OUTSIDE any panel, so only pruning keeps the preview out.
    const stockChartLike = fakeContainer([toolsContainer, panelsContainer]);
    const root = fakeRoot([stockChartLike]);

    expect(findXYCharts(root)).toEqual([mainPanel]);
  });

  it('does not descend into a found chart (its scrollbar never becomes a panel)', () => {
    const nestedScrollbar = fakeChart({ series: [fakeBarSeries('S', BAR_DATA)] });
    const chart = fakeChart({ series: [fakeBarSeries('A', BAR_DATA)] });
    // Stuff a chart-like child inside the found chart.
    (chart as unknown as { children: { values: unknown[] } }).children = {
      values: [nestedScrollbar],
    };
    const root = fakeRoot([chart]);

    expect(findXYCharts(root)).toEqual([chart]);
  });

  it('returns an empty array when no chart exists', () => {
    expect(findXYCharts(fakeRoot([fakeContainer([])]))).toEqual([]);
  });
});

describe('fromAmCharts (single chart)', () => {
  it('produces the original 1x1 grid with a bar layer', () => {
    const chart = fakeChart({
      series: [fakeBarSeries('Tips', BAR_DATA)],
      title: 'Tips by Day',
      xLabel: 'Day',
      yLabel: 'Count',
    });
    const root = fakeRoot([chart], 'bar-chart');

    const result = fromAmCharts(root);

    expect(result.id).toBe('amcharts-bar-chart');
    expect(result.title).toBe('Tips by Day');
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(1);

    const layer = result.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.title).toBe('Tips');
    expect(layer.axes).toEqual({ x: { label: 'Day' }, y: { label: 'Count' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Sat', y: 87 },
      { x: 'Sun', y: 76 },
    ]);
  });

  it('applies option overrides for title and axis labels', () => {
    const chart = fakeChart({
      series: [fakeBarSeries('Tips', BAR_DATA)],
      title: 'Chart Title',
      xLabel: 'Day',
      yLabel: 'Count',
    });
    const root = fakeRoot([chart]);

    const result = fromAmCharts(root, {
      title: 'Override',
      axisLabels: { x: 'X!', y: 'Y!' },
    });

    expect(result.title).toBe('Override');
    const layer = result.subplots[0][0].layers[0];
    expect(layer.axes).toEqual({ x: { label: 'X!' }, y: { label: 'Y!' } });
  });

  it('throws when the root contains no chart', () => {
    expect(() => fromAmCharts(fakeRoot([]))).toThrow(/no XYChart found/);
  });

  it('fromXYChart matches the fromAmCharts single-chart output', () => {
    const chart = fakeChart({
      series: [fakeBarSeries('Tips', BAR_DATA)],
      title: 'Tips by Day',
    });

    const result = fromXYChart(chart, fakeContainerEl('direct'));

    expect(result.id).toBe('amcharts-direct');
    expect(result.title).toBe('Tips by Day');
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
  });
});

describe('fromAmCharts (multi-panel)', () => {
  it('arranges vertically stacked charts as one subplot per row, bottom row first', () => {
    const top = fakeChart({
      series: [fakeBarSeries('Sales', BAR_DATA)],
      title: 'Top Panel',
      xLabel: 'Day',
      yLabel: 'Sales',
      bounds: { left: 40, top: 0, right: 600, bottom: 180 },
    });
    const bottom = fakeChart({
      series: [fakeLineSeries('Trend', BAR_DATA)],
      title: 'Bottom Panel',
      xLabel: 'Day',
      yLabel: 'Trend',
      bounds: { left: 40, top: 200, right: 600, bottom: 380 },
    });
    const root = fakeRoot([top, bottom]);

    const result = fromAmCharts(root);

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(1);
    expect(result.subplots[1]).toHaveLength(1);

    // Rows are emitted BOTTOM-first: the core's MovableGrid maps UPWARD to
    // row+1 and canvas charts get no DOM-based inversion, so data row 0 must
    // be the visually lowest panel for ArrowUp to move visually up.
    const [firstLayer] = result.subplots[0][0].layers;
    const [secondLayer] = result.subplots[1][0].layers;
    // Panel display name lives on the FIRST layer's title.
    expect(firstLayer.title).toBe('Bottom Panel');
    expect(secondLayer.title).toBe('Top Panel');
    expect(firstLayer.type).toBe(TraceType.LINE);
    expect(secondLayer.type).toBe(TraceType.BAR);
    // Per-chart axis labels, not first-chart labels everywhere.
    expect(firstLayer.axes).toEqual({ x: { label: 'Day' }, y: { label: 'Trend' } });
    expect(secondLayer.axes).toEqual({ x: { label: 'Day' }, y: { label: 'Sales' } });
  });

  it('arranges side-by-side charts as one row, sorted left to right', () => {
    const right = fakeChart({
      series: [fakeBarSeries('Right', BAR_DATA)],
      title: 'Right Panel',
      bounds: { left: 320, top: 0, right: 600, bottom: 300 },
    });
    const left = fakeChart({
      series: [fakeBarSeries('Left', BAR_DATA)],
      title: 'Left Panel',
      bounds: { left: 0, top: 0, right: 280, bottom: 300 },
    });
    // Insertion order is right-first; visual order must win.
    const result = fromAmCharts(fakeRoot([right, left]));

    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[0][0].layers[0].title).toBe('Left Panel');
    expect(result.subplots[0][1].layers[0].title).toBe('Right Panel');
  });

  it('clusters a 2x2 grid layout bottom row first, left-to-right within rows', () => {
    const bounds = {
      a: { left: 0, top: 0, right: 280, bottom: 180 },
      b: { left: 320, top: 8, right: 600, bottom: 188 }, // slight offset, same row
      c: { left: 0, top: 220, right: 280, bottom: 400 },
      d: { left: 320, top: 220, right: 600, bottom: 400 },
    };
    const make = (name: string, b: typeof bounds.a): ReturnType<typeof fakeChart> =>
      fakeChart({ series: [fakeBarSeries(name, BAR_DATA)], title: name, bounds: b });

    const result = fromAmCharts(fakeRoot([
      make('D', bounds.d),
      make('B', bounds.b),
      make('C', bounds.c),
      make('A', bounds.a),
    ]));

    const titles = result.subplots.map(row =>
      row.map(subplot => subplot.layers[0].title),
    );
    // Bottom row (C, D) is data row 0 (matplotlib convention: UPWARD = row+1).
    expect(titles).toEqual([['C', 'D'], ['A', 'B']]);
  });

  it('falls back to a single row in insertion order without geometry', () => {
    const first = fakeChart({ series: [fakeBarSeries('First', BAR_DATA)], title: 'First' });
    const second = fakeChart({ series: [fakeBarSeries('Second', BAR_DATA)], title: 'Second' });

    const result = fromAmCharts(fakeRoot([first, second]));

    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[0][0].layers[0].title).toBe('First');
    expect(result.subplots[0][1].layers[0].title).toBe('Second');
  });

  it('drops charts with no supported layers (never emits empty subplots or rows)', () => {
    const withData = fakeChart({
      series: [fakeBarSeries('Data', BAR_DATA)],
      title: 'Data',
      bounds: { left: 0, top: 0, right: 600, bottom: 180 },
    });
    const empty = fakeChart({
      series: [],
      title: 'Empty',
      bounds: { left: 0, top: 200, right: 600, bottom: 380 },
    });

    const result = fromAmCharts(fakeRoot([withData, empty]));

    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(1);
    expect(result.subplots[0][0].layers.length).toBeGreaterThan(0);
    for (const row of result.subplots) {
      expect(row.length).toBeGreaterThan(0);
      for (const subplot of row) {
        expect(subplot.layers.length).toBeGreaterThan(0);
      }
    }
  });

  it('throws a descriptive error when every chart is empty (never emits layers: [])', () => {
    const emptyA = fakeChart({ series: [] });
    const emptyB = fakeChart({ series: [] });

    expect(() => fromAmCharts(fakeRoot([emptyA, emptyB])))
      .toThrow(/no supported series with data/);
  });

  it('throws a descriptive error when a single chart has no data (never emits layers: [])', () => {
    const empty = fakeChart({ series: [] });

    expect(() => fromAmCharts(fakeRoot([empty])))
      .toThrow(/no supported series with data/);
  });

  it('keeps layer ids unique across all panels', () => {
    const chartA = fakeChart({
      series: [fakeBarSeries('A', BAR_DATA), fakeLineSeries('LA', BAR_DATA)],
      bounds: { left: 0, top: 0, right: 600, bottom: 180 },
    });
    const chartB = fakeChart({
      series: [fakeBarSeries('B', BAR_DATA), fakeLineSeries('LB', BAR_DATA)],
      bounds: { left: 0, top: 200, right: 600, bottom: 380 },
    });

    const result = fromAmCharts(fakeRoot([chartA, chartB]));

    const ids = result.subplots
      .flat()
      .flatMap(subplot => subplot.layers.map((layer: MaidrLayer) => layer.id));
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('applies figure-level axis label overrides to every panel', () => {
    const chartA = fakeChart({
      series: [fakeBarSeries('A', BAR_DATA)],
      xLabel: 'ax',
      yLabel: 'ay',
      bounds: { left: 0, top: 0, right: 600, bottom: 180 },
    });
    const chartB = fakeChart({
      series: [fakeBarSeries('B', BAR_DATA)],
      xLabel: 'bx',
      yLabel: 'by',
      bounds: { left: 0, top: 200, right: 600, bottom: 380 },
    });

    const result = fromAmCharts(fakeRoot([chartA, chartB]), {
      axisLabels: { x: 'Shared X', y: 'Shared Y' },
    });

    for (const row of result.subplots) {
      for (const subplot of row) {
        expect(subplot.layers[0].axes).toEqual({
          x: { label: 'Shared X' },
          y: { label: 'Shared Y' },
        });
      }
    }
  });
});
