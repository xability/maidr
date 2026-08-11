import type { AmBounds } from '@adapters/amcharts/types';
import { computeChartGrid, readPlotBounds, readSliceBounds } from '@adapters/amcharts/geometry';
import { fakeBarSeries, fakeChart, fakePieChart, fakePieSeries } from './helpers';

/** A wedge graphic reporting the global box the overlay reads geometry from. */
function fakeSlice(bounds: AmBounds): unknown {
  return { globalBounds: () => bounds };
}

describe('readPlotBounds', () => {
  it('reads globalBounds from the plot container', () => {
    const chart = fakeChart({ bounds: { left: 10, top: 20, right: 300, bottom: 200 } });
    expect(readPlotBounds(chart)).toEqual({ left: 10, top: 20, right: 300, bottom: 200 });
  });

  it('returns null without a plot container', () => {
    expect(readPlotBounds(fakeChart())).toBeNull();
  });
});

describe('readSliceBounds', () => {
  it('unions the wedge boxes into the rectangle the pie occupies', () => {
    // A PieChart has no plotContainer, so this is the only panel rectangle
    // available — without it the binder suppresses the highlight of every pie
    // sharing a root with another panel.
    const chart = fakePieChart({
      series: [fakePieSeries('Fruit', [
        { category: 'Apples', value: 30, slice: fakeSlice({ left: 40, top: 30, right: 140, bottom: 120 }) },
        { category: 'Bananas', value: 50, slice: fakeSlice({ left: 90, top: 60, right: 180, bottom: 170 }) },
      ])],
    });

    expect(readPlotBounds(chart)).toBeNull();
    expect(readSliceBounds(chart)).toEqual({ left: 40, top: 30, right: 180, bottom: 170 });
  });

  it('normalizes a wedge box reported with inverted edges', () => {
    const chart = fakePieChart({
      series: [fakePieSeries('Fruit', [
        { category: 'Apples', value: 30, slice: fakeSlice({ left: 140, top: 120, right: 40, bottom: 30 }) },
      ])],
    });

    expect(readSliceBounds(chart)).toEqual({ left: 40, top: 30, right: 140, bottom: 120 });
  });

  it('skips a wedge with no readable geometry (pre-layout)', () => {
    const chart = fakePieChart({
      series: [fakePieSeries('Fruit', [
        { category: 'Apples', value: 30 },
        { category: 'Bananas', value: 50, slice: fakeSlice({ left: 10, top: 10, right: 60, bottom: 70 }) },
      ])],
    });

    expect(readSliceBounds(chart)).toEqual({ left: 10, top: 10, right: 60, bottom: 70 });
  });

  it('returns null for a chart whose data items carry no wedge at all', () => {
    // An XY panel, which is what keeps this fallback pie-only: one with no
    // readable plot area still reports nothing, so the binder keeps suppressing
    // a highlight it cannot clip to the right panel.
    const chart = fakeChart({
      series: [fakeBarSeries('Sales', [{ categoryX: 'Jan', valueY: 10 }])],
    });

    expect(readSliceBounds(chart)).toBeNull();
  });

  it('returns null when a wedge reports a non-finite box', () => {
    const chart = fakePieChart({
      series: [fakePieSeries('Fruit', [
        { category: 'Apples', value: 30, slice: fakeSlice({ left: Number.NaN, top: 0, right: 10, bottom: 10 }) },
      ])],
    });

    expect(readSliceBounds(chart)).toBeNull();
  });
});

describe('computeChartGrid', () => {
  it('returns a single row for zero or one chart', () => {
    const chart = fakeChart();
    expect(computeChartGrid([])).toEqual([[]]);
    expect(computeChartGrid([chart])).toEqual([[chart]]);
  });

  it('stacks vertically arranged charts into separate rows, bottom row first', () => {
    const top = fakeChart({ bounds: { left: 0, top: 0, right: 600, bottom: 180 } });
    const bottom = fakeChart({ bounds: { left: 0, top: 200, right: 600, bottom: 380 } });
    // Bottom-first (matplotlib convention): the core's MovableGrid maps UPWARD
    // to row+1 and canvas charts get no DOM-based vertical inversion, so data
    // row 0 must be the visually lowest panel for ArrowUp to move visually up.
    expect(computeChartGrid([bottom, top])).toEqual([[bottom], [top]]);
  });

  it('orders a 2x2 grid bottom row first, left-to-right within rows', () => {
    const topLeft = fakeChart({ bounds: { left: 0, top: 0, right: 280, bottom: 180 } });
    const topRight = fakeChart({ bounds: { left: 320, top: 0, right: 600, bottom: 180 } });
    const bottomLeft = fakeChart({ bounds: { left: 0, top: 220, right: 280, bottom: 400 } });
    const bottomRight = fakeChart({ bounds: { left: 320, top: 220, right: 600, bottom: 400 } });
    expect(computeChartGrid([topRight, bottomLeft, topLeft, bottomRight])).toEqual([
      [bottomLeft, bottomRight],
      [topLeft, topRight],
    ]);
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
