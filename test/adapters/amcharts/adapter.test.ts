import type { AmChartsBinderOptions, AmXYSeries } from '@adapters/amcharts/types';
import type {
  BarPoint,
  ChoroplethPoint,
  DumbbellData,
  FlowPoint,
  GanttData,
  GaugePoint,
  LinePoint,
  MaidrLayer,
  NetworkPoint,
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
  fakeFlowSeries,
  fakeForceDirectedSeries,
  fakeFunnelSeries,
  fakeGanttSeries,
  fakeGaugeChart,
  fakeHierarchySeries,
  fakeHorizontalBarSeries,
  fakeLineSeries,
  fakeLollipopSeries,
  fakeMapChart,
  fakeMapPolygon,
  fakeMapPolygonSeries,
  fakePieChart,
  fakePieSeries,
  fakePolarSeries,
  fakeRadarSeries,
  fakeRankSeries,
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

describe('fromAmCharts (bump chart)', () => {
  const ASH = [
    { categoryX: 'R1', valueY: 1 },
    { categoryX: 'R2', valueY: 2 },
    { categoryX: 'R3', valueY: 3 },
  ];
  const BIRCH = [
    { categoryX: 'R1', valueY: 2 },
    { categoryX: 'R2', valueY: 3 },
    { categoryX: 'R3', valueY: 1 },
  ];
  const CEDAR = [
    { categoryX: 'R1', valueY: 3 },
    { categoryX: 'R2', valueY: 1 },
    { categoryX: 'R3', valueY: 2 },
  ];

  function layerOf(series: AmXYSeries[], options?: AmChartsBinderOptions): MaidrLayer {
    const chart = fakeChart({ series, xLabel: 'Round', yLabel: 'Rank' });
    return fromAmCharts(fakeRoot([chart]), options).subplots[0][0].layers[0];
  }

  it('reads places on an inversed value axis as a bump chart', () => {
    const layer = layerOf([
      fakeRankSeries('Ash', ASH),
      fakeRankSeries('Birch', BIRCH),
      fakeRankSeries('Cedar', CEDAR),
    ]);

    expect(layer.type).toBe(TraceType.BUMP);
    expect(layer.title).toBe('Ash, Birch, Cedar');
    expect(layer.axes).toEqual({ x: { label: 'Round' }, y: { label: 'Rank' } });
    expect((layer.data as LinePoint[][])[0]).toEqual([
      { x: 'R1', y: 1, z: 'Ash' },
      { x: 'R2', y: 2, z: 'Ash' },
      { x: 'R3', y: 3, z: 'Ash' },
    ]);
  });

  it('leaves the same places on an upright axis a line chart', () => {
    // Nothing about the numbers says which way up the chart was drawn, and a
    // rank axis is the one thing a bump chart declares about itself.
    const layer = layerOf([
      fakeRankSeries('Ash', ASH, { inversed: false }),
      fakeRankSeries('Birch', BIRCH, { inversed: false }),
      fakeRankSeries('Cedar', CEDAR, { inversed: false }),
    ]);

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves descending magnitudes on an inversed axis a line chart', () => {
    // An inversed axis is also how a plain chart counting DOWN is drawn, so
    // the axis alone would invert the pitch of every one of them.
    const layer = layerOf([
      fakeRankSeries('Ash', [
        { categoryX: 'R1', valueY: 40 },
        { categoryX: 'R2', valueY: 25 },
      ]),
      fakeRankSeries('Birch', [
        { categoryX: 'R1', valueY: 30 },
        { categoryX: 'R2', valueY: 12 },
      ]),
    ]);

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves two lines that share a place in one period a line chart', () => {
    // A ranking is a permutation: two competitors cannot both come second in
    // the same round, so a chart that says they did is measuring something
    // else with small integers.
    const layer = layerOf([
      fakeRankSeries('Ash', [
        { categoryX: 'R1', valueY: 1 },
        { categoryX: 'R2', valueY: 2 },
      ]),
      fakeRankSeries('Birch', [
        { categoryX: 'R1', valueY: 1 },
        { categoryX: 'R2', valueY: 2 },
      ]),
    ]);

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a chart drawn from the middle of a larger field a line chart', () => {
    // Places 2 and 3 of a field whose leader is never drawn. It IS a bump
    // chart, and it is left as a line rather than sonified against a rank
    // range the chart does not carry.
    const layer = layerOf([
      fakeRankSeries('Ash', [{ categoryX: 'R1', valueY: 2 }, { categoryX: 'R2', valueY: 3 }]),
      fakeRankSeries('Birch', [{ categoryX: 'R1', valueY: 3 }, { categoryX: 'R2', valueY: 2 }]),
      fakeRankSeries('Cedar', [{ categoryX: 'R3', valueY: 2 }]),
    ]);

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('reads places as a bump chart when the option declares one and the axis does not', () => {
    const layer = layerOf(
      [
        fakeRankSeries('Ash', ASH, { inversed: false }),
        fakeRankSeries('Birch', BIRCH, { inversed: false }),
        fakeRankSeries('Cedar', CEDAR, { inversed: false }),
      ],
      { bump: true },
    );

    expect(layer.type).toBe(TraceType.BUMP);
  });

  it('leaves a declared bump chart a line when its values are not places', () => {
    // The option is figure-wide, so a `true` meant for one panel must not
    // invert the pitch of a plain line chart in the next one.
    const layer = layerOf(
      [
        fakeRankSeries('Ash', [
          { categoryX: 'R1', valueY: 40 },
          { categoryX: 'R2', valueY: 25 },
        ]),
        fakeRankSeries('Birch', [
          { categoryX: 'R1', valueY: 30 },
          { categoryX: 'R2', valueY: 12 },
        ]),
      ],
      { bump: true },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a rank chart a line when the option says it is not one', () => {
    const layer = layerOf(
      [
        fakeRankSeries('Ash', ASH),
        fakeRankSeries('Birch', BIRCH),
        fakeRankSeries('Cedar', CEDAR),
      ],
      { bump: false },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves an ordinary line chart alone', () => {
    const layer = layerOf([fakeLineSeries('Trend', BAR_DATA)]);

    expect(layer.type).toBe(TraceType.LINE);
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

describe('fromAmCharts (sunburst)', () => {
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
      { category: 'Africa', children: [{ category: 'Nigeria', value: 224 }] },
    ],
  };

  it('finds a standalone Sunburst, which like a treemap is no chart at all', () => {
    // A `Sunburst` extends `Partition` but carries its own class name, so it is
    // discovered only because it is named in its own right.
    const series = fakeHierarchySeries('Population', TREE, 'Sunburst');
    const root = fakeRoot([fakeContainer([series])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
  });

  it('reads a Sunburst as a sunburst, not as the icicle it extends', () => {
    const series = fakeHierarchySeries('Population', TREE, 'Sunburst');

    const layer = fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SUNBURST);
    expect(layer.title).toBe('Population');
    // A tree is bound to no axis, so the dimensions name what they hold.
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Value' } });
    // The same walk the treemap and the icicle emit: one tree, three marks.
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Asia', path: [] },
      { x: 'China', y: 1425, path: ['Asia'] },
      { x: 'India', y: 1428, path: ['Asia'] },
      { x: 'Africa', path: [] },
      { x: 'Nigeria', y: 224, path: ['Africa'] },
    ]);
  });

  it('emits no selectors: amCharts paints the wedges to canvas, not to SVG', () => {
    const series = fakeHierarchySeries('Population', TREE, 'Sunburst');

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].selectors)
      .toBeUndefined();
  });
});

describe('fromAmCharts (flow: sankey, chord, arc diagram)', () => {
  const LINKS = [
    { sourceId: 'Coal', targetId: 'Electricity', value: 34 },
    { sourceId: 'Gas', targetId: 'Electricity', value: 21 },
    { sourceId: 'Electricity', targetId: 'Homes', value: 40 },
  ];

  it('finds a standalone Sankey, which like a treemap is no chart at all', () => {
    // An am5flow series is an `am5.Series` pushed straight into a container,
    // so discovery has to recognise the series itself or recurse past it.
    const series = fakeFlowSeries('Energy', LINKS);
    const root = fakeRoot([fakeContainer([series])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
  });

  it('converts a Sankey into one point per link, nodes derived from the ends', () => {
    const series = fakeFlowSeries('Energy', LINKS);

    const layer = fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.title).toBe('Energy');
    // A flow is bound to no axis, so the dimensions name what they hold.
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Weight' } });
    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Gas', target: 'Electricity', value: 21 },
      { source: 'Electricity', target: 'Homes', value: 40 },
    ]);
  });

  it('reads an end off the node data item when no id was resolved', () => {
    // The second of the three probes: amCharts joined the link to a node
    // object, and the id setting answered with nothing.
    const series = fakeFlowSeries('Energy', [{
      sourceNode: { name: 'Coal' },
      targetNode: { id: 'Electricity' },
      value: 34,
    }]);

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Coal', target: 'Electricity', value: 34 }]);
  });

  it('reads an end and a weight off the author\'s own row as a last resort', () => {
    // The third probe. Neither the resolved id nor a node object answered, so
    // the row the author supplied is all there is — keyed by the fields the
    // series was told to read, which amCharts defaults to `from`/`to`/`value`.
    const series = fakeFlowSeries('Energy', [
      { row: { from: 'Coal', to: 'Electricity', value: 34 } },
      { row: { origin: 'Gas', dest: 'Electricity', mwh: 21 } },
    ], 'Sankey');
    const named = fakeFlowSeries('Energy', [
      { row: { origin: 'Gas', dest: 'Electricity', mwh: 21 } },
    ], 'Sankey', { sourceIdField: 'origin', targetIdField: 'dest', valueField: 'mwh' });

    // Default field names: only the first row reads.
    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Coal', target: 'Electricity', value: 34 }]);
    // The author's own field names: the same row now reads.
    expect(fromAmCharts(fakeRoot([named])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Gas', target: 'Electricity', value: 21 }]);
  });

  it('drops a link with no end, and one carrying no weight', () => {
    // A ribbon amCharts does not draw but MAIDR still counts would slide every
    // later position onto its neighbour. `Number(null)` is 0 and finite, so a
    // missing weight has to be refused rather than coerced.
    const series = fakeFlowSeries('Energy', [
      { sourceId: 'Coal', targetId: 'Electricity', value: 34 },
      { sourceId: 'Gas', value: 21 },
      { sourceId: 'Oil', targetId: 'Electricity' },
      { sourceId: 'Wind', targetId: 'Electricity', value: 0 },
      { sourceId: 'Sun', targetId: 'Electricity', value: Number.NaN },
    ]);

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Coal', target: 'Electricity', value: 34 }]);
  });

  it('reads every Chord variant as a chord, and an ArcDiagram as a sankey', () => {
    // The three chord classes each extend the last and each carry their own
    // class name, so each has to be listed. An arc diagram is a sankey rather
    // than a network: it extends `FlowSeries` and carries weights, and a
    // network payload has nowhere to put one.
    const typeOf = (className: string): TraceType =>
      fromAmCharts(fakeRoot([fakeFlowSeries('Trade', LINKS, className)]))
        .subplots[0][0]
        .layers[0]
        .type;

    expect(typeOf('Chord')).toBe(TraceType.CHORD);
    expect(typeOf('ChordDirected')).toBe(TraceType.CHORD);
    expect(typeOf('ChordNonRibbon')).toBe(TraceType.CHORD);
    expect(typeOf('ArcDiagram')).toBe(TraceType.SANKEY);
  });

  it('emits no selectors: amCharts paints the ribbons to canvas, not to SVG', () => {
    const series = fakeFlowSeries('Energy', LINKS);

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].selectors)
      .toBeUndefined();
  });

  it('leaves a flow series whose links none resolve out of the figure', () => {
    // A layer of nothing is worse than no layer: `convertCharts` drops a chart
    // with none and says so, rather than announcing an empty graph.
    const series = fakeFlowSeries('Energy', [{ value: 34 }, { sourceId: 'Coal' }]);

    expect(() => fromAmCharts(fakeRoot([series]))).toThrow(/no supported series with data/);
  });
});

describe('fromAmCharts (network)', () => {
  const TREE = {
    category: 'Root',
    children: [
      {
        category: 'Ada',
        row: { name: 'Ada', linkWith: ['Grace'] },
        children: [
          { category: 'Alan', row: { name: 'Alan' } },
          { category: 'Grace', row: { name: 'Grace' } },
        ],
      },
      { category: 'Edsger', row: { name: 'Edsger', linkWith: ['Alan', 'Nobody'] } },
    ],
  };

  it('finds a standalone ForceDirected, which is no chart either', () => {
    const series = fakeForceDirectedSeries('People', TREE);
    const root = fakeRoot([fakeContainer([series])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
  });

  it('reads the tree as links: one per parent-child edge, root dropped', () => {
    // A force-directed graph is a HIERARCHY series in amCharts, not a link
    // list, so the edges are the tree's own and the container root is not one
    // of the participants.
    const series = fakeForceDirectedSeries('People', TREE);

    const layer = fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.title).toBe('People');
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Links' } });
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'Ada', target: 'Alan' },
      { source: 'Ada', target: 'Grace' },
    ]);
  });

  it('adds the cross-links a row names, and skips one naming no node', () => {
    // `linkWith` is the only place a force-directed graph's non-tree edges
    // live. An entry the walk never saw names nothing amCharts drew either, so
    // inventing the node would announce a participant the chart does not have.
    const series = fakeForceDirectedSeries('People', TREE, { linkWithField: 'linkWith' });

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data).toEqual([
      { source: 'Ada', target: 'Alan' },
      { source: 'Ada', target: 'Grace' },
      { source: 'Edsger', target: 'Alan' },
    ]);
  });

  it('resolves a cross-link named by id when that is not the node label', () => {
    // `idField` and `categoryField` are the same column in amCharts' own
    // examples, but they need not be — and a reference by id is still a
    // reference to a node the walk saw.
    const series = fakeForceDirectedSeries('People', {
      category: 'Root',
      children: [
        { category: 'Ada Lovelace', row: { key: 'ada', linkWith: ['grace'] } },
        { category: 'Grace Hopper', row: { key: 'grace' } },
      ],
    }, { linkWithField: 'linkWith', idField: 'key' });

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Ada Lovelace', target: 'Grace Hopper' }]);
  });

  it('emits one link for a pair that names itself from both ends', () => {
    // A link is undirected, so two rows naming each other draw one line.
    const series = fakeForceDirectedSeries('People', {
      category: 'Root',
      children: [
        { category: 'Ada', row: { linkWith: ['Grace'] } },
        { category: 'Grace', row: { linkWith: ['Ada'] } },
      ],
    }, { linkWithField: 'linkWith' });

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].data)
      .toEqual([{ source: 'Ada', target: 'Grace' }]);
  });

  it('emits no selectors: amCharts paints the links to canvas, not to SVG', () => {
    const series = fakeForceDirectedSeries('People', TREE);

    expect(fromAmCharts(fakeRoot([series])).subplots[0][0].layers[0].selectors)
      .toBeUndefined();
  });
});

describe('fromAmCharts (gauge)', () => {
  function gaugeLayer(config: Parameters<typeof fakeGaugeChart>[0] = {}): MaidrLayer {
    return fromAmCharts(fakeRoot([fakeGaugeChart(config)])).subplots[0][0].layers[0];
  }

  it('reads a RadarChart with a ClockHand and no series at all as a gauge', () => {
    // The whole point of the shape: the needle is a bullet on an AXIS data
    // item, so the series loop finds nothing and the chart-level fallback is
    // the only thing that can see the reading.
    const layer = gaugeLayer({ value: 73, min: 0, max: 120, axisLabel: 'km/h' });

    expect(layer.type).toBe(TraceType.GAUGE);
    // A single object, not an array of one: the chart draws exactly one measure.
    expect(layer.data).toEqual({ value: 73, min: 0, max: 120, label: 'km/h' });
    expect(Array.isArray(layer.data)).toBe(false);
    expect(layer.axes).toEqual({ x: { label: 'Measure' }, y: { label: 'km/h' } });
  });

  it('names the measure after the chart when the chart is titled', () => {
    const layer = gaugeLayer({ value: 40, title: 'Server load', axisLabel: 'percent' });

    expect(layer.title).toBe('Server load');
    expect((layer.data as GaugePoint).label).toBe('Server load');
  });

  it('reads the dial from the extremes amCharts computed when none were set', () => {
    const layer = gaugeLayer({ min: 10, max: 90, value: 55, privateExtremes: true });

    expect(layer.data).toMatchObject({ min: 10, max: 90, value: 55 });
  });

  it('finds a hand filed under the axis dataItems as well as under its ranges', () => {
    // Which list a made axis data item lands in is not checkable without the
    // library, so both are read.
    expect(gaugeLayer({ viaDataItems: true, value: 12 }).data)
      .toMatchObject({ value: 12 });
  });

  it('finds a hand whose bullet exposes its sprite as a plain property', () => {
    expect(gaugeLayer({ bulletProperty: true, value: 12 }).data)
      .toMatchObject({ value: 12 });
  });

  it('carries the dial bands ascending, numbering the ones nothing names', () => {
    const layer = gaugeLayer({
      value: 73,
      bands: [
        { endValue: 100 },
        { endValue: 40, label: 'poor' },
        { endValue: 70 },
      ],
    });

    // Upper edges only: a band starts where the previous one ended, which is
    // why an unsorted list would describe a partition the chart does not draw.
    expect((layer.data as GaugePoint).bands).toEqual([
      { to: 40, label: 'poor' },
      { to: 70, label: 'Band 2' },
      { to: 100, label: 'Band 3' },
    ]);
  });

  it('leaves the hand out of the bands: a reading is not one of them', () => {
    // The hand's own axis range carries a value and no end, which is exactly
    // what separates it from a band.
    const layer = gaugeLayer({ value: 73, bands: [{ endValue: 100 }] });

    expect((layer.data as GaugePoint).bands).toEqual([{ to: 100, label: 'Band 1' }]);
  });

  it('emits no layer for a dial with no finite ends, rather than one of NaNs', () => {
    // GaugeTrace pitches its tone against the range, so a reading with no
    // range behind it is not a reading -- and a chart with no layers is
    // dropped, which is the honest degradation.
    const chart = fakeGaugeChart({ privateExtremes: true, min: Number.NaN, max: Number.NaN });

    expect(() => fromAmCharts(fakeRoot([chart]))).toThrow();
  });

  it('emits no layer when the hand points at no value', () => {
    expect(() => fromAmCharts(fakeRoot([fakeGaugeChart({ value: null })]))).toThrow();
  });

  it('reads the first of several hands, and says so', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(gaugeLayer({ hands: 2, value: 73 }).data).toMatchObject({ value: 73 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('2 hands'));
    } finally {
      warn.mockRestore();
    }
  });

  it('leaves an ordinary radar chart a radar, hand or no hand', () => {
    // RADAR and POLAR_AREA are drawn in the same `RadarChart`, so the gauge
    // path runs only when the series produced no layer at all.
    const chart = fakeGaugeChart({
      series: [fakeRadarSeries('Speed', [
        { categoryX: 'Mon', valueY: 10 },
        { categoryX: 'Tue', valueY: 20 },
      ])],
    });

    const layers = fromAmCharts(fakeRoot([chart])).subplots[0][0].layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.RADAR);
  });

  it('ignores a chart that is not a RadarChart, and a sprite that is no hand', () => {
    expect(() => fromAmCharts(fakeRoot([fakeGaugeChart({ className: 'XYChart' })])))
      .toThrow();
    expect(() => fromAmCharts(fakeRoot([fakeGaugeChart({ handClassName: 'Bullet' })])))
      .toThrow();
  });
});

describe('fromAmCharts (choropleth)', () => {
  /** Three western states, shaded, with the value amCharts resolved. */
  const WEST = [
    { name: 'Washington', value: 12.1 },
    { name: 'Oregon', value: 16.4 },
    { name: 'Nevada', value: 38.9 },
  ];

  it('finds a MapChart, which neither chart gate could see', () => {
    // A `MapChart` is a `SerialChart`: a series list, no axes, and a class name
    // of its own — so `isXYChartLike` and `isPercentChartLike` both miss it and
    // discovery used to recurse straight past into its own containers.
    const series = fakeMapPolygonSeries('Rate', WEST);
    const chart = fakeMapChart({ series: [series] });
    const root = fakeRoot([fakeContainer([chart])]);

    const found = findCharts(root);
    expect(found).toHaveLength(1);
    expect(found[0].series.values).toEqual([series]);
    // Not an XY chart: the narrower entry point must not claim it.
    expect(findXYCharts(root)).toEqual([]);
  });

  it('measures the panel from the MapChart itself, which is its own container', () => {
    // A `MapChart` has no `plotContainer` — that is an `XYChart` notion — so
    // the wrapper points the slot at the chart, which IS a `Container`. Without
    // it `readPlotBounds` answers nothing and a map beside another panel has
    // its highlight suppressed outright.
    const bounds = { left: 0, top: 0, right: 400, bottom: 300 };
    const chart = fakeMapChart({
      series: [fakeMapPolygonSeries('Rate', WEST)],
      bounds,
    });

    const found = findCharts(fakeRoot([chart]));
    expect(found[0].plotContainer?.globalBounds?.()).toEqual(bounds);
  });

  it('converts a shaded MapPolygonSeries into one point per region', () => {
    const series = fakeMapPolygonSeries('Rate', WEST);

    const layer = fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0];

    expect(layer.type).toBe(TraceType.CHOROPLETH);
    expect(layer.title).toBe('Rate');
    // A map is bound to no axis: the value runs along a colour ramp and the
    // regions along nothing at all.
    expect(layer.axes).toEqual({ x: { label: 'Region' }, y: { label: 'Value' } });
    expect(layer.data as ChoroplethPoint[]).toEqual([
      { x: 'Washington', y: 12.1 },
      { x: 'Oregon', y: 16.4 },
      { x: 'Nevada', y: 38.9 },
    ]);
  });

  it('skips the base geography, the graticule, the lines and the pins', () => {
    // A map routinely carries a polygon series with no values under the shaded
    // one. Announcing it would offer a list of every country with nothing to
    // say about any of them — and `classifySeriesKind` answers `'bar'` for
    // anything it does not know, so without the map classes each of these
    // would have been read as a bar chart of its shapes rather than skipped.
    const base = fakeMapPolygonSeries('World', WEST, {});
    const lines = fakeMapPolygonSeries('Routes', WEST, { valueField: 'value' }, 'MapLineSeries');
    const pins = fakeMapPolygonSeries('Cities', WEST, { valueField: 'value' }, 'MapPointSeries');
    const grid = fakeMapPolygonSeries('Grid', WEST, { valueField: 'value' }, 'GraticuleSeries');

    for (const series of [base, lines, pins, grid]) {
      expect(() => fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })])))
        .toThrow(/no supported series with data/);
    }
  });

  it('reads a polygon series shaded through heatRules alone', () => {
    // `heatRules` is how the shading is declared; either it or a bound
    // `valueField` says the author meant this series to carry a reading.
    const series = fakeMapPolygonSeries('Rate', WEST, {
      heatRules: [{ target: 'polygon', dataField: 'value' }],
    });

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0].layers[0].type).toBe(TraceType.CHOROPLETH);
  });

  it('leaves out a region amCharts drew but joined no value onto', () => {
    // The ordinary case on a real map — the shapes drawn in the no-data
    // colour. `Number(null)` is 0 and finite, so an absent value has to be
    // refused rather than coerced into a region worth nothing.
    const series = fakeMapPolygonSeries('Rate', [
      { name: 'Washington', value: 12.1 },
      { name: 'California' },
      { name: 'Nevada', value: 38.9 },
    ]);

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0]
      .data as ChoroplethPoint[])
      .toEqual([{ x: 'Washington', y: 12.1 }, { x: 'Nevada', y: 38.9 }]);
  });

  it('names a region from the row when amCharts resolved no name', () => {
    // A GeoJSON feature keeps everything joined onto it under `properties`,
    // and an am5map row is ordinarily keyed by `id`. Both are on the chain,
    // names ahead of codes: a region is called by its name, not by its FIPS.
    const series = fakeMapPolygonSeries('Rate', [
      { value: 12.1, row: { id: '53', properties: { NAME: 'Washington' } } },
      { value: 38.9, row: { id: '32' } },
    ]);

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0]
      .data as ChoroplethPoint[])
      .toEqual([{ x: 'Washington', y: 12.1 }, { x: '32', y: 38.9 }]);
  });

  it('reads the value off the column the series was bound to', () => {
    // amCharts resolved nothing onto the data item, so the author's own row —
    // keyed by the field the series names — is what carries the shading.
    const series = fakeMapPolygonSeries('Rate', [
      { name: 'Washington', row: { deaths: 12.1 } },
      { name: 'Nevada', row: { deaths: 38.9 } },
    ], { valueField: 'deaths' });

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0]
      .data as ChoroplethPoint[])
      .toEqual([{ x: 'Washington', y: 12.1 }, { x: 'Nevada', y: 38.9 }]);
  });

  it('places the regions from the drawn polygons\' geographic centroids', () => {
    // The centroids are what make this a map rather than a bar chart whose
    // categories happen to be places: `ChoroplethTrace` walks north, south,
    // east and west out of this pair and out of nothing else.
    const series = fakeMapPolygonSeries('Rate', [
      {
        name: 'Washington',
        value: 12.1,
        polygon: fakeMapPolygon({ centroid: { longitude: -120.5, latitude: 47.4 } }),
      },
      {
        name: 'Nevada',
        value: 38.9,
        polygon: fakeMapPolygon({ centroid: { longitude: -116.6, latitude: 39.3 } }),
      },
    ]);

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0]
      .data as ChoroplethPoint[])
      .toEqual([
        { x: 'Washington', y: 12.1, lon: -120.5, lat: 47.4 },
        { x: 'Nevada', y: 38.9, lon: -116.6, lat: 39.3 },
      ]);
  });

  it('omits the pair rather than believing a centroid that is not in degrees', () => {
    // The highest-consequence read in the batch, and the one that cannot be
    // checked without the library. A projected coordinate accepted here is a
    // wrong compass direction; omitted, the map degrades to a region list in
    // declared order, which the grammar explicitly sanctions.
    const projected = fakeMapPolygon({ centroid: { longitude: 1340221, latitude: 5621880 } });
    const absent = fakeMapPolygon({});
    const broken = fakeMapPolygon({ centroidThrows: true });
    const half = fakeMapPolygon({ centroid: { longitude: -116.6, latitude: null } });

    for (const polygon of [projected, absent, broken, half]) {
      const series = fakeMapPolygonSeries('Rate', [
        { name: 'Nevada', value: 38.9, polygon },
      ]);
      expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
        .subplots[0][0]
        .layers[0]
        .data as ChoroplethPoint[])
        .toEqual([{ x: 'Nevada', y: 38.9 }]);
    }
  });

  it('prefers a centroid the author stated to the one the polygon reports', () => {
    // A table of `{ region, value, lon, lat }` states the pair outright, and a
    // stated degree pair beats a derived one — the same order the Highcharts
    // adapter reads a map in.
    const series = fakeMapPolygonSeries('Rate', [{
      name: 'Nevada',
      value: 38.9,
      polygon: fakeMapPolygon({ centroid: { longitude: -1, latitude: -1 } }),
      row: { longitude: -116.6, latitude: 39.3 },
    }]);

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0]
      .layers[0]
      .data as ChoroplethPoint[])
      .toEqual([{ x: 'Nevada', y: 38.9, lon: -116.6, lat: 39.3 }]);
  });

  it('emits no selectors: amCharts paints the polygons to canvas, not to SVG', () => {
    const series = fakeMapPolygonSeries('Rate', WEST);

    expect(fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })]))
      .subplots[0][0].layers[0].selectors).toBeUndefined();
  });

  it('drops a map whose regions all missed their join', () => {
    // Not a layer of NaNs, and not an empty subplot either: `convertCharts`
    // drops a chart yielding no layer and says so, which is the difference
    // between an actionable error and a crash inside the core model.
    const series = fakeMapPolygonSeries('Rate', [{ name: 'Washington' }, { name: 'Nevada' }]);

    expect(() => fromAmCharts(fakeRoot([fakeMapChart({ series: [series] })])))
      .toThrow(/no supported series with data/);
  });

  it('places a map beside another panel in the grid', () => {
    // The wrapper's whole point: with a plot container to measure, a map takes
    // its place in `computeChartGrid` like any other panel.
    const map = fakeMapChart({
      series: [fakeMapPolygonSeries('Rate', WEST)],
      bounds: { left: 0, top: 0, right: 300, bottom: 200 },
    });
    const bars = fakeChart({
      series: [fakeBarSeries('Sales', [{ categoryX: 'Q1', valueY: 5 }])],
      bounds: { left: 0, top: 300, right: 300, bottom: 500 },
    });

    const maidr = fromAmCharts(fakeRoot([map, bars]));

    // Rows are emitted bottom-first, so the lower panel — the bar chart — is
    // row 0 and the map sits above it.
    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    expect(maidr.subplots[1][0].layers[0].type).toBe(TraceType.CHOROPLETH);
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
