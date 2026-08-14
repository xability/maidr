import type { AmXYSeries } from '@adapters/amcharts/types';
import type {
  BarPoint,
  DumbbellData,
  GanttData,
  LinePoint,
  MaidrLayer,
  PiePoint,
  SegmentedPoint,
  TreemapPoint,
  WaterfallPoint,
  WordCloudPoint,
} from '@type/grammar';
import { findCharts, findXYCharts, fromAmCharts, fromXYChart } from '@adapters/amcharts/adapter';
import { Orientation, TraceType } from '@type/grammar';
import {
  fakeAreaSeries,
  fakeBarSeries,
  fakeChart,
  fakeContainer,
  fakeContainerEl,
  fakeDotSeries,
  fakeFloatingColumnSeries,
  fakeFunnelSeries,
  fakeGanttSeries,
  fakeHierarchySeries,
  fakeHorizontalBarSeries,
  fakeLineSeries,
  fakeLollipopSeries,
  fakePieChart,
  fakePieSeries,
  fakePolarSeries,
  fakeRadarSeries,
  fakeRoot,
  fakeSeries,
  fakeSlicedChart,
  fakeStepSeries,
  fakeWordCloudSeries,
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

describe('fromAmCharts (waterfall and dumbbell)', () => {
  // amCharts draws both with the same floating columns; a bridge chains and a
  // barbell does not, which is the only thing that tells them apart.
  const BRIDGE = [
    { categoryX: 'Opening', openValueY: 0, valueY: 1200 },
    { categoryX: 'Marketing', openValueY: 1200, valueY: 950 },
    { categoryX: 'Sales', openValueY: 950, valueY: 1430 },
    { categoryX: 'Closing', openValueY: 0, valueY: 1430 },
  ];
  const PAIRS = [
    { categoryX: 'Denmark', openValueY: 71.2, valueY: 78.4 },
    { categoryX: 'Latvia', openValueY: 74.6, valueY: 69.5 },
  ];

  function layerOf(series: AmXYSeries, options?: Parameters<typeof fromAmCharts>[1]): MaidrLayer {
    return fromAmCharts(fakeRoot([fakeChart({ series: [series] })]), options)
      .subplots[0][0]
      .layers[0];
  }

  it('reads chained floating columns as a waterfall, with both ends per step', () => {
    const layer = layerOf(fakeFloatingColumnSeries('Budget', BRIDGE));

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.title).toBe('Budget');
    expect(layer.data as WaterfallPoint[]).toEqual([
      { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
      { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
      { x: 'Sales', start: 950, end: 1430, delta: 480, kind: 'increase' },
      { x: 'Closing', start: 0, end: 1430, delta: 1430, kind: 'total' },
    ]);
  });

  it('strips float noise from a contribution the chart never rounded', () => {
    const layer = layerOf(fakeFloatingColumnSeries('Budget', [
      { categoryX: 'Opening', openValueY: 0, valueY: 1.1 },
      { categoryX: 'Sales', openValueY: 1.1, valueY: 2.3 },
    ]));

    expect((layer.data as WaterfallPoint[])[1].delta).toBe(1.2);
  });

  it('reads independent pairs as a dumbbell, not as a bridge', () => {
    const layer = layerOf(fakeFloatingColumnSeries('Life expectancy', PAIRS));

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.data as DumbbellData).toEqual({
      points: [
        { x: 'Denmark', start: 71.2, end: 78.4 },
        { x: 'Latvia', start: 74.6, end: 69.5 },
      ],
    });
  });

  it('names a dumbbell\'s two ends from the binder options', () => {
    const layer = layerOf(
      fakeFloatingColumnSeries('Life expectancy', PAIRS),
      { dumbbellLabels: { start: '1990', end: '2020' } },
    );

    const data = layer.data as DumbbellData;
    expect(data.startLabel).toBe('1990');
    expect(data.endLabel).toBe('2020');
  });

  it('skips columns missing an end, so step k stays the step it names', () => {
    const layer = layerOf(fakeFloatingColumnSeries('Budget', [
      { categoryX: 'Opening', openValueY: 0, valueY: 1200 },
      { categoryX: 'Unknown', openValueY: null, valueY: 950 },
      { categoryX: 'Sales', openValueY: 1200, valueY: 1430 },
    ]));

    expect((layer.data as WaterfallPoint[]).map(step => step.x))
      .toEqual(['Opening', 'Sales']);
  });

  it('leaves a plain column series a bar chart', () => {
    const layer = layerOf(fakeBarSeries('Tips', BAR_DATA));

    expect(layer.type).toBe(TraceType.BAR);
  });
});

describe('fromAmCharts (gantt chart)', () => {
  const BARS = [
    { categoryY: 'Design', openValueX: 0, valueX: 2_592_000_000 },
    { categoryY: 'Design', openValueX: 5_184_000_000, valueX: 6_480_000_000 },
    { categoryY: 'Build', openValueX: 2_592_000_000, valueX: 8_640_000_000 },
  ];

  function ganttLayer(config: { lanes?: string[]; timeUnit?: string }): MaidrLayer {
    const series = fakeGanttSeries('Schedule', BARS, config);
    return fromAmCharts(fakeRoot([fakeChart({
      series: [series],
      xLabel: 'Day',
      yLabel: 'Phase',
    })])).subplots[0][0].layers[0];
  }

  it('reads floating columns on a lane axis as a schedule, one row per lane', () => {
    const layer = ganttLayer({ lanes: ['Design', 'Build', 'Launch'], timeUnit: 'day' });

    expect(layer.type).toBe(TraceType.GANTT);
    // A schedule runs left to right, so the lanes are on the y axis.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'Day' }, y: { label: 'Phase' } });

    const data = layer.data as GanttData;
    // Epoch milliseconds are rescaled to the axis' own unit, measured from the
    // earliest interval -- a length in milliseconds carries nothing.
    expect(data.unit).toBe('days');
    expect(data.points).toEqual([
      [
        { x: 'Design', start: 0, end: 30 },
        { x: 'Design', start: 60, end: 75 },
      ],
      [{ x: 'Build', start: 30, end: 100 }],
      [],
    ]);
  });

  it('keeps an empty lane, which a schedule needs to be able to say', () => {
    const data = ganttLayer({ lanes: ['Design', 'Build', 'Launch'], timeUnit: 'day' })
      .data as GanttData;

    expect(data.lanes).toEqual(['Design', 'Build', 'Launch']);
    expect(data.points[2]).toEqual([]);
  });

  it('appends a lane the category axis never declared rather than dropping it', () => {
    const data = ganttLayer({ lanes: ['Design'], timeUnit: 'day' }).data as GanttData;

    expect(data.lanes).toEqual(['Design', 'Build']);
    expect(data.points[1]).toHaveLength(1);
  });

  it('passes a value axis\' positions through untouched and names no unit', () => {
    const series = fakeGanttSeries('Schedule', [
      { categoryY: 'Design', openValueX: 0, valueX: 30 },
    ], { lanes: ['Design'] });

    const layer = fromAmCharts(fakeRoot([fakeChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0];

    const data = layer.data as GanttData;
    expect(data.unit).toBeUndefined();
    expect(data.points[0]).toEqual([{ x: 'Design', start: 0, end: 30 }]);
  });
});

describe('fromAmCharts (hierarchy)', () => {
  const TREE = {
    category: 'Root',
    children: [
      {
        category: 'Asia',
        children: [
          { category: 'China', value: 1425 },
          { category: 'India', value: 1428 },
        ],
      },
      {
        category: 'Africa',
        children: [{ category: 'Nigeria', value: 224 }],
      },
    ],
  };

  it('finds a standalone hierarchy series, which is no chart at all', () => {
    // An am5hierarchy layout is a bare series in a plain container: no series
    // list, no axes, nothing the chart-shaped checks recognise.
    const series = fakeHierarchySeries('Population', TREE);
    const root = fakeRoot([fakeContainer([series])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
    expect(findXYCharts(root)).toEqual([]);
  });

  it('converts a treemap into nodes addressed by path, dropping the root', () => {
    const series = fakeHierarchySeries('Population', TREE);

    const layer = fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.title).toBe('Population');
    // A tree is bound to no axis, so the dimensions name what they hold.
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Value' } });
    // Depth-first, so each level comes out in its left-to-right order -- and
    // a branch carries no value of its own, which the trace totals from below.
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Asia', path: [] },
      { x: 'China', y: 1425, path: ['Asia'] },
      { x: 'India', y: 1428, path: ['Asia'] },
      { x: 'Africa', path: [] },
      { x: 'Nigeria', y: 224, path: ['Africa'] },
    ]);
  });

  it('keeps a branch total the chart declared for itself', () => {
    const series = fakeHierarchySeries('Population', {
      category: 'Root',
      children: [{ category: 'Asia', value: 3000, children: [{ category: 'China', value: 1425 }] }],
    });

    const data = fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data;

    expect((data as TreemapPoint[])[0]).toEqual({ x: 'Asia', y: 3000, path: [] });
  });

  it('reads a Partition as an icicle, the same tree drawn another way', () => {
    const series = fakeHierarchySeries('Population', TREE, 'Partition');

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].type)
      .toBe(TraceType.ICICLE);
  });

  it('emits no selectors: amCharts renders the nodes to canvas, not to SVG', () => {
    const series = fakeHierarchySeries('Population', TREE);

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].selectors)
      .toBeUndefined();
  });
});

describe('fromAmCharts (diverging bars)', () => {
  const MEN = [
    { categoryY: '0-14', valueX: -1200 },
    { categoryY: '15-29', valueX: -1150 },
  ];
  const WOMEN = [
    { categoryY: '0-14', valueX: 1140 },
    { categoryY: '15-29', valueX: 1100 },
  ];

  function layerOf(...series: AmXYSeries[]): MaidrLayer {
    return fromAmCharts(fakeRoot([fakeChart({ series })])).subplots[0][0].layers[0];
  }

  it('reads two column series on opposite sides of the baseline as a pyramid', () => {
    const layer = layerOf(
      fakeHorizontalBarSeries('Men', MEN),
      fakeHorizontalBarSeries('Women', WOMEN),
    );

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // The sign is a direction, not a magnitude, so it survives the extraction
    // exactly as the chart drew it -- the trace pitches the size and announces
    // the side.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [
        { x: -1200, y: '0-14', z: 'Men' },
        { x: -1150, y: '15-29', z: 'Men' },
      ],
      [
        { x: 1140, y: '0-14', z: 'Women' },
        { x: 1100, y: '15-29', z: 'Women' },
      ],
    ]);
  });

  it('reads a vertical pair the same way: the sides are the sign, not the axis', () => {
    const layer = layerOf(
      fakeBarSeries('Losses', [{ categoryX: 'Q1', valueY: -30 }]),
      fakeBarSeries('Gains', [{ categoryX: 'Q1', valueY: 45 }]),
    );

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBeUndefined();
  });

  it('leaves an ordinary grouped pair a dodged bar chart', () => {
    const layer = layerOf(
      fakeBarSeries('2023', [{ categoryX: 'Q1', valueY: 30 }]),
      fakeBarSeries('2024', [{ categoryX: 'Q1', valueY: 45 }]),
    );

    expect(layer.type).toBe(TraceType.DODGED);
  });

  it('leaves a pair over different categories a dodged bar chart', () => {
    // Back-to-back only means anything across a SHARED axis; two series that
    // do not line up are two charts drawn in one frame.
    const layer = layerOf(
      fakeHorizontalBarSeries('Men', MEN),
      fakeHorizontalBarSeries('Women', [
        { categoryY: '30-44', valueX: 1140 },
        { categoryY: '45-59', valueX: 1100 },
      ]),
    );

    expect(layer.type).toBe(TraceType.DODGED);
  });

  it('leaves a declared stack alone: a pyramid is not stacked', () => {
    const layer = layerOf(
      fakeSeries({
        name: 'Men',
        settings: { categoryYField: 'category', stacked: true },
        data: MEN,
      }),
      fakeSeries({
        name: 'Women',
        settings: { categoryYField: 'category', stacked: true },
        data: WOMEN,
      }),
    );

    expect(layer.type).toBe(TraceType.STACKED);
  });

  it('leaves three series a dodged bar chart, whatever their signs', () => {
    const layer = layerOf(
      fakeBarSeries('A', [{ categoryX: 'Q1', valueY: -30 }]),
      fakeBarSeries('B', [{ categoryX: 'Q1', valueY: 45 }]),
      fakeBarSeries('C', [{ categoryX: 'Q1', valueY: 12 }]),
    );

    expect(layer.type).toBe(TraceType.DODGED);
  });
});

describe('fromAmCharts (dot plot and lollipop)', () => {
  const POINTS = [
    { categoryX: '/search', valueY: 412 },
    { categoryX: '/checkout', valueY: 318 },
  ];

  function layerOf(...series: AmXYSeries[]): MaidrLayer {
    return fromAmCharts(fakeRoot([fakeChart({ series })])).subplots[0][0].layers[0];
  }

  it('reads a strokeless line series with bullets as a dot plot', () => {
    const layer = layerOf(fakeDotSeries('Response time', POINTS));

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.title).toBe('Response time');
    // A category and a value, exactly as a bar chart carries them -- the mark
    // is what differs, not what a reader navigates.
    expect(layer.data as BarPoint[]).toEqual([
      { x: '/search', y: 412 },
      { x: '/checkout', y: 318 },
    ]);
  });

  it('accepts a stroke hidden by width rather than by opacity', () => {
    const series = fakeDotSeries('Response time', POINTS);
    (series as unknown as Record<string, unknown>).strokes = {
      values: [],
      template: { get: (key: string) => (key === 'strokeWidth' ? 0 : undefined) },
    };

    expect(layerOf(series).type).toBe(TraceType.DOT);
  });

  it('leaves a line with visible strokes and bullets a line chart', () => {
    // Markers on a line are a line chart with markers, not a dot plot.
    expect(layerOf(fakeDotSeries('Trend', POINTS, { strokeOpacity: 1 })).type)
      .toBe(TraceType.LINE);
  });

  it('leaves a strokeless line with no bullets a line chart', () => {
    expect(layerOf(fakeDotSeries('Trend', POINTS, { bullets: false })).type)
      .toBe(TraceType.LINE);
  });

  it('leaves a filled band an area, however its outline is drawn', () => {
    const band = fakeAreaSeries('Sales', POINTS);
    const raw = band as unknown as Record<string, unknown>;
    raw.strokes = { values: [], template: { get: () => 0 } };
    raw.bullets = { values: [{ get: () => undefined }] };

    expect(layerOf(band).type).toBe(TraceType.AREA);
  });

  it('reads hairline columns with bullets as a lollipop', () => {
    const layer = layerOf(fakeLollipopSeries('Life expectancy', POINTS));

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.data as BarPoint[]).toEqual([
      { x: '/search', y: 412 },
      { x: '/checkout', y: 318 },
    ]);
  });

  it('leaves columns of an ordinary width a bar chart', () => {
    expect(layerOf(fakeLollipopSeries('Sales', POINTS, { thickness: 40 })).type)
      .toBe(TraceType.BAR);
  });

  it('leaves hairline columns with no bullets a bar chart', () => {
    expect(layerOf(fakeLollipopSeries('Sales', POINTS, { bullets: false })).type)
      .toBe(TraceType.BAR);
  });

  it('reads a stem width declared as a percentage as an ordinary bar', () => {
    // amCharts accepts a `Percent` for any dimension, and a column half its
    // cell wide is not a hairline however small the number reads.
    const series = fakeLollipopSeries('Sales', POINTS);
    (series as unknown as Record<string, unknown>).columns = {
      values: [],
      template: { get: () => ({ value: 0.5 }) },
    };

    expect(layerOf(series).type).toBe(TraceType.BAR);
  });

  it('keeps a dot plot and a lollipop in layers of their own', () => {
    const chart = fakeChart({
      series: [fakeDotSeries('Dots', POINTS), fakeLollipopSeries('Stems', POINTS)],
    });

    const layers = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT, TraceType.LOLLIPOP]);
  });
});

describe('fromAmCharts (word cloud)', () => {
  const TERMS = [
    { category: 'neural', value: 128 },
    { category: 'machine', value: 412 },
    { category: 'gradient', value: 57 },
  ];

  it('finds a standalone word cloud series, which like a treemap is no chart', () => {
    const series = fakeWordCloudSeries('Terms', TERMS);
    const root = fakeRoot([fakeContainer([series])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
    expect(findXYCharts(root)).toEqual([]);
  });

  it('converts a word cloud into terms and weights, in data order', () => {
    const layer = fromAmCharts(fakeRoot([fakeWordCloudSeries('Terms', TERMS)]))
      .subplots[0][0]
      .layers[0];

    expect(layer.type).toBe(TraceType.WORD_CLOUD);
    expect(layer.title).toBe('Terms');
    // Bound to no axis: the dimensions name what they hold, since a cloud's
    // layout is chosen to pack glyphs and encodes nothing.
    expect(layer.axes).toEqual({ x: { label: 'Term' }, y: { label: 'Weight' } });
    // Declared order, not weight order -- MAIDR derives the reading order from
    // the weights themselves.
    expect(layer.data as WordCloudPoint[]).toEqual([
      { x: 'neural', y: 128 },
      { x: 'machine', y: 412 },
      { x: 'gradient', y: 57 },
    ]);
  });

  it('skips terms with no weight so term k stays the term it names', () => {
    const layer = fromAmCharts(fakeRoot([fakeWordCloudSeries('Terms', [
      { category: 'neural', value: 128 },
      { category: 'unmeasured', value: null },
      { category: 'machine', value: 412 },
    ])])).subplots[0][0].layers[0];

    expect((layer.data as WordCloudPoint[]).map(term => term.x))
      .toEqual(['neural', 'machine']);
  });

  it('emits no selectors: amCharts renders the glyphs to canvas, not to SVG', () => {
    expect(fromAmCharts(fakeRoot([fakeWordCloudSeries('Terms', TERMS)]))
      .subplots[0][0].layers[0].selectors).toBeUndefined();
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
