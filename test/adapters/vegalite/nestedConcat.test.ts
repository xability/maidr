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
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
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

  it('reads a three-level nesting in rows, a row shorter than the one above it', () => {
    // A beside a column of B over C, all over D: the grid's rows are A and B,
    // then C alone under B, then D.
    const maidr = convert({ vconcat: [{ hconcat: [chart('A'), { vconcat: [chart('B'), chart('C')] }] }, chart('D')] });

    expect(panels(maidr)).toEqual([['A', 'B'], ['C'], ['D']]);
    expect(maidr.subplots.flat().map(subplot => subplot.layers[0].id)).toEqual(['0_0_0', '0_1_0_0', '0_1_1_0', '1_0']);
  });

  it('reads the columns of different heights in rows', () => {
    const maidr = convert({ hconcat: [{ vconcat: [chart('A'), chart('B'), chart('C')] }, { vconcat: [chart('D')] }] });

    expect(panels(maidr)).toEqual([['A', 'D'], ['B'], ['C']]);
  });

  it('names a layered nested child\'s layers after the path to it', () => {
    const layered = {
      title: 'B',
      data: { values: [{ c: 'a', v: 1 }, { c: 'b', v: 2 }] },
      layer: [
        { mark: 'bar', encoding: { x: { field: 'c', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } },
        { mark: 'line', encoding: { x: { field: 'c', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } },
      ],
    };

    const maidr = convert({ vconcat: [{ hconcat: [chart('A'), layered] }, chart('C')] });

    const b = maidr.subplots[0][1];
    expect(b.layers.map(layer => layer.id)).toEqual(['0_1_0', '0_1_1']);
    expect(String(b.layers[1].selectors)).toContain('g.mark-line.role-mark.concat_0_concat_1_layer_1_marks');
  });

  it('reads each nested chart from the dataset Vega numbers it by, depth first', () => {
    // vega-lite 5.23 compiles three charts that bring their own data,
    // `vconcat: [{ hconcat: [A, B] }, C]`, to datasets data_0, data_1 and
    // data_2: the order the charts are parsed in, depth first, as a flat
    // concat's are.
    const own = (name: string, v: number): Record<string, unknown> => ({ ...chart(name), data: { values: [{ c: 'a', v }] } });
    const datasets: Record<string, Array<Record<string, unknown>>> = {
      data_0: [{ c: 'a', v: 1 }],
      data_1: [{ c: 'a', v: 2 }],
      data_2: [{ c: 'a', v: 3 }],
    };
    const view = {
      data: (name: string) => {
        if (!datasets[name])
          throw new Error(`no dataset ${name}`);
        return datasets[name];
      },
      container: () => null,
      runAsync: async (): Promise<unknown> => view,
      scale: () => undefined,
    } as unknown as VegaView;

    const maidr = vegaLiteToMaidr({ vconcat: [{ hconcat: [own('A', 10), own('B', 20)] }, own('C', 30)] } as unknown as VegaLiteSpec, view);

    const values = maidr.subplots.flat().map(subplot => (subplot.layers[0].data as Array<{ y: number }>).map(bar => bar.y));
    expect(values).toEqual([[1], [2], [3]]);
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
