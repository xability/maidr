/**
 * A Vega-Lite concat nested in a concat is read panel by panel, in the
 * order a page is read.
 *
 * Each child of a concat was converted as a chart of its own, and a child
 * that is itself a concat has no mark to read, so the whole chart fell back
 * to the empty figure with the warning "Concat spec contains a child with an
 * unsupported mark type." Vega-Lite names a nested child's groups after the
 * path to it (`concat_0_concat_1_marks`, `concat_0_concat_1_group`), and a
 * nesting need not make a plain grid, so the panels are read in the rows of
 * the grid the nesting makes: left to right along the top row, then the next
 * row down.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

/**
 * A bar chart titled with its name.
 * @param name - The chart's title
 * @returns The spec
 */
function chart(name: string): Record<string, unknown> {
  return {
    title: name,
    data: { values: [{ c: 'a', v: 1 }, { c: 'b', v: 2 }] },
    mark: 'bar',
    encoding: {
      x: { field: 'c', type: 'nominal' },
      y: { field: 'v', type: 'quantitative' },
    },
  };
}

/**
 * Every panel's name, row by row.
 * @param maidr - The converted chart
 * @returns The names
 */
function panels(maidr: Maidr): Array<Array<string | undefined>> {
  return maidr.subplots.map(row => row.map(subplot => subplot.layers[0]?.title));
}

/**
 * Convert a spec.
 * @param spec - The spec
 * @returns The chart
 */
function convert(spec: unknown): Maidr {
  return vegaLiteToMaidr(spec as VegaLiteSpec);
}

describe('a vega-lite concat nested in a concat', () => {
  beforeEach(() => {
    warn.mockClear();
  });

  it('reads a row of two charts over a third as two rows', () => {
    const maidr = convert({ vconcat: [{ hconcat: [chart('A'), chart('B')] }, chart('C')] });

    // Before the fix: the empty figure, and the warning.
    expect(panels(maidr)).toEqual([['A', 'B'], ['C']]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('names each panel\'s groups after the path to it', () => {
    const maidr = convert({ vconcat: [{ hconcat: [chart('A'), chart('B')] }, chart('C')] });

    const [[a, b], [c]] = maidr.subplots;
    expect(a.selector).toBe('g.mark-group.role-scope.concat_0_concat_0_group > g > path.background');
    expect(b.selector).toBe('g.mark-group.role-scope.concat_0_concat_1_group > g > path.background');
    expect(c.selector).toBe('g.mark-group.role-scope.concat_1_group > g > path.background');
    expect(String(b.layers[0].selectors)).toContain('g.mark-rect.role-mark.concat_0_concat_1_marks');
    expect([a, b, c].map(subplot => subplot.layers[0].id)).toEqual(['0_0_0', '0_1_0', '1_0']);
  });

  it('reads a column beside a chart along the top row first', () => {
    const maidr = convert({ hconcat: [{ vconcat: [chart('A'), chart('B')] }, chart('C')] });

    expect(panels(maidr)).toEqual([['A', 'C'], ['B']]);
  });

  it('reads a wrapping concat inside one in its rows', () => {
    const maidr = convert({
      hconcat: [{ concat: [chart('A'), chart('B'), chart('C')], columns: 2 }, chart('D')],
    });

    expect(panels(maidr)).toEqual([['A', 'B', 'D'], ['C']]);
  });

  it('still falls back to the empty figure when a nested child has no mark to read', () => {
    const maidr = convert({
      vconcat: [{ hconcat: [chart('A'), { facet: { field: 'c' }, spec: chart('B') }] }, chart('C')],
    });

    expect(maidr.subplots).toEqual([[{ layers: [] }]]);
    expect(warn).toHaveBeenCalledWith('[maidr/vegalite] Concat spec contains a child with an unsupported mark type.');
  });
});

describe('a vega-lite concat of charts alone', () => {
  it.each([
    ['hconcat', { hconcat: [chart('A'), chart('B')] }, [['A', 'B']]],
    ['vconcat', { vconcat: [chart('A'), chart('B')] }, [['A'], ['B']]],
    ['wrapping concat', { concat: [chart('A'), chart('B'), chart('C')], columns: 2 }, [['A', 'B'], ['C']]],
  ])('lays a %s out as before', (_name, spec, expected) => {
    const maidr = convert(spec);

    expect(panels(maidr)).toEqual(expected);
    expect(maidr.subplots[0][0].layers[0].id).toBe('0_0');
  });
});
