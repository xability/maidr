/**
 * A Vega-Lite title is read as it is drawn, whatever form it is written in.
 *
 * Vega-Lite draws a title written as an array as several lines, one under
 * the other, and draws a title only when it has text: `Model.assembleTitle`
 * skips one whose `text` is empty, subtitle and all, and a layered spec then
 * draws the first title among its layers. The converter read a title only as
 * a string or a `{ text }` string, so a multi-line chart title was announced
 * as 'Vega-Lite Chart', one written `{ text: [...] }` passed its array on as
 * the title, a multi-line panel or header title was dropped, and an empty
 * title stopped the search for the drawn one while its subtitle, never
 * drawn, was announced.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = [
  { site: 'A', category: 'x', value: 1 },
  { site: 'B', category: 'y', value: 2 },
];

/**
 * A bar chart over the rows.
 * @param title - The chart's title, when it has one
 * @returns The spec
 */
function bars(title?: unknown): Record<string, unknown> {
  return {
    data: { values: ROWS },
    mark: 'bar',
    encoding: {
      x: { field: 'category', type: 'nominal' },
      y: { field: 'value', type: 'quantitative' },
    },
    ...(title === undefined ? {} : { title }),
  };
}

/**
 * The title and subtitle a spec is announced with.
 * @param spec - The spec
 * @returns The two
 */
function titles(spec: unknown): Pick<Maidr, 'title' | 'subtitle'> {
  const { title, subtitle } = vegaLiteToMaidr(spec as VegaLiteSpec);
  return { title, subtitle };
}

/**
 * Every panel's name, row by row.
 * @param spec - The spec
 * @returns The names
 */
function panels(spec: unknown): Array<Array<string | undefined>> {
  return vegaLiteToMaidr(spec as VegaLiteSpec).subplots.map(row => row.map(subplot => subplot.layers[0]?.title));
}

describe('a vega-lite title of several lines', () => {
  it('reads a chart title with its lines joined by a space', () => {
    // Before the fix: 'Vega-Lite Chart'.
    expect(titles(bars(['Yield by site', '1931 and 1932'])).title).toBe('Yield by site 1931 and 1932');
  });

  it('reads a title object\'s lines, and its subtitle\'s, the same way', () => {
    // Before the fix the title was the array itself.
    expect(titles(bars({ text: ['Yield', 'by site'], subtitle: ['Barley', 'trials'] }))).toEqual({
      title: 'Yield by site',
      subtitle: 'Barley trials',
    });
  });

  it('names a concat panel by its lines', () => {
    // Before the fix the first panel had no name of its own.
    expect(panels({ hconcat: [bars(['Panel', 'one']), bars('Panel two')] })).toEqual([['Panel one', 'Panel two']]);
  });

  it('names a line by its layer\'s title of several lines', () => {
    const line = (name: string[], offset: number): Record<string, unknown> => ({
      title: name,
      data: { values: [1, 2, 3].map(x => ({ x, y: x + offset })) },
      mark: 'line',
      encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } },
    });

    const maidr = vegaLiteToMaidr({ layer: [line(['Model', 'A'], 0), line(['Model', 'B'], 1)] } as unknown as VegaLiteSpec);

    const [layer] = maidr.subplots[0][0].layers;
    expect((layer.data as Array<Array<{ z?: string }>>).map(points => points[0].z)).toEqual(['Model A', 'Model B']);
  });

  it('names a facet panel under a header title of several lines', () => {
    const spec = {
      data: { values: ROWS },
      facet: { column: { field: 'site', type: 'nominal', header: { title: ['Trial', 'site'] } } },
      spec: { mark: 'bar', encoding: { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' } } },
    };

    // Before the fix: 'site: A', 'site: B'.
    expect(panels(spec)).toEqual([['Trial site: A', 'Trial site: B']]);
  });
});

describe('a vega-lite title with no text', () => {
  it('is not drawn, so a layer\'s title is read in its place and the subtitle is not', () => {
    const spec = {
      title: { text: '', subtitle: 'Never drawn' },
      layer: [bars('Drawn title')],
    };

    // Before the fix: 'Vega-Lite Chart', with the subtitle 'Never drawn'.
    expect(titles(spec)).toEqual({ title: 'Drawn title', subtitle: undefined });
  });

  it('leaves a chart with no other title untitled, and its subtitle unread', () => {
    expect(titles(bars({ text: '', subtitle: 'Never drawn' }))).toEqual({
      title: 'Vega-Lite Chart',
      subtitle: undefined,
    });
  });

  it('passes over an empty array for a layer\'s title, as Vega-Lite does', () => {
    // vega-lite 5.23 draws 'Drawn title' here: an array whose first entry is
    // not a string is not read as lines of text.
    const spec = { title: [], layer: [bars('Drawn title')] };

    // Before the fix: 'Vega-Lite Chart'.
    expect(titles(spec).title).toBe('Drawn title');
  });

  it.each([
    ['an array of one empty line', ['']],
    ['a text of no lines', { text: [] }],
    ['a text written as an expression', { text: { expr: '\'Dynamic\'' } }],
  ])('reads %s as a title of its own, so no layer\'s title is read in its place', (_name, title) => {
    // vega-lite 5.23 draws these instead of the layer's title: the first two
    // as an empty title, the last as whatever the expression gives.
    expect(titles({ title, layer: [bars('Layer title')] }).title).toBe('Vega-Lite Chart');
  });

  it('leaves an empty line out of a title of several lines', () => {
    expect(titles(bars(['Yield', '', 'by site'])).title).toBe('Yield by site');
  });

  it('leaves a line of whitespace out the same way', () => {
    expect(titles(bars(['Yield', '  ', 'by site'])).title).toBe('Yield by site');
  });

  it('reads a blank title of its own with the subtitle drawn under it', () => {
    // vega-lite 5.23 draws `{ text: [''], subtitle: 'Sub' }` as a blank title
    // with its subtitle, and not the layer's title.
    const spec = { title: { text: [''], subtitle: 'Sub' }, layer: [bars('Layer title')] };

    expect(titles(spec)).toEqual({ title: 'Vega-Lite Chart', subtitle: 'Sub' });
  });

  it('reads a title of whitespace as a blank title of its own', () => {
    expect(titles({ title: ' ', layer: [bars('Layer title')] }).title).toBe('Vega-Lite Chart');
  });

  it('still lets a titled composite\'s own title and subtitle win', () => {
    const spec = {
      title: { text: 'Own title', subtitle: 'Own subtitle' },
      layer: [bars('Layer title')],
    };

    expect(titles(spec)).toEqual({ title: 'Own title', subtitle: 'Own subtitle' });
  });
});
