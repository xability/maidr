/**
 * A Vega-Lite facet panel is named under the title its header is drawn with.
 *
 * Vega-Lite titles a facet's header with the facet channel's title, and the
 * field's own name only when none is written. The converter named every
 * panel by the field, so the barley example, whose panels are drawn under
 * "Site", announced them as "site: Crookston", and a field such as `loc_id`
 * would have been read out as written.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = [
  { site: 'A', year: 1931, variety: 'v1', yield: 10 },
  { site: 'B', year: 1931, variety: 'v1', yield: 12 },
  { site: 'A', year: 1932, variety: 'v1', yield: 14 },
  { site: 'B', year: 1932, variety: 'v1', yield: 16 },
];

const BARS = {
  mark: 'bar',
  encoding: {
    x: { field: 'variety', type: 'nominal' },
    y: { field: 'yield', type: 'quantitative' },
  },
};

/**
 * A faceted bar chart over the rows.
 * @param facet - The facet operator
 * @returns The spec
 */
function faceted(facet: unknown): VegaLiteSpec {
  return { data: { values: ROWS }, facet, spec: BARS } as unknown as VegaLiteSpec;
}

/**
 * Every panel's name, row by row.
 * @param maidr - The converted chart
 * @returns The names
 */
function names(maidr: Maidr): Array<Array<string | undefined>> {
  return maidr.subplots.map(row => row.map(subplot => subplot.layers[0]?.title));
}

describe('a vega-lite facet whose channel is titled', () => {
  it('names a wrapped facet\'s panels under the title', () => {
    const maidr = vegaLiteToMaidr(faceted({ field: 'site', type: 'nominal', title: 'Site' }));

    // Before the fix: 'site: A', 'site: B'.
    expect(names(maidr)).toEqual([['Site: A', 'Site: B']]);
  });

  it('names a row and column facet\'s panels under both titles', () => {
    const maidr = vegaLiteToMaidr(faceted({
      row: { field: 'year', type: 'ordinal', title: 'Year' },
      column: { field: 'site', type: 'nominal', title: 'Site' },
    }));

    expect(names(maidr)).toEqual([
      ['Year: 1931, Site: A', 'Year: 1931, Site: B'],
      ['Year: 1932, Site: A', 'Year: 1932, Site: B'],
    ]);
  });

  it('takes the header\'s title over the channel\'s', () => {
    const maidr = vegaLiteToMaidr(faceted({
      column: { field: 'site', type: 'nominal', title: 'Site', header: { title: 'Location' } },
    }));

    expect(names(maidr)).toEqual([['Location: A', 'Location: B']]);
  });

  it('names a panel by its value alone when the header is drawn without a title', () => {
    const maidr = vegaLiteToMaidr(faceted({ column: { field: 'site', type: 'nominal', title: null } }));

    expect(names(maidr)).toEqual([['A', 'B']]);
  });
});

describe('a vega-lite facet whose channel is not titled', () => {
  it('names the panels under the field, as the header does', () => {
    const maidr = vegaLiteToMaidr(faceted({ column: { field: 'site', type: 'nominal' } }));

    expect(names(maidr)).toEqual([['site: A', 'site: B']]);
  });
});
