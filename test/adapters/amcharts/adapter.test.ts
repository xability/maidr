import type { BarPoint, LinePoint, MaidrLayer, PiePoint } from '@type/grammar';
import { findCharts, findXYCharts, fromAmCharts, fromXYChart } from '@adapters/amcharts/adapter';
import { TraceType } from '@type/grammar';
import {
  fakeAreaSeries,
  fakeBarSeries,
  fakeChart,
  fakeContainer,
  fakeContainerEl,
  fakeFunnelSeries,
  fakeLineSeries,
  fakePieChart,
  fakePieSeries,
  fakePolarSeries,
  fakeRadarSeries,
  fakeRoot,
  fakeSlicedChart,
  fakeStepSeries,
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
    expect(() => fromAmCharts(fakeRoot([]))).toThrow(/no XYChart or PieChart found/);
  });

  it('binds a StepLineSeries as a step layer, not a line', () => {
    const chart = fakeChart({
      series: [fakeStepSeries('Stage', BAR_DATA)],
      xLabel: 'Day',
      yLabel: 'Stage',
    });

    const result = fromAmCharts(fakeRoot([chart]));

    const layer = result.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.STEP);
    expect(layer.title).toBe('Stage');
    // amCharts reports no convention, so MAIDR names none rather than guessing.
    expect(layer.stepDirection).toBeUndefined();
    expect(layer.data).toEqual([[
      { x: 'Sat', y: 87, z: 'Stage' },
      { x: 'Sun', y: 76, z: 'Stage' },
    ]]);
  });

  it('keeps step series out of the line layer when a chart has both', () => {
    const chart = fakeChart({
      series: [
        fakeLineSeries('Trend', BAR_DATA),
        fakeStepSeries('Stage', BAR_DATA),
      ],
    });

    const result = fromAmCharts(fakeRoot([chart]));

    const layers = result.subplots[0][0].layers;
    expect(layers.map(layer => [layer.type, layer.title])).toEqual([
      [TraceType.LINE, 'Trend'],
      [TraceType.STEP, 'Stage'],
    ]);
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

describe('fromAmCharts (pie chart)', () => {
  const PIE_DATA = [
    { category: 'Apples', value: 30 },
    { category: 'Bananas', value: 50 },
    { category: 'Cherries', value: 20 },
  ];

  it('finds a PieChart, which has a series list but no axes', () => {
    const pie = fakePieChart({ series: [fakePieSeries('Fruit', PIE_DATA)] });
    const root = fakeRoot([pie]);

    expect(findCharts(root)).toEqual([pie]);
    // The narrower query still answers only for XY charts.
    expect(findXYCharts(root)).toEqual([]);
  });

  it('converts a pie series into a flat pie layer', () => {
    const pie = fakePieChart({
      series: [fakePieSeries('Fruit', PIE_DATA)],
      title: 'Fruit sales',
    });

    const result = fromAmCharts(fakeRoot([pie], 'pie-chart'));

    expect(result.id).toBe('amcharts-pie-chart');
    expect(result.title).toBe('Fruit sales');

    const layer = result.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.title).toBe('Fruit');
    // A pie is bound to no axis, so the dimensions are named for what they hold.
    expect(layer.axes).toEqual({ x: { label: 'Label' }, y: { label: 'Value' } });
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('skips slices with no value so slice k stays the wedge k it names', () => {
    const pie = fakePieChart({
      series: [fakePieSeries('Fruit', [
        { category: 'Apples', value: 30 },
        { category: 'Bananas', value: null },
        { category: 'Cherries', value: 20 },
      ])],
    });

    const layer = fromAmCharts(fakeRoot([pie])).subplots[0][0].layers[0];

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('honors axis-label overrides on a pie layer', () => {
    const pie = fakePieChart({ series: [fakePieSeries('Fruit', PIE_DATA)] });

    const result = fromAmCharts(fakeRoot([pie]), {
      axisLabels: { x: 'Fruit', y: 'Units' },
    });

    expect(result.subplots[0][0].layers[0].axes)
      .toEqual({ x: { label: 'Fruit' }, y: { label: 'Units' } });
  });

  it('emits no selectors: amCharts renders wedges to canvas, not to SVG', () => {
    const pie = fakePieChart({ series: [fakePieSeries('Fruit', PIE_DATA)] });

    const layer = fromAmCharts(fakeRoot([pie])).subplots[0][0].layers[0];

    expect(layer.selectors).toBeUndefined();
  });

  it('pairs a pie chart with an XY chart as two panels of one figure', () => {
    const bar = fakeChart({ series: [fakeBarSeries('Tips', BAR_DATA)], title: 'Tips' });
    const pie = fakePieChart({ series: [fakePieSeries('Fruit', PIE_DATA)], title: 'Fruit' });

    const result = fromAmCharts(fakeRoot([bar, pie]));

    // Neither chart reports bounds, so the grid falls back to one row.
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0].map(subplot => subplot.layers[0].type))
      .toEqual([TraceType.BAR, TraceType.PIE]);
  });
});

describe('fromAmCharts (area chart)', () => {
  const BAND_A = [
    { categoryX: '2020', valueY: 10 },
    { categoryX: '2021', valueY: 14 },
  ];
  const BAND_B = [
    { categoryX: '2020', valueY: 4 },
    { categoryX: '2021', valueY: 6 },
  ];

  function layerOf(...series: ReturnType<typeof fakeAreaSeries>[]): MaidrLayer {
    return fromAmCharts(fakeRoot([fakeChart({ series })])).subplots[0][0].layers[0];
  }

  it('reads a filled line series as an area, not as a line', () => {
    const layer = layerOf(fakeAreaSeries('Sales', BAND_A));

    expect(layer.type).toBe(TraceType.AREA);
    expect(layer.title).toBe('Sales');
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: '2020', y: 10, z: 'Sales' },
      { x: '2021', y: 14, z: 'Sales' },
    ]]);
  });

  it('leaves an unfilled line series a line', () => {
    const layer = layerOf(fakeAreaSeries('Sales', BAND_A, { fillOpacity: 0 }));

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a line whose fills are switched off a line, whatever they are filled with', () => {
    const layer = layerOf(
      fakeAreaSeries('Sales', BAND_A, { fillOpacity: 0.8, fillVisible: false }),
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('reads stacked bands as a stacked area, one row per band', () => {
    const layer = layerOf(
      fakeAreaSeries('Sales', BAND_A, { stacked: true }),
      fakeAreaSeries('Expenses', BAND_B, { stacked: true }),
    );

    expect(layer.type).toBe(TraceType.STACKED_AREA);
    expect(layer.title).toBe('Sales, Expenses');
    expect((layer.data as LinePoint[][]).map(band => band.map(point => point.y)))
      .toEqual([[10, 14], [4, 6]]);
  });

  it('keeps the bottom band in the stack when only the bands above declare `stacked`', () => {
    // amCharts commonly sets `stacked` on the bands that sit ON another one
    // and leaves it off the bottom band; splitting by the flag would announce
    // that band as an area chart of its own.
    const layer = layerOf(
      fakeAreaSeries('Sales', BAND_A),
      fakeAreaSeries('Expenses', BAND_B, { stacked: true }),
    );

    expect(layer.type).toBe(TraceType.STACKED_AREA);
    expect(layer.data as LinePoint[][]).toHaveLength(2);
  });

  it('reads a 100% stack as a normalized area', () => {
    const layer = layerOf(
      fakeAreaSeries('Sales', BAND_A, { stacked: true }),
      fakeAreaSeries('Expenses', BAND_B, { stacked: true, normalized: true }),
    );

    expect(layer.type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('keeps area series out of the line layer when a chart has both', () => {
    const chart = fakeChart({
      series: [fakeLineSeries('Trend', BAND_A), fakeAreaSeries('Band', BAND_B)],
    });

    const layers = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers;

    expect(layers.map(layer => [layer.type, layer.title])).toEqual([
      [TraceType.LINE, 'Trend'],
      [TraceType.AREA, 'Band'],
    ]);
  });
});

describe('fromAmCharts (radar chart)', () => {
  const SPOKES_A = [
    { categoryX: 'Speed', valueY: 8 },
    { categoryX: 'Range', valueY: 4 },
    { categoryX: 'Comfort', valueY: 6 },
  ];
  const SPOKES_B = [
    { categoryX: 'Speed', valueY: 5 },
    { categoryX: 'Range', valueY: 7 },
    { categoryX: 'Comfort', valueY: 3 },
  ];

  it('reads a RadarLineSeries as a radar, not as the bar chart it fell back to', () => {
    const chart = fakeChart({
      className: 'RadarChart',
      series: [fakeRadarSeries('Model A', SPOKES_A), fakeRadarSeries('Model B', SPOKES_B)],
      xLabel: 'Attribute',
      yLabel: 'Score',
    });

    const layer = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.RADAR);
    expect(layer.title).toBe('Model A, Model B');
    expect(layer.axes).toEqual({ x: { label: 'Attribute' }, y: { label: 'Score' } });
    // One row per series, one column per spoke, in spoke order.
    expect(layer.data as LinePoint[][]).toEqual([
      [
        { x: 'Speed', y: 8, z: 'Model A' },
        { x: 'Range', y: 4, z: 'Model A' },
        { x: 'Comfort', y: 6, z: 'Model A' },
      ],
      [
        { x: 'Speed', y: 5, z: 'Model B' },
        { x: 'Range', y: 7, z: 'Model B' },
        { x: 'Comfort', y: 3, z: 'Model B' },
      ],
    ]);
  });

  it('reads a RadarColumnSeries as a polar area', () => {
    const chart = fakeChart({
      className: 'RadarChart',
      series: [fakePolarSeries('Rainfall', SPOKES_A)],
    });

    const layer = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.POLAR_AREA);
    expect(layer.title).toBe('Rainfall');
    expect((layer.data as LinePoint[][])[0].map(point => point.y)).toEqual([8, 4, 6]);
  });

  it('keeps the two radar marks in layers of their own', () => {
    const chart = fakeChart({
      className: 'RadarChart',
      series: [fakeRadarSeries('Outline', SPOKES_A), fakePolarSeries('Wedges', SPOKES_B)],
    });

    const layers = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers;

    expect(layers.map(layer => layer.type))
      .toEqual([TraceType.RADAR, TraceType.POLAR_AREA]);
  });
});

describe('fromAmCharts (sliced chart)', () => {
  const STAGES = [
    { category: 'Visited', value: 10000 },
    { category: 'Signed up', value: 2400 },
    { category: 'Purchased', value: 100 },
  ];

  it('finds a SlicedChart, which like a PieChart has a series list but no axes', () => {
    const sliced = fakeSlicedChart({ series: [fakeFunnelSeries('Checkout', STAGES)] });
    const root = fakeRoot([sliced]);

    expect(findCharts(root)).toEqual([sliced]);
    expect(findXYCharts(root)).toEqual([]);
  });

  it('converts a funnel series into a funnel layer, stages in data order', () => {
    const sliced = fakeSlicedChart({
      series: [fakeFunnelSeries('Checkout', STAGES)],
      title: 'Checkout funnel',
    });

    const result = fromAmCharts(fakeRoot([sliced], 'funnel-chart'));

    expect(result.title).toBe('Checkout funnel');
    const layer = result.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.title).toBe('Checkout');
    // A sliced chart is bound to no axis, so the dimensions name what they hold.
    expect(layer.axes).toEqual({ x: { label: 'Stage' }, y: { label: 'Value' } });
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Purchased', y: 100 },
    ]);
  });

  it('reads a pyramid as the same ordered stages a funnel is', () => {
    const sliced = fakeSlicedChart({
      series: [fakeFunnelSeries('Checkout', STAGES, 'PyramidSeries')],
    });

    expect(fromAmCharts(fakeRoot([sliced])).subplots[0][0].layers[0].type)
      .toBe(TraceType.FUNNEL);
  });

  it('skips stages with no value so stage k stays the stage it names', () => {
    const sliced = fakeSlicedChart({
      series: [fakeFunnelSeries('Checkout', [
        { category: 'Visited', value: 10000 },
        { category: 'Signed up', value: null },
        { category: 'Purchased', value: 100 },
      ])],
    });

    const layer = fromAmCharts(fakeRoot([sliced])).subplots[0][0].layers[0];

    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Purchased', y: 100 },
    ]);
  });

  it('emits no selectors: amCharts renders the stages to canvas, not to SVG', () => {
    const sliced = fakeSlicedChart({ series: [fakeFunnelSeries('Checkout', STAGES)] });

    expect(fromAmCharts(fakeRoot([sliced])).subplots[0][0].layers[0].selectors)
      .toBeUndefined();
  });

  it('honors axis-label overrides on a funnel layer', () => {
    const sliced = fakeSlicedChart({ series: [fakeFunnelSeries('Checkout', STAGES)] });

    const result = fromAmCharts(fakeRoot([sliced]), {
      axisLabels: { x: 'Step', y: 'People' },
    });

    expect(result.subplots[0][0].layers[0].axes)
      .toEqual({ x: { label: 'Step' }, y: { label: 'People' } });
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
