import type { SeriesGroups } from '@adapters/amcharts/navmap';
import type { AmXYChart, AmXYSeries } from '@adapters/amcharts/types';
import type { MaidrLayer } from '@type/grammar';
import { buildNavigationMap } from '@adapters/amcharts/navmap';
import { TraceType } from '@type/grammar';
import { fakeBarSeries, fakeChart, fakeLineSeries } from './helpers';

function emptyGroups(): SeriesGroups {
  return {
    barSeriesList: [],
    lineSeriesList: [],
    histogramSeries: [],
    heatmapSeries: [],
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
