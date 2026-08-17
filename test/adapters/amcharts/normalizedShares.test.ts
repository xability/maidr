/**
 * An amCharts 100% stack carries shares, not raw values (#967).
 *
 * `valueYShow: 'valueYTotalPercent'` is amCharts' instruction to itself to
 * draw each column as a percent of its total; the data items keep the raw
 * value. `detectStackMode` already reads that setting to pick
 * `TraceType.NORMALIZED` — but the core divides nothing itself, so the layer
 * was announced with the counts across a chart whose columns are all the same
 * height.
 *
 * Third instance of the same defect, after Recharts (#963) and Vega-Lite
 * (#965); all three now share `toCategoryShares`/`toSegmentedShares`.
 */
import type { SegmentedPoint } from '@type/grammar';
import { fromXYChart } from '@adapters/amcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeContainerEl, fakeSeries } from './helpers';

/** Counts whose shares differ from them, so the two cannot be confused. */
const A = [1, 300];
const B = [1, 100];

/**
 * A stacked column series, optionally the percent-of-total kind.
 * @param name - The series name, which becomes the band's `z`
 * @param values - One value per category
 * @param percent - Whether amCharts was told to draw percent of total
 * @returns The fake series
 */
function stackedSeries(
  name: string,
  values: number[],
  percent: boolean,
): ReturnType<typeof fakeSeries> {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: {
      categoryXField: 'category',
      stacked: true,
      ...(percent ? { valueYShow: 'valueYTotalPercent' } : {}),
    },
    data: [
      { categoryX: 'Q1', valueY: values[0] },
      { categoryX: 'Q2', valueY: values[1] },
    ],
  });
}

/**
 * The single layer a two-series stacked chart converts to.
 * @param percent - Whether the stack is a percent-of-total one
 * @returns The emitted layer
 */
function layerFor(percent: boolean): ReturnType<typeof fromXYChart>['subplots'][0][0]['layers'][0] {
  const chart = fakeChart({
    series: [stackedSeries('A', A, percent), stackedSeries('B', B, percent)],
  });
  return fromXYChart(chart, fakeContainerEl('panel')).subplots[0][0].layers[0];
}

describe('an amcharts 100% stack', () => {
  it('is announced as a normalized layer', () => {
    expect(layerFor(true).type).toBe(TraceType.NORMALIZED);
  });

  it('divides each category by its own total', () => {
    // Q1 is 50/50 and Q2 is 75/25. Before the fix these were 1, 300, 1, 100.
    const [first, second] = layerFor(true).data as SegmentedPoint[][];

    expect(first.map(point => point.y)).toEqual([50, 75]);
    expect(second.map(point => point.y)).toEqual([50, 25]);
  });

  it('makes every category sum to 100', () => {
    const bands = layerFor(true).data as SegmentedPoint[][];

    const totals = bands[0].map(
      (_, index) => bands.reduce((sum, band) => sum + Number(band[index].y), 0),
    );
    expect(totals).toEqual([100, 100]);
  });

  it('keeps each band named after its own series', () => {
    const [first, second] = layerFor(true).data as SegmentedPoint[][];

    expect(first[0].z).toBe('A');
    expect(second[0].z).toBe('B');
  });

  it('keeps the categories where they were', () => {
    const [first] = layerFor(true).data as SegmentedPoint[][];

    expect(first.map(point => point.x)).toEqual(['Q1', 'Q2']);
  });
});

describe('an ordinary amcharts stack is untouched', () => {
  it('stays a stacked layer carrying its counts', () => {
    const layer = layerFor(false);
    const [first, second] = layer.data as SegmentedPoint[][];

    expect(layer.type).toBe(TraceType.STACKED);
    expect(first.map(point => point.y)).toEqual([1, 300]);
    expect(second.map(point => point.y)).toEqual([1, 100]);
  });
});
