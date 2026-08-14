import type { SeriesGroups } from '@adapters/amcharts/navmap';
import type { AmXYChart, AmXYSeries } from '@adapters/amcharts/types';
import type { MaidrLayer } from '@type/grammar';
import { buildNavigationMap } from '@adapters/amcharts/navmap';
import { TraceType } from '@type/grammar';
import {
  fakeAreaSeries,
  fakeBarSeries,
  fakeChart,
  fakeDotSeries,
  fakeFloatingColumnSeries,
  fakeFunnelSeries,
  fakeGanttSeries,
  fakeHierarchySeries,
  fakeLineSeries,
  fakeLollipopSeries,
  fakePieChart,
  fakePieSeries,
  fakePolarSeries,
  fakeRadarSeries,
  fakeSlicedChart,
  fakeWordCloudSeries,
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
    dumbbellSeriesList: [],
    ganttSeriesList: [],
    hierarchySeriesList: [],
    wordCloudSeriesList: [],
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
    expect(targetsA[0].dataItem.get('valueY')).toBe(76);
    expect(targetsA[0].kind).toBe('column');

    const targetsB = navMap.resolve('layer-b', 0, 0);
    expect(targetsB).toHaveLength(1);
    expect(targetsB[0].series).toBe(seriesB);
    expect(targetsB[0].dataItem.get('valueY')).toBe(10);
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
    expect(targets[0].dataItem.get('categoryX')).toBe('C');
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
    expect(targets[0].dataItem.get('category')).toBe('Cherries');
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
    expect(targets[0].dataItem.get('valueY')).toBe(14);
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
    expect(spoke[0].dataItem.get('valueY')).toBe(4);
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
    expect(targets[0].dataItem.get('category')).toBe('Purchased');
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
    expect(targets[0].dataItem.get('categoryX')).toBe('Sales');
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
    expect(start[0].dataItem.get('categoryX')).toBe('Latvia');
    expect(end[0].dataItem).toBe(start[0].dataItem);
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
    expect(second[0].dataItem.get('openValueX')).toBe(60);
    expect(second[0].kind).toBe('column');

    expect(navMap.resolve('schedule', 1, 0)[0].dataItem.get('valueX')).toBe(100);
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
    expect(navMap.resolve('tree', 0, 1)[0].dataItem.get('category')).toBe('Africa');
    // Row 1 holds the leaves, in the order the walk reached them.
    expect(navMap.resolve('tree', 1, 1)[0].dataItem.get('category')).toBe('Nigeria');
    // A node is a rectangle, which the overlay measures as it measures a column.
    expect(navMap.resolve('tree', 1, 1)[0].kind).toBe('column');
    expect(navMap.resolve('tree', 2, 0)).toEqual([]);
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
    expect(target[0].dataItem.get('valueY')).toBe(1100);
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
    expect(dot[0].dataItem.get('valueY')).toBe(318);
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

    expect(navMap.resolve('cloud', 0, 0)[0].dataItem.get('category')).toBe('machine');
    expect(navMap.resolve('cloud', 0, 1)[0].dataItem.get('category')).toBe('neural');
    // The weightless term is skipped, exactly as the extraction skips it.
    expect(navMap.resolve('cloud', 0, 2)[0].dataItem.get('category')).toBe('gradient');
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
    expect(targets[0].dataItem.get('valueY')).toBe(60);
    expect(targets[0].kind).toBe('point');
    expect(navMap.chartFor('lines')).toBe(chart);
  });
});
