import type { VennPoint } from '@type/grammar';
import { fromAmCharts } from '@adapters/amcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { fakeContainer, fakeRoot, fakeSeries } from './helpers';

/**
 * amCharts Venn regions the setting alone does not describe (#1418).
 *
 * An `am5venn.Venn` data item names the sets it overlaps in its
 * `intersections` setting, which amCharts fills from the data field the
 * author mapped -- and an author who kept the overlap under `sets` in the
 * raw row leaves the setting empty. A data item with no category is a row
 * amCharts could not name, and so draws no region.
 */

/**
 * Reads a Venn series of the given data items, each with its raw row.
 *
 * @param data - What each data item's `get` answers
 * @param rows - Each data item's `dataContext`, when it differs from `data`
 * @returns The regions of the one Venn layer
 */
function regionsOf(data: Record<string, unknown>[], rows?: Record<string, unknown>[]): VennPoint[] {
  const venn = fakeSeries({ className: 'Venn', name: 'Venn', data, rows });
  const maidr = fromAmCharts(fakeRoot([fakeContainer([venn])]) as never);
  const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
  expect(layers.map(layer => layer.type)).toEqual([TraceType.VENN]);
  return layers[0].data as VennPoint[];
}

describe('an amCharts Venn region\'s sets', () => {
  it('come from the row\'s own sets when the data item names no intersections', () => {
    const data = [
      { category: 'A', value: 10 },
      { category: 'B', value: 8 },
      { category: 'Both', value: 3 },
    ];
    const rows = [data[0], data[1], { category: 'Both', value: 3, sets: ['A', 'B'] }];

    const regions = regionsOf(data, rows);

    expect(regions).toEqual([
      { sets: ['A'], size: 10 },
      { sets: ['B'], size: 8 },
      { sets: ['A', 'B'], size: 3, label: 'Both' },
    ]);
  });

  it('come from the intersections setting first, when both are there', () => {
    const data = [{ category: 'Both', value: 3, intersections: ['A', 'B'] }];
    const rows = [{ category: 'Both', value: 3, sets: ['X', 'Y'] }];

    const regions = regionsOf(data, rows);

    expect(regions).toEqual([{ sets: ['A', 'B'], size: 3, label: 'Both' }]);
  });

  it('fall back to the category when the row\'s sets are empty, making the region a set', () => {
    const data = [{ category: 'A', value: 10 }];
    const rows = [{ category: 'A', value: 10, sets: [] }];

    const regions = regionsOf(data, rows);

    expect(regions).toEqual([{ sets: ['A'], size: 10 }]);
  });
});

describe('an amCharts Venn data item with no category', () => {
  it('is skipped, and the regions around it are read as before', () => {
    const data = [
      { category: 'A', value: 10 },
      { value: 4 },
      { category: null, value: 5, intersections: ['A', 'B'] },
      { category: 'B', value: 8 },
    ];

    const regions = regionsOf(data);

    expect(regions).toEqual([
      { sets: ['A'], size: 10 },
      { sets: ['B'], size: 8 },
    ]);
  });
});
