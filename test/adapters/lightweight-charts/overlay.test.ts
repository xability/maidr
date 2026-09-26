import type { SeriesReading } from '@adapters/lightweight-charts/converters';
import type { LwcChart } from '@adapters/lightweight-charts/types';
import { readLightweightChart } from '@adapters/lightweight-charts/converters';
import { highlightRect, panePlotArea } from '@adapters/lightweight-charts/overlay';
import { describe, expect, it } from '@jest/globals';
import { fakeChart, fakeSeries } from './helpers';

/**
 * Times here are small numbers so the fake time scale (`x = time`) reads
 * plainly; labels do not matter to the geometry.
 */
function reading(chart: LwcChart, layerId: string): SeriesReading {
  const found = readLightweightChart(chart, { formatTime: String }).series.find(series => series.layerId === layerId);
  if (!found) {
    throw new Error(`no layer ${layerId}`);
  }
  return found;
}

describe('panePlotArea', () => {
  it('starts right of the left price scale and below the panes above', () => {
    const chart = fakeChart(
      [{ series: [] }, { series: [] }],
      { leftScaleWidth: 40, plotWidth: 480 },
    );

    expect(panePlotArea(chart, 1)).toEqual({ left: 40, top: 200, right: 520, bottom: 400 });
  });

  it('knows no area for a pane that is not there', () => {
    expect(panePlotArea(fakeChart([{ series: [] }]), 3)).toBeNull();
  });
});

describe('highlightRect', () => {
  it('spans a candle from its high to its low, as wide as most of a bar', () => {
    const candles = fakeSeries('Candlestick', [{ time: 100, open: 10, high: 50, low: 20, close: 30 }], {}, 100);
    const chart = fakeChart([{ series: [candles] }], { leftScaleWidth: 40, barSpacing: 20 });
    const series = reading(chart, 'pane0-series0');

    // x = 40 + 100; high at y = 100 - 50, low at 100 - 20; width 0.8 * 20.
    expect(highlightRect(chart, series, series.items[0])).toEqual({ left: 132, top: 50, width: 16, height: 30 });
  });

  it('draws a histogram bar from its value down to its base, clipped to its pane', () => {
    const volume = fakeSeries('Histogram', [{ time: 100, value: 150 }], {}, 300, 1);
    const chart = fakeChart([{ series: [] }, { series: [volume] }], { barSpacing: 10 });
    const series = reading(chart, 'pane1-series0');

    // The value is at y = 150 in the pane (350 in the chart) and the base at
    // 300 in the pane, which runs past the pane's bottom at 400.
    expect(highlightRect(chart, series, series.items[0])).toEqual({ left: 96, top: 350, width: 8, height: 50 });
  });

  it('draws a box around a line point', () => {
    const line = fakeSeries('Line', [{ time: 100, value: 150 }]);
    const chart = fakeChart([{ series: [line] }]);
    const series = reading(chart, 'pane0-series0');

    expect(highlightRect(chart, series, series.items[0])).toEqual({ left: 93, top: 143, width: 14, height: 14 });
  });

  it('gives no box for a bar scrolled out of view', () => {
    const line = fakeSeries('Line', [{ time: 200, value: 1 }]);
    const chart = fakeChart([{ series: [line] }], { visible: time => time !== 200 });
    const series = reading(chart, 'pane0-series0');

    expect(highlightRect(chart, series, series.items[0])).toBeNull();
  });

  it('places the box by the pane size, which stays when the time axis is hidden', () => {
    const line = fakeSeries('Line', [{ time: 100, value: 150 }]);
    const chart = fakeChart([{ series: [line] }]);
    chart.timeScale = () => ({ ...fakeChart([]).timeScale(), width: () => 0 });
    const series = reading(chart, 'pane0-series0');

    expect(highlightRect(chart, series, series.items[0])).toEqual({ left: 93, top: 143, width: 14, height: 14 });
  });

  it('gives no box for a bar past the edge of the plot', () => {
    const line = fakeSeries('Line', [{ time: 900, value: 1 }]);
    const chart = fakeChart([{ series: [line] }], { plotWidth: 500 });
    const series = reading(chart, 'pane0-series0');

    expect(highlightRect(chart, series, series.items[0])).toBeNull();
  });
});
