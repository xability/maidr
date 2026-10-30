import type { HighchartsPoint } from '@adapters/highcharts/types';
import type { BarPoint, PiePoint, WordCloudPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { fakeChart, fakeSeries } from './helpers';

/**
 * Pie slices, funnel stages and word-cloud terms were announced by their index
 * ("Label is 0", "Stage is 1", "Term is 2") rather than by their names.
 *
 * Highcharts 13 sets `point.category` on every point it builds, axis or not:
 * `this.category = series.xAxis?.categories?.[this.x] ?? this.x`. A pie or a
 * funnel has no x axis and a word cloud's has no categories, so the category
 * is the point's index -- and the adapter took it before it ever reached
 * `point.name`. These points are built the way Highcharts 13 builds them,
 * category included.
 */

/**
 * The category Highcharts 13 gives a point with no category axis: its index.
 * The adapter's structural type declares a string, which is what a category
 * axis puts there; this is the other case.
 *
 * @param index - The point's index
 * @returns The index, typed as the field is
 */
function indexCategory(index: number): string {
  return index as unknown as string;
}

/**
 * Points as Highcharts 13 builds them from named data.
 *
 * @param named - Each point's name and magnitude
 * @returns The points, each carrying its index as its category
 */
function asBuilt(named: { name: string; y: number }[]): Partial<HighchartsPoint>[] {
  return named.map((point, i) => ({ x: i, category: indexCategory(i), ...point }));
}

/**
 * The data of the one layer a single-series chart produces.
 *
 * @param type - The series type
 * @param data - The series' points
 * @returns The layer's data
 */
function layerData(type: string, data: Partial<HighchartsPoint>[]): unknown {
  const chart = fakeChart({
    type,
    series: [fakeSeries({ index: 0, type, data })],
  });
  return highchartsToMaidr(chart).subplots[0][0].layers[0].data;
}

describe('highcharts points that sit on no category axis', () => {
  it('names each pie slice by its name', () => {
    const data = layerData('pie', asBuilt([
      { name: 'Apples', y: 30 },
      { name: 'Bananas', y: 50 },
      { name: 'Cherries', y: 20 },
    ])) as PiePoint[];

    expect(data.map(slice => slice.x)).toEqual(['Apples', 'Bananas', 'Cherries']);
  });

  it('names each funnel stage by its name', () => {
    const data = layerData('funnel', asBuilt([
      { name: 'Website visits', y: 15654 },
      { name: 'Downloads', y: 4064 },
    ])) as BarPoint[];

    expect(data.map(stage => stage.x)).toEqual(['Website visits', 'Downloads']);
  });

  it('names each word cloud term by its name', () => {
    const data = layerData('wordcloud', asBuilt([
      { name: 'accessibility', y: 42 },
      { name: 'sonification', y: 31 },
    ])) as WordCloudPoint[];

    expect(data.map(term => term.x)).toEqual(['accessibility', 'sonification']);
  });

  it('still numbers a slice that has no name', () => {
    // `data: [8, 3]` leaves the points nameless, and the index is then all
    // there is to tell them apart.
    const data = layerData('pie', [
      { x: 0, y: 8, category: indexCategory(0) },
      { x: 1, y: 3, category: indexCategory(1) },
    ]) as PiePoint[];

    expect(data.map(slice => slice.x)).toEqual([0, 1]);
  });
});
