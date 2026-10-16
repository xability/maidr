import type { VennPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeSeries } from './helpers';

/**
 * How the `venn` and `euler` series read their regions (#1415).
 *
 * Highcharts 13's `VennSeries.translate` names a region the author did not
 * name `point.options.name || sets.join('∩')`, after its layout has sorted
 * the sets in place, so the default name can list the sets in another order
 * than the one declared. Venn's `pointArrayMap` is `['value']` with no
 * `pointValKey`, so Highcharts never fills `point.y`, and a point without a
 * numeric `value` fails `VennPoint.isValid` and is not drawn.
 */

interface VennLayer {
  type: string;
  data: VennPoint[];
  selectors?: string;
}

/**
 * The layers a one-series venn chart produces.
 *
 * @param data - The series' points
 * @returns The layers
 */
function layersOf(data: unknown[]): VennLayer[] {
  const maidr = highchartsToMaidr(fakeChart({
    renderToId: 'venn',
    series: [fakeSeries({ index: 0, type: 'venn', name: 'Sports', data: data as never })],
  }));
  return (maidr?.subplots?.[0]?.[0]?.layers ?? []) as never;
}

describe('highcharts venn regions', () => {
  it('reads the other points when one declares no sets, without pairing selectors', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4 },
      { value: 2, name: 'stray' },
      { sets: ['B'], value: 3 },
    ]);

    expect(layer.type).toBe(TraceType.VENN);
    expect(layer.data).toEqual([
      { sets: ['A'], size: 4 },
      { sets: ['B'], size: 3 },
    ]);
    // Highcharts draws the regions in declared order; with one dropped, the
    // drawn elements no longer pair with the data.
    expect(layer.selectors).toBeUndefined();
  });

  it('pairs selectors when every point is a drawn region', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4 },
      { sets: ['B'], value: 3 },
      { sets: ['A', 'B'], value: 1 },
    ]);

    expect(layer.selectors).toBe('#venn .highcharts-series-group .highcharts-series-0 .highcharts-point');
  });

  it('does not pair selectors when a set of size 0 leaves it and its overlaps undrawn', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4 },
      { sets: ['B'], value: 0 },
      { sets: ['A', 'B'], value: 1 },
    ]);

    expect(layer.data).toHaveLength(3);
    expect(layer.selectors).toBeUndefined();
  });

  it('still pairs selectors when an overlap of two drawn sets is 0', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4 },
      { sets: ['B'], value: 3 },
      { sets: ['A', 'B'], value: 0 },
    ]);

    expect(layer.selectors).toBe('#venn .highcharts-series-group .highcharts-series-0 .highcharts-point');
  });

  it('drops a name that is only the sets joined by ∩, in any order or spacing', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4, name: 'A' },
      { sets: ['B'], value: 3, name: 'B' },
      { sets: ['C'], value: 3, name: 'C' },
      { sets: ['A', 'B'], value: 1, name: 'B∩A' },
      { sets: ['A', 'C'], value: 1, name: 'A ∩ C' },
      { sets: ['B', 'C'], value: 1, name: 'B∩C' },
    ]);

    expect(layer.data.map(p => p.label)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('keeps a name of the author\'s own, even one mentioning the sets', () => {
    const [layer] = layersOf([
      { sets: ['A'], value: 4, name: 'A' },
      { sets: ['B'], value: 3, name: 'B' },
      { sets: ['A', 'B'], value: 1, name: 'A and B' },
    ]);

    expect(layer.data[2]).toEqual({ sets: ['A', 'B'], size: 1, label: 'A and B' });
  });

  it('sizes a region by its value alone, never by a y Highcharts does not set', () => {
    // An author's `y` is copied onto the point, but Highcharts neither sizes
    // nor draws the region by it: with no `value` the point is not drawn.
    const [layer] = layersOf([
      { sets: ['A'], value: 4 },
      { sets: ['B'], y: 3 },
    ]);

    expect(layer.data).toEqual([
      { sets: ['A'], size: 4 },
      { sets: ['B'] },
    ]);
    expect(layer.selectors).toBeUndefined();
  });
});
