import { computeChartGrid, readPlotBounds } from '@adapters/amcharts/geometry';
import { fakeChart } from './helpers';

describe('readPlotBounds', () => {
  it('reads globalBounds from the plot container', () => {
    const chart = fakeChart({ bounds: { left: 10, top: 20, right: 300, bottom: 200 } });
    expect(readPlotBounds(chart)).toEqual({ left: 10, top: 20, right: 300, bottom: 200 });
  });

  it('returns null without a plot container', () => {
    expect(readPlotBounds(fakeChart())).toBeNull();
  });
});

describe('computeChartGrid', () => {
  it('returns a single row for zero or one chart', () => {
    const chart = fakeChart();
    expect(computeChartGrid([])).toEqual([[]]);
    expect(computeChartGrid([chart])).toEqual([[chart]]);
  });

  it('stacks vertically arranged charts into separate rows', () => {
    const top = fakeChart({ bounds: { left: 0, top: 0, right: 600, bottom: 180 } });
    const bottom = fakeChart({ bounds: { left: 0, top: 200, right: 600, bottom: 380 } });
    expect(computeChartGrid([bottom, top])).toEqual([[top], [bottom]]);
  });

  it('groups charts with nearly equal tops into one row, sorted by left', () => {
    const left = fakeChart({ bounds: { left: 0, top: 0, right: 280, bottom: 300 } });
    const right = fakeChart({ bounds: { left: 320, top: 12, right: 600, bottom: 312 } });
    expect(computeChartGrid([right, left])).toEqual([[left, right]]);
  });

  it('falls back to one row in insertion order when geometry is missing', () => {
    const withBounds = fakeChart({ bounds: { left: 0, top: 0, right: 600, bottom: 180 } });
    const withoutBounds = fakeChart();
    expect(computeChartGrid([withBounds, withoutBounds])).toEqual([[withBounds, withoutBounds]]);
  });

  it('falls back when a chart reports zero height (pre-layout)', () => {
    const laidOut = fakeChart({ bounds: { left: 0, top: 0, right: 600, bottom: 180 } });
    const collapsed = fakeChart({ bounds: { left: 0, top: 0, right: 600, bottom: 0 } });
    expect(computeChartGrid([laidOut, collapsed])).toEqual([[laidOut, collapsed]]);
  });
});
