import type { NavTarget, SeriesGroups } from '@adapters/amcharts/navmap';
import type { AmXYChart, AmXYSeries } from '@adapters/amcharts/types';
import type { ChoroplethTrace } from '@model/choropleth';
import type { FlowTrace } from '@model/flow';
import type { NetworkTrace } from '@model/network';
import type { MaidrLayer } from '@type/grammar';
import type { FakeNode } from './helpers';
import { fromXYChart } from '@adapters/amcharts/adapter';
import { buildNavigationMap, groupSeries } from '@adapters/amcharts/navmap';
import { dataItemToOverlayRect } from '@adapters/amcharts/overlay';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';
import {
  fakeAreaSeries,
  fakeBarSeries,
  fakeChart,
  fakeClockHand,
  fakeContainerEl,
  fakeDotSeries,
  fakeFloatingColumnSeries,
  fakeFlowSeries,
  fakeForceDirectedSeries,
  fakeFunnelSeries,
  fakeGanttSeries,
  fakeGaugeChart,
  fakeHierarchyLink,
  fakeHierarchySeries,
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
  fakeRibbon,
  fakeSlicedChart,
  fakeWordCloudSeries,
  itemOf,
  spriteOf,
} from './helpers';

function emptyGroups(): SeriesGroups {
  return {
    barSeriesList: [],
    dotSeriesList: [],
    lollipopSeriesList: [],
    lineSeriesList: [],
    stepSeriesList: [],
    areaSeriesList: [],
    radarSeriesList: [],
    polarSeriesList: [],
    histogramSeries: [],
    heatmapSeries: [],
    pieSeriesList: [],
    funnelSeriesList: [],
    waterfallSeriesList: [],
    candlestickSeriesList: [],
    dumbbellSeriesList: [],
    ganttSeriesList: [],
    hierarchySeriesList: [],
    wordCloudSeriesList: [],
    flowSeriesList: [],
    networkSeriesList: [],
    choroplethSeriesList: [],
    declaredList: [],
  };
}

function barLayer(id: string): MaidrLayer {
  return { id, type: TraceType.BAR, data: [] };
}

function lineLayer(id: string): MaidrLayer {
  return { id, type: TraceType.LINE, data: [] };
}

interface Panel {
  chart: AmXYChart;
  layers: MaidrLayer[];
  groups: SeriesGroups;
}

function barPanel(layerId: string, series: AmXYSeries): Panel {
  const chart = fakeChart({ series: [series] });
  return {
    chart,
    layers: [barLayer(layerId)],
    groups: { ...emptyGroups(), barSeriesList: [series] },
  };
}

describe('buildNavigationMap (multi-panel)', () => {
  const seriesA = fakeBarSeries('A', [
    { categoryX: 'Sat', valueY: 87 },
    { categoryX: 'Sun', valueY: 76 },
  ]);
  const seriesB = fakeBarSeries('B', [
    { categoryX: 'Sat', valueY: 10 },
    { categoryX: 'Sun', valueY: 20 },
  ]);
  const panelA = barPanel('layer-a', seriesA);
  const panelB = barPanel('layer-b', seriesB);
  const navMap = buildNavigationMap([panelA, panelB]);

  it('reports the number of distinct panel charts', () => {
    expect(navMap.chartCount).toBe(2);
  });

  it('resolves each layer against its own panel series', () => {
    const targetsA = navMap.resolve('layer-a', 0, 1);
    expect(targetsA).toHaveLength(1);
    expect(targetsA[0].series).toBe(seriesA);
    expect(itemOf(targetsA[0]).get('valueY')).toBe(76);
    expect(targetsA[0].kind).toBe('column');

    const targetsB = navMap.resolve('layer-b', 0, 0);
    expect(targetsB).toHaveLength(1);
    expect(targetsB[0].series).toBe(seriesB);
    expect(itemOf(targetsB[0]).get('valueY')).toBe(10);
  });

  it('records the owning chart per layer', () => {
    expect(navMap.chartFor('layer-a')).toBe(panelA.chart);
    expect(navMap.chartFor('layer-b')).toBe(panelB.chart);
    expect(navMap.chartFor('unknown')).toBeUndefined();
  });

  it('returns no targets for unknown layers or out-of-range positions', () => {
    expect(navMap.resolve('unknown', 0, 0)).toEqual([]);
    expect(navMap.resolve('layer-a', 0, 99)).toEqual([]);
  });
});

describe('buildNavigationMap (behavior preserved from single-panel)', () => {
  it('skips null/gap records so col indices match extractor output', () => {
    const series = fakeBarSeries('Gaps', [
      { categoryX: 'A', valueY: 1 },
      { categoryX: 'B', valueY: null },
      { categoryX: 'C', valueY: 3 },
    ]);
    const navMap = buildNavigationMap([barPanel('bar', series)]);

    const targets = navMap.resolve('bar', 0, 1);
    expect(targets).toHaveLength(1);
    // col 1 is the SECOND kept item, i.e. category C (the gap is skipped).
    expect(itemOf(targets[0]).get('categoryX')).toBe('C');
  });

  it('resolves a pie layer to slice targets, skipping valueless slices', () => {
    const series = fakePieSeries('Fruit', [
      { category: 'Apples', value: 30 },
      { category: 'Bananas', value: null },
      { category: 'Cherries', value: 20 },
    ]);
    const chart = fakePieChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'pie', type: TraceType.PIE, data: [] }],
      groups: { ...emptyGroups(), pieSeriesList: [series] },
    }]);

    const targets = navMap.resolve('pie', 0, 1);
    expect(targets).toHaveLength(1);
    // col 1 is the SECOND kept slice, i.e. Cherries (the gap is skipped).
    expect(itemOf(targets[0]).get('category')).toBe('Cherries');
    expect(targets[0].kind).toBe('slice');
  });

  it('resolves an area layer to point targets, indexing its own series list', () => {
    const line = fakeLineSeries('Trend', [
      { categoryX: '2020', valueY: 100 },
      { categoryX: '2021', valueY: 120 },
    ]);
    const band = fakeAreaSeries('Band', [
      { categoryX: '2020', valueY: 10 },
      { categoryX: '2021', valueY: 14 },
    ]);
    const chart = fakeChart({ series: [line, band] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [lineLayer('lines'), { id: 'bands', type: TraceType.AREA, data: [] }],
      groups: { ...emptyGroups(), lineSeriesList: [line], areaSeriesList: [band] },
    }]);

    // Row 0 of the area layer is the area layer's OWN first series, not the
    // line's -- sharing one list would highlight the wrong mark.
    const targets = navMap.resolve('bands', 0, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].series).toBe(band);
    expect(itemOf(targets[0]).get('valueY')).toBe(14);
    expect(targets[0].kind).toBe('point');
  });

  it('resolves a radar layer to point targets and a polar one to wedges', () => {
    const outline = fakeRadarSeries('Model A', [
      { categoryX: 'Speed', valueY: 8 },
      { categoryX: 'Range', valueY: 4 },
    ]);
    const wedges = fakePolarSeries('Rainfall', [
      { categoryX: 'Jan', valueY: 30 },
      { categoryX: 'Feb', valueY: 20 },
    ]);
    const chart = fakeChart({ className: 'RadarChart', series: [outline, wedges] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [
        { id: 'radar', type: TraceType.RADAR, data: [] },
        { id: 'polar', type: TraceType.POLAR_AREA, data: [] },
      ],
      groups: { ...emptyGroups(), radarSeriesList: [outline], polarSeriesList: [wedges] },
    }]);

    const spoke = navMap.resolve('radar', 0, 1);
    expect(itemOf(spoke[0]).get('valueY')).toBe(4);
    expect(spoke[0].kind).toBe('point');

    // A polar column is a wedge sprite, so the overlay measures it as one.
    const wedge = navMap.resolve('polar', 0, 0);
    expect(wedge[0].series).toBe(wedges);
    expect(wedge[0].kind).toBe('slice');
  });

  it('resolves a funnel layer to stage targets, skipping valueless stages', () => {
    const series = fakeFunnelSeries('Checkout', [
      { category: 'Visited', value: 10000 },
      { category: 'Signed up', value: null },
      { category: 'Purchased', value: 100 },
    ]);
    const chart = fakeSlicedChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'funnel', type: TraceType.FUNNEL, data: [] }],
      groups: { ...emptyGroups(), funnelSeriesList: [series] },
    }]);

    const targets = navMap.resolve('funnel', 0, 1);
    expect(targets).toHaveLength(1);
    // col 1 is the SECOND kept stage, i.e. Purchased (the gap is skipped).
    expect(itemOf(targets[0]).get('category')).toBe('Purchased');
    expect(targets[0].kind).toBe('slice');
  });

  it('resolves a waterfall layer to one column per step, skipping partial ones', () => {
    const series = fakeFloatingColumnSeries('Budget', [
      { categoryX: 'Opening', openValueY: 0, valueY: 1200 },
      { categoryX: 'Unknown', openValueY: null, valueY: 950 },
      { categoryX: 'Sales', openValueY: 1200, valueY: 1430 },
    ]);
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'bridge', type: TraceType.WATERFALL, data: [] }],
      groups: { ...emptyGroups(), waterfallSeriesList: [series] },
    }]);

    const targets = navMap.resolve('bridge', 0, 1);
    expect(targets).toHaveLength(1);
    // col 1 is the SECOND kept step, i.e. Sales (the partial column is skipped).
    expect(itemOf(targets[0]).get('categoryX')).toBe('Sales');
    expect(targets[0].kind).toBe('column');
  });

  it('resolves both ends of a dumbbell to the one column the chart drew', () => {
    const series = fakeFloatingColumnSeries('Life expectancy', [
      { categoryX: 'Denmark', openValueY: 71.2, valueY: 78.4 },
      { categoryX: 'Latvia', openValueY: 74.6, valueY: 69.5 },
    ]);
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'pairs', type: TraceType.DUMBBELL, data: [] }],
      groups: { ...emptyGroups(), dumbbellSeriesList: [series] },
    }]);

    // Row 0 is the starting end and row 1 the finishing one; a chart draws one
    // connector per category, so both resolve to the same mark.
    const start = navMap.resolve('pairs', 0, 1);
    const end = navMap.resolve('pairs', 1, 1);
    expect(itemOf(start[0]).get('categoryX')).toBe('Latvia');
    expect(itemOf(end[0])).toBe(itemOf(start[0]));
  });

  it('resolves a gantt layer by [lane, interval], the grouping the layer holds', () => {
    const series = fakeGanttSeries('Schedule', [
      { categoryY: 'Design', openValueX: 0, valueX: 30 },
      { categoryY: 'Design', openValueX: 60, valueX: 75 },
      { categoryY: 'Build', openValueX: 30, valueX: 100 },
    ], { lanes: ['Design', 'Build', 'Launch'] });
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'schedule', type: TraceType.GANTT, data: [] }],
      groups: { ...emptyGroups(), ganttSeriesList: [series] },
    }]);

    const second = navMap.resolve('schedule', 0, 1);
    expect(itemOf(second[0]).get('openValueX')).toBe(60);
    expect(second[0].kind).toBe('column');

    expect(itemOf(navMap.resolve('schedule', 1, 0)[0]).get('valueX')).toBe(100);
    // A lane with nothing booked is navigable and highlights nothing.
    expect(navMap.resolve('schedule', 2, 0)).toEqual([]);
  });

  it('resolves a treemap layer by [depth, index within depth]', () => {
    const series = fakeHierarchySeries('Population', {
      category: 'Root',
      children: [
        { category: 'Asia', children: [{ category: 'China', value: 1425 }] },
        { category: 'Africa', children: [{ category: 'Nigeria', value: 224 }] },
      ],
    });
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'tree', type: TraceType.TREEMAP, data: [] }],
      groups: { ...emptyGroups(), hierarchySeriesList: [series] },
    }]);

    // Row 0 is the top level below the (dropped) root.
    expect(itemOf(navMap.resolve('tree', 0, 1)[0]).get('category')).toBe('Africa');
    // Row 1 holds the leaves, in the order the walk reached them.
    expect(itemOf(navMap.resolve('tree', 1, 1)[0]).get('category')).toBe('Nigeria');
    // A node is a rectangle, which the overlay measures as it measures a column.
    expect(navMap.resolve('tree', 1, 1)[0].kind).toBe('column');
    expect(navMap.resolve('tree', 2, 0)).toEqual([]);
  });

  it('measures a sunburst node as a wedge, not as a rectangle', () => {
    // A treemap block and an icicle bar are rectangles; a sunburst node is a
    // `Slice`, which reports a degenerate box and has to be measured from its
    // radius and sweep instead. Getting this wrong outlines nothing at all.
    const series = fakeHierarchySeries('Population', {
      category: 'Root',
      children: [
        { category: 'Asia', children: [{ category: 'China', value: 1425 }] },
        { category: 'Africa', children: [{ category: 'Nigeria', value: 224 }] },
      ],
    }, 'Sunburst');
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'ring', type: TraceType.SUNBURST, data: [] }],
      groups: { ...emptyGroups(), hierarchySeriesList: [series] },
    }]);

    expect(itemOf(navMap.resolve('ring', 0, 1)[0]).get('category')).toBe('Africa');
    expect(itemOf(navMap.resolve('ring', 1, 1)[0]).get('category')).toBe('Nigeria');
    expect(navMap.resolve('ring', 1, 1)[0].kind).toBe('slice');
    expect(navMap.resolve('ring', 2, 0)).toEqual([]);
  });

  it('reaches a sunburst wedge on `slice` and on `graphics` alike', () => {
    // Which slot an am5hierarchy build hangs the wedge on cannot be checked
    // without the library, so both are probed -- and a `Slice` reports a
    // degenerate point, so the box has to come from its radius and sweep.
    const wedge = {
      globalBounds: () => ({ left: 100, top: 100, right: 100, bottom: 100 }),
      width: () => 0,
      height: () => 0,
      // 0..90 is the bottom-right quarter; y grows down.
      get: (key: string) => ({ radius: 50, startAngle: 0, arc: 90 } as Record<string, unknown>)[key],
    };
    const box = { left: 100, top: 100, width: 50, height: 50 };

    for (const slot of ['slice', 'graphics'] as const) {
      const series = fakeHierarchySeries('Population', {
        category: 'Root',
        children: [{ category: 'Asia', value: 3000, [slot]: wedge }],
      }, 'Sunburst');
      const navMap = buildNavigationMap([{
        chart: fakeChart({ series: [series] }),
        layers: [{ id: 'ring', type: TraceType.SUNBURST, data: [] }],
        groups: { ...emptyGroups(), hierarchySeriesList: [series] },
      }]);

      expect(dataItemToOverlayRect(navMap.resolve('ring', 0, 0)[0], null)).toEqual(box);
    }
  });

  it('resolves a gauge to its needle, from every position there is', () => {
    // `GaugeTrace` is a 1x1 grid whose position is always (0, 0), so there is
    // nothing to invert -- and the hand is a bullet on an AXIS, so it reaches
    // the overlay through a data item that answers `graphics` with it.
    const hand = fakeClockHand({ left: 40, top: 60, width: 12, height: 80 });
    const chart = fakeGaugeChart({ value: 73, hand });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'dial', type: TraceType.GAUGE, data: [] }],
      groups: emptyGroups(),
    }]);

    const [target] = navMap.resolve('dial', 0, 0);
    expect(target.kind).toBe('column');
    expect(itemOf(target).get('graphics')).toBe(hand);
    // The overlay reads the hand's own laid-out box, not the whole dial.
    expect(dataItemToOverlayRect(target, null))
      .toEqual({ left: 40, top: 60, width: 12, height: 80 });
  });

  it('clears rather than boxing the dial when the hand reports no geometry', () => {
    // A hand that answers with nothing measurable must draw nothing. An
    // outline around the whole gauge would say nothing about where the needle
    // is, which is the kind of confidently-uninformative mark to avoid.
    const chart = fakeGaugeChart({
      value: 73,
      hand: { className: 'ClockHand', get: () => undefined },
    });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'dial', type: TraceType.GAUGE, data: [] }],
      groups: emptyGroups(),
    }]);

    const [target] = navMap.resolve('dial', 0, 0);
    expect(target).toBeDefined();
    expect(dataItemToOverlayRect(target, null)).toBeNull();
  });

  it('resolves a diverging layer as it resolves a dodged one, one row per side', () => {
    const men = fakeBarSeries('Men', [
      { categoryX: '0-14', valueY: -1200 },
      { categoryX: '15-29', valueY: -1150 },
    ]);
    const women = fakeBarSeries('Women', [
      { categoryX: '0-14', valueY: 1140 },
      { categoryX: '15-29', valueY: 1100 },
    ]);
    const chart = fakeChart({ series: [men, women] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'pyramid', type: TraceType.DIVERGING, data: [] }],
      groups: { ...emptyGroups(), barSeriesList: [men, women] },
    }]);

    const target = navMap.resolve('pyramid', 1, 1);
    expect(target[0].series).toBe(women);
    expect(itemOf(target[0]).get('valueY')).toBe(1100);
    expect(target[0].kind).toBe('column');
  });

  it('resolves a dot layer to its bullets and a lollipop layer to its stems', () => {
    const dots = fakeDotSeries('Response time', [
      { categoryX: '/search', valueY: 412 },
      { categoryX: '/checkout', valueY: 318 },
    ]);
    const stems = fakeLollipopSeries('Life expectancy', [
      { categoryX: 'Norway', valueY: 84 },
      { categoryX: 'Japan', valueY: 81 },
    ]);
    const chart = fakeChart({ series: [dots, stems] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [
        { id: 'dots', type: TraceType.DOT, data: [] },
        { id: 'stems', type: TraceType.LOLLIPOP, data: [] },
      ],
      groups: { ...emptyGroups(), dotSeriesList: [dots], lollipopSeriesList: [stems] },
    }]);

    // A dot's mark is the bullet, so the overlay measures a point.
    const dot = navMap.resolve('dots', 0, 1);
    expect(dot[0].series).toBe(dots);
    expect(itemOf(dot[0]).get('valueY')).toBe(318);
    expect(dot[0].kind).toBe('point');

    // A stem is still a column, thin as it is.
    const stem = navMap.resolve('stems', 0, 0);
    expect(stem[0].series).toBe(stems);
    expect(stem[0].kind).toBe('column');
  });

  it('resolves a word cloud layer in weight order, not in declared order', () => {
    // The one layer whose navigation order is not the order it was declared
    // in: MAIDR walks the terms heaviest first, and the position it reports is
    // an index into THAT order.
    const series = fakeWordCloudSeries('Terms', [
      { category: 'neural', value: 128 },
      { category: 'unmeasured', value: null },
      { category: 'machine', value: 412 },
      { category: 'gradient', value: 57 },
    ]);
    const chart = fakeChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'cloud', type: TraceType.WORD_CLOUD, data: [] }],
      groups: { ...emptyGroups(), wordCloudSeriesList: [series] },
    }]);

    expect(itemOf(navMap.resolve('cloud', 0, 0)[0]).get('category')).toBe('machine');
    expect(itemOf(navMap.resolve('cloud', 0, 1)[0]).get('category')).toBe('neural');
    // The weightless term is skipped, exactly as the extraction skips it.
    expect(itemOf(navMap.resolve('cloud', 0, 2)[0]).get('category')).toBe('gradient');
    expect(navMap.resolve('cloud', 0, 3)).toEqual([]);
    // A term is a glyph, which the overlay measures as neither a box nor a wedge.
    expect(navMap.resolve('cloud', 0, 0)[0].kind).toBe('label');
  });

  it('resolves line layers to point targets by [row, col]', () => {
    const lineA = fakeLineSeries('L1', [
      { categoryX: '2020', valueY: 100 },
      { categoryX: '2021', valueY: 120 },
    ]);
    const lineB = fakeLineSeries('L2', [
      { categoryX: '2020', valueY: 50 },
      { categoryX: '2021', valueY: 60 },
    ]);
    const chart = fakeChart({ series: [lineA, lineB] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [lineLayer('lines')],
      groups: { ...emptyGroups(), lineSeriesList: [lineA, lineB] },
    }]);

    const targets = navMap.resolve('lines', 1, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].series).toBe(lineB);
    expect(itemOf(targets[0]).get('valueY')).toBe(60);
    expect(targets[0].kind).toBe('point');
    expect(navMap.chartFor('lines')).toBe(chart);
  });

  it('resolves a bump layer to the competitor whose place is being announced', () => {
    // A bump chart is drawn as lines and collected with them, so the position
    // addresses the same mark a line layer's does — the rank is what the trace
    // announces, not a different thing to point at.
    const ash = fakeRankSeries('Ash', [
      { categoryX: 'R1', valueY: 1 },
      { categoryX: 'R2', valueY: 2 },
    ]);
    const birch = fakeRankSeries('Birch', [
      { categoryX: 'R1', valueY: 2 },
      { categoryX: 'R2', valueY: 1 },
    ]);
    const chart = fakeChart({ series: [ash, birch] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'places', type: TraceType.BUMP, data: [] }],
      groups: { ...emptyGroups(), lineSeriesList: [ash, birch] },
    }]);

    const targets = navMap.resolve('places', 1, 1);
    expect(targets).toHaveLength(1);
    expect(targets[0].series).toBe(birch);
    expect(itemOf(targets[0]).get('valueY')).toBe(1);
    expect(targets[0].kind).toBe('point');
    expect(navMap.resolve('places', 2, 0)).toEqual([]);
  });
});

describe('buildNavigationMap (flow and network)', () => {
  /**
   * Five flows through six nodes, declared out of value order, each with the
   * band amCharts drew for it.
   *
   * `Electricity` is the node the whole of #904 turns on: it receives the
   * chart's widest ribbon (34) and sends two narrower ones, so a resolver
   * indexing anything other than what the trace published — the first flow
   * declared, the widest one touching, every one touching — lands somewhere
   * else. The same five flows the model-side test walks, so the two halves read
   * together.
   */
  const RIBBONS = [0, 1, 2, 3, 4].map(at => fakeRibbon({
    left: at * 10,
    top: 0,
    right: at * 10 + 6,
    bottom: 20,
  }));

  const FLOWS = [
    { sourceId: 'Coal', targetId: 'Losses', value: 8, link: RIBBONS[0] },
    { sourceId: 'Coal', targetId: 'Electricity', value: 34, link: RIBBONS[1] },
    { sourceId: 'Coal', targetId: 'Heat', value: 14, link: RIBBONS[2] },
    { sourceId: 'Electricity', targetId: 'Homes', value: 20, link: RIBBONS[3] },
    { sourceId: 'Electricity', targetId: 'Industry', value: 14, link: RIBBONS[4] },
  ];

  /**
   * A hub, its three neighbours, and a node linked only to itself.
   *
   * The cross-links are read off the rows, which is where a force-directed
   * graph keeps everything that is not the tree — and these rows ARE the whole
   * graph, since amCharts hands the walk one container root whose children are
   * therefore all top level.
   */
  const PEOPLE: FakeNode = {
    category: 'Root',
    children: [
      { category: 'Ada', row: { name: 'Ada', linkWith: ['Edsger', 'Grace', 'Alan'] } },
      { category: 'Grace', row: { name: 'Grace', linkWith: ['Alan'] } },
      { category: 'Alan', row: { name: 'Alan' } },
      { category: 'Edsger', row: { name: 'Edsger' } },
    ],
  };

  /** The layer, the map and the chart for one standalone series. */
  function panelFor(series: AmXYSeries): {
    navMap: ReturnType<typeof buildNavigationMap>;
    layer: MaidrLayer;
  } {
    const chart = fakeChart({ series: [series] });
    const layer = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];
    const navMap = buildNavigationMap([{
      chart,
      layers: [layer],
      groups: groupSeries(chart),
    }]);
    return { navMap, layer };
  }

  /** What the adapter outlines where the trace's cursor currently sits. */
  function outlined(
    navMap: ReturnType<typeof buildNavigationMap>,
    layer: MaidrLayer,
    trace: FlowTrace | NetworkTrace,
  ): NavTarget[] {
    return navMap.resolve(layer.id, -1, -1, trace.highlightedPointIndices);
  }

  it('outlines the one ribbon a sankey trace says it highlighted', () => {
    // The contract, end to end: the real `FlowTrace` walks to a node, publishes
    // the band it outlined as a position in the data this adapter emitted, and
    // the adapter inverts it against its own extraction walk. Nothing here
    // reconstructs the stage layering that put the cursor on Electricity.
    const { navMap, layer } = panelFor(fakeFlowSeries('Energy', FLOWS));
    const trace = TraceFactory.create(layer) as FlowTrace;
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Electricity');

    const targets = outlined(navMap, layer, trace);

    // Electricity touches three ribbons. One is outlined — the one the SVG path
    // would outline — and it is neither the first declared nor the widest.
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe('ribbon');
    expect(spriteOf(targets[0])).toBe(RIBBONS[3]);
  });

  it('measures the outlined ribbon as the box it reports', () => {
    const { navMap, layer } = panelFor(fakeFlowSeries('Energy', FLOWS));
    const trace = TraceFactory.create(layer) as FlowTrace;
    trace.moveOnce('FORWARD');

    const [target] = outlined(navMap, layer, trace);

    // Coal's widest outgoing flow is Coal-Electricity, drawn by ribbon 1.
    expect(dataItemToOverlayRect(target, null))
      .toEqual({ left: 10, top: 0, width: 6, height: 20 });
  });

  it('outlines a chord the same way, since it is the same weighted graph', () => {
    // A `Chord` is announced as its own type but drawn from the same links, so
    // it shares the bucket a sankey is collected into — and a bucket a type is
    // missing from is exactly how a highlight silently vanishes.
    const { navMap, layer } = panelFor(fakeFlowSeries('Trade', FLOWS, 'ChordDirected'));
    expect(layer.type).toBe(TraceType.CHORD);
    const trace = TraceFactory.create(layer) as FlowTrace;
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(spriteOf(outlined(navMap, layer, trace)[0])).toBe(RIBBONS[3]);
  });

  it('outlines a declared alluvial, which reaches the resolver another way', () => {
    // An alluvial has no amCharts class: it IS a sankey the author declared as
    // one, so `planDeclarations` takes the series out of the flow bucket and
    // into the declared queue. Same series, same ribbons, different route to
    // the same resolver — and the route is the part that would rot unnoticed.
    const series = fakeFlowSeries('Budget', FLOWS, 'Sankey', {
      userData: { maidr: { type: 'alluvial' } },
    });
    const { navMap, layer } = panelFor(series);
    expect(layer.type).toBe(TraceType.ALLUVIAL);
    const trace = TraceFactory.create(layer) as FlowTrace;
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(spriteOf(outlined(navMap, layer, trace)[0])).toBe(RIBBONS[3]);
  });

  it('outlines the links it can reach and clears on the ones it cannot', () => {
    // The sprite read is unverifiable without the library, so a build that
    // keeps no band answers nothing rather than reaching for a neighbouring
    // one. Asserted beside a link that does resolve, or the blank would prove
    // only that the resolver had not been registered at all.
    const { navMap, layer } = panelFor(fakeFlowSeries('Energy', [
      { sourceId: 'Coal', targetId: 'Electricity', value: 34, link: RIBBONS[1] },
      { sourceId: 'Electricity', targetId: 'Homes', value: 20 },
    ]));

    expect(spriteOf(navMap.resolve(layer.id, -1, -1, [0])[0])).toBe(RIBBONS[1]);
    expect(navMap.resolve(layer.id, -1, -1, [1])).toEqual([]);
  });

  it('clears rather than guessing when a flow carries no point indices', () => {
    // A consumer that has not learned about `pointIndices` sends the -1 pair
    // through, and a braille position for a flow layer names a stage rather
    // than a ribbon. Answering nothing keeps the honest blank #903 shipped.
    const { navMap, layer } = panelFor(fakeFlowSeries('Energy', FLOWS));

    expect(navMap.resolve(layer.id, -1, -1, [3])).toHaveLength(1);
    expect(navMap.resolve(layer.id, 0, 0)).toEqual([]);
    expect(navMap.resolve(layer.id, -1, -1)).toEqual([]);
  });

  it('clears when the drawn links and the layer have drifted apart', () => {
    // An index only means something if the ribbons and `layer.data` are the
    // same list. A layer built from a chart that has since changed would
    // otherwise outline a band picked at random — worse than no outline.
    const series = fakeFlowSeries('Energy', FLOWS);
    const chart = fakeChart({ series: [series] });
    const stale: MaidrLayer = {
      id: 'stale',
      type: TraceType.SANKEY,
      data: [{ source: 'Coal', target: 'Losses', value: 8 }],
    };
    const live = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];
    const navMap = buildNavigationMap([{
      chart,
      layers: [live, stale],
      groups: { ...groupSeries(chart), flowSeriesList: [series, series] },
    }]);

    expect(navMap.resolve(live.id, -1, -1, [3])).toHaveLength(1);
    expect(navMap.resolve('stale', -1, -1, [0])).toEqual([]);
  });

  it('outlines the line a network trace says it highlighted', () => {
    // The same inversion with the model's component walk in the place of the
    // stage layering — and one difference of amCharts': a force-directed
    // graph's links are not data items, so the payload's two node names are
    // matched against the lines the series drew. Those are declared here in
    // another order, and the matching one with its ends the other way round,
    // so a resolver pairing by ordinal or by direction resolves elsewhere.
    const drawn = [
      fakeHierarchyLink({ source: 'Grace', target: 'Alan' }),
      fakeHierarchyLink({ source: 'Ada', target: 'Alan' }),
      fakeHierarchyLink({ source: 'Grace', target: 'Ada' }),
      fakeHierarchyLink({ source: 'Ada', target: 'Edsger' }),
    ];
    const series = fakeForceDirectedSeries(
      'People',
      PEOPLE,
      { linkWithField: 'linkWith' },
      drawn,
    );
    const { navMap, layer } = panelFor(series);
    const trace = TraceFactory.create(layer) as NetworkTrace;
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }
    expect(state.text.main.value).toBe('Ada');

    const targets = outlined(navMap, layer, trace);

    // Ada is linked to three people; sorted by degree her first neighbour is
    // Grace, so one line is outlined and it is the Ada-Grace one.
    expect(targets).toHaveLength(1);
    expect(spriteOf(targets[0])).toBe(drawn[2]);
  });

  it('clears when the graph has changed under a network layer', () => {
    // The re-extraction is the network's alignment guard: names alone would
    // happily match an index against a layer built from a different graph, and
    // the outline would then be one the reader is not standing on.
    const drawn = [fakeHierarchyLink({ source: 'Ada', target: 'Grace' })];
    const series = fakeForceDirectedSeries(
      'People',
      PEOPLE,
      { linkWithField: 'linkWith' },
      drawn,
    );
    const chart = fakeChart({ series: [series] });
    const live = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];
    const stale: MaidrLayer = {
      id: 'stale',
      type: TraceType.NETWORK,
      data: [{ source: 'Ada', target: 'Grace' }],
    };
    const navMap = buildNavigationMap([{
      chart,
      layers: [live, stale],
      groups: { ...groupSeries(chart), networkSeriesList: [series, series] },
    }]);

    expect(spriteOf(navMap.resolve(live.id, -1, -1, [1])[0])).toBe(drawn[0]);
    expect(navMap.resolve('stale', -1, -1, [0])).toEqual([]);
  });

  it('clears on a pair the chart drew no line for', () => {
    // A build exposing no lines at all — or one short of the pair asked for —
    // leaves the overlay empty rather than outlining the nearest line it has.
    const drawn = [fakeHierarchyLink({ source: 'Ada', target: 'Edsger' })];
    const series = fakeForceDirectedSeries(
      'People',
      PEOPLE,
      { linkWithField: 'linkWith' },
      drawn,
    );
    const { navMap, layer } = panelFor(series);

    // Ada-Edsger is the first link the walk emits, and Ada-Grace the second.
    expect(spriteOf(navMap.resolve(layer.id, -1, -1, [0])[0])).toBe(drawn[0]);
    expect(navMap.resolve(layer.id, -1, -1, [1])).toEqual([]);
  });
});

describe('buildNavigationMap (choropleth)', () => {
  /**
   * Four states with real centroids, declared in an order that is neither the
   * order the map is walked in nor a rotation of it: `arrange` bands them by
   * latitude and reads each band west to east, so a resolver that had simply
   * kept declared order would be wrong at every position but one.
   */
  const STATES: Array<{ name: string; value: number; lon: number; lat: number }> = [
    { name: 'Washington', value: 12.1, lon: -120.5, lat: 47.4 },
    { name: 'Nevada', value: 38.9, lon: -116.6, lat: 39.3 },
    { name: 'Oregon', value: 16.4, lon: -120.6, lat: 43.9 },
    { name: 'Idaho', value: 21.7, lon: -114.6, lat: 44.4 },
  ];

  /** The polygons, kept so a resolved target can be identified by its box. */
  function polygons(): unknown[] {
    return STATES.map((_state, at) => fakeMapPolygon({
      box: { left: at * 10, top: 0, right: at * 10 + 8, bottom: 8 },
    }));
  }

  function mapSeries(shapes: unknown[]): AmXYSeries {
    return fakeMapPolygonSeries('Rate', STATES.map((state, at) => ({
      name: state.name,
      value: state.value,
      polygon: shapes[at],
      row: { longitude: state.lon, latitude: state.lat },
    })));
  }

  function navMapFor(series: AmXYSeries): {
    navMap: ReturnType<typeof buildNavigationMap>;
    layer: MaidrLayer;
  } {
    const chart = fakeMapChart({ series: [series] });
    const layer = fromXYChart(chart, fakeContainerEl()).subplots[0][0].layers[0];
    const navMap = buildNavigationMap([{
      chart,
      layers: [layer],
      groups: groupSeries(chart),
    }]);
    return { navMap, layer };
  }

  it('resolves every position to the region the trace names there', () => {
    // The contract test the mirror is not allowed to ship without. It asks the
    // REAL `ChoroplethTrace` which region each position announces and checks
    // the adapter outlines that one — so a change to `arrange` in the model
    // turns into a red build here rather than into a highlight that quietly
    // drifts one region east.
    const shapes = polygons();
    const { navMap, layer } = navMapFor(mapSeries(shapes));
    const trace = TraceFactory.create(layer) as ChoroplethTrace;
    const boxOf = new Map(STATES.map((state, at) => [state.name, at]));

    // Four regions band into a 2x2 grid: two bands of two.
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const state = trace.getStateAt(row, col);
        if (state.empty) {
          throw new Error(`Expected a populated state at ${row},${col}`);
        }
        const named = String(state.text.main.value);

        const [target] = navMap.resolve(layer.id, row, col);
        expect(target).toBeDefined();
        expect(target.kind).toBe('region');
        expect(itemOf(target).get('mapPolygon')).toBe(shapes[boxOf.get(named) as number]);
      }
    }
  });

  it('bands the map the way the trace does, rather than keeping declared order', () => {
    // Spelled out once, so the test above is readable as a contract rather
    // than as a tautology: four regions make two bands of two, south first,
    // and west to east inside each.
    const shapes = polygons();
    const { navMap, layer } = navMapFor(mapSeries(shapes));

    // The two southernmost are Nevada (39.3N) and Oregon (43.9N), read west to
    // east — so Oregon (-120.6) comes before Nevada (-116.6), which is neither
    // their declared order nor their order by latitude.
    expect(itemOf(navMap.resolve(layer.id, 0, 0)[0]).get('mapPolygon')).toBe(shapes[2]);
    expect(itemOf(navMap.resolve(layer.id, 0, 1)[0]).get('mapPolygon')).toBe(shapes[1]);
    // Northern band: Washington (-120.5) is west of Idaho (-114.6).
    expect(itemOf(navMap.resolve(layer.id, 1, 0)[0]).get('mapPolygon')).toBe(shapes[0]);
    expect(itemOf(navMap.resolve(layer.id, 1, 1)[0]).get('mapPolygon')).toBe(shapes[3]);
  });

  it('degenerates to declared order when the map placed no region', () => {
    // The likely common case, since the centroid read is unverified. With no
    // coordinates `arrange` returns one band in declared order, so the mirror
    // is the identity map — and the map is still navigable, still announced,
    // still outlined, just read as a region list.
    const shapes = polygons();
    const series = fakeMapPolygonSeries('Rate', STATES.map((state, at) => ({
      name: state.name,
      value: state.value,
      polygon: shapes[at],
    })));
    const { navMap, layer } = navMapFor(series);

    for (let col = 0; col < STATES.length; col++) {
      expect(itemOf(navMap.resolve(layer.id, 0, col)[0]).get('mapPolygon')).toBe(shapes[col]);
    }
  });

  it('outlines the polygon\'s reported box', () => {
    const shapes = polygons();
    const { navMap, layer } = navMapFor(mapSeries(shapes));

    const [target] = navMap.resolve(layer.id, 0, 0);
    expect(dataItemToOverlayRect(target, null))
      .toEqual({ left: 20, top: 0, width: 8, height: 8 });
  });

  it('clears rather than outlining a polygon that reports no box with area', () => {
    // An am5 `Graphics` painted through a draw callback can report a
    // degenerate point (the `Slice` problem of #774), and a region has no
    // radius or sweep to be measured from instead. A one-pixel mark at the
    // wrong place says less than nothing.
    const flat = fakeMapPolygon({ box: { left: 30, top: 30, right: 30, bottom: 30 } });
    const series = fakeMapPolygonSeries('Rate', [
      { name: 'Nevada', value: 38.9, polygon: flat },
    ]);
    const { navMap, layer } = navMapFor(series);

    const [target] = navMap.resolve(layer.id, 0, 0);
    expect(target).toBeDefined();
    expect(dataItemToOverlayRect(target, null)).toBeNull();
  });

  it('resolves nothing when the polygons and the announced regions disagree', () => {
    // The alignment guard. A layer whose data no longer matches the series it
    // was built from means the chart moved underneath the conversion; an empty
    // answer clears the overlay, which beats outlining a stale index.
    const shapes = polygons();
    const series = mapSeries(shapes);
    const chart = fakeMapChart({ series: [series] });
    const navMap = buildNavigationMap([{
      chart,
      layers: [{ id: 'map', type: TraceType.CHOROPLETH, data: [{ x: 'Nevada', y: 38.9 }] }],
      groups: groupSeries(chart),
    }]);

    expect(navMap.resolve('map', 0, 0)).toEqual([]);
  });
});

describe('groupSeries (choropleth)', () => {
  it('buckets a shaded polygon series and leaves the base geography out', () => {
    // The fourth edit every new type needs, and the one whose omission is
    // silent: audio and text would keep working while the highlight vanished.
    const shaded = fakeMapPolygonSeries('Rate', [{ name: 'Nevada', value: 38.9 }]);
    const base = fakeMapPolygonSeries('World', [{ name: 'Nevada', value: 38.9 }], {});

    const groups = groupSeries(fakeMapChart({ series: [base, shaded] }));

    expect(groups.choroplethSeriesList).toEqual([{ series: shaded }]);
    // And emphatically not read as a bar chart of its shapes, which is what
    // `classifySeriesKind`'s default would have made of either of them.
    expect(groups.barSeriesList).toEqual([]);
  });
});

describe('groupSeries', () => {
  it('buckets an am5flow series and a network by the marks they draw', () => {
    // `classifySeriesKind` answers `'bar'` for a class it does not know, so
    // before these classes were named a sankey landed in `barSeriesList` —
    // where it would have shifted every real bar layer's resolver index and
    // outlined the wrong column on a chart carrying both. And a series in no
    // bucket at all is how a type reads correctly with no highlight, which is
    // what these two shipped with until the traces published their ribbons.
    const sankey = fakeFlowSeries('Energy', [
      { sourceId: 'Coal', targetId: 'Electricity', value: 34 },
    ]);
    const network = fakeForceDirectedSeries('People', {
      category: 'Root',
      children: [{ category: 'Ada' }],
    });

    const groups = groupSeries(fakeChart({ series: [sankey, network] }));

    expect(groups.flowSeriesList).toEqual([sankey]);
    expect(groups.networkSeriesList).toEqual([network]);
    expect(groups.barSeriesList).toEqual([]);
  });

  it('buckets a sunburst with the trees it is one of', () => {
    // The fourth edit every new type needs, and the one whose omission is
    // silent: the layer would still be built, announced and navigated, and
    // only the highlight would vanish. `hierarchySeriesList` is what the
    // resolver indexes, so an unbucketed sunburst resolves to nothing.
    const series = fakeHierarchySeries('Population', {
      category: 'Root',
      children: [{ category: 'Asia', value: 3000 }],
    }, 'Sunburst');

    expect(groupSeries(fakeChart({ series: [series] })).hierarchySeriesList)
      .toEqual([series]);
  });
});
