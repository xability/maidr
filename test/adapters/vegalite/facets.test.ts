import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, BoxPoint, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import {
  buildCellDomMap,
  chunkIntoRows,
  describeFacet,
  describeRepeat,
  repeatChildName,
  stampFacetCells,
  substituteRepeatFields,
} from '@adapters/vegalite/facets';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Tests only use the public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const siteValues = [
  { site: 'A', variety: 'v1', yield: 10 },
  { site: 'A', variety: 'v2', yield: 20 },
  { site: 'B', variety: 'v1', yield: 15 },
  { site: 'B', variety: 'v2', yield: 25 },
  { site: 'C', variety: 'v1', yield: 12 },
  { site: 'C', variety: 'v2', yield: 30 },
];

const barChild: VegaLiteSpec = {
  mark: 'bar',
  encoding: {
    x: { field: 'variety', type: 'nominal' },
    y: { field: 'yield', type: 'quantitative' },
  },
};

describe('vega-Lite facet/repeat helpers', () => {
  describe('describeFacet', () => {
    it('detects the facet operator (row/column form)', () => {
      const spec: VegaLiteSpec = {
        data: { values: siteValues },
        facet: { column: { field: 'site', type: 'nominal' } },
        spec: barChild,
      };
      const descriptor = describeFacet(spec);
      expect(descriptor).not.toBeNull();
      expect(descriptor!.columnChannel?.field).toBe('site');
      expect(descriptor!.rowChannel).toBeUndefined();
      expect(descriptor!.childSpec).toBe(barChild);
    });

    it('detects the wrapped facet (field + columns form)', () => {
      const spec: VegaLiteSpec = {
        data: { values: siteValues },
        facet: { field: 'site', type: 'nominal' },
        columns: 2,
        spec: barChild,
      };
      const descriptor = describeFacet(spec);
      expect(descriptor!.wrapChannel?.field).toBe('site');
      expect(descriptor!.columns).toBe(2);
    });

    it('detects the encoding.row/column shorthand and strips the channels', () => {
      const spec: VegaLiteSpec = {
        data: { values: siteValues },
        mark: 'bar',
        encoding: {
          x: { field: 'variety', type: 'nominal' },
          y: { field: 'yield', type: 'quantitative' },
          column: { field: 'site', type: 'nominal' },
        },
      };
      const descriptor = describeFacet(spec);
      expect(descriptor).not.toBeNull();
      expect(descriptor!.columnChannel?.field).toBe('site');
      expect(descriptor!.childSpec.encoding?.column).toBeUndefined();
      expect(descriptor!.childSpec.encoding?.x?.field).toBe('variety');
    });

    it('returns null for plain single-view and concat specs', () => {
      expect(describeFacet({ ...barChild, data: { values: siteValues } })).toBeNull();
      expect(describeFacet({ hconcat: [barChild] })).toBeNull();
      // facet without a child spec is malformed — not a facet.
      expect(describeFacet({ facet: { column: { field: 'site' } } })).toBeNull();
    });
  });

  describe('describeRepeat', () => {
    it('detects the row/column form', () => {
      const descriptor = describeRepeat({
        repeat: { row: ['a', 'b'] },
        spec: barChild,
      });
      expect(descriptor!.rowFields).toEqual(['a', 'b']);
      expect(descriptor!.columnFields).toBeUndefined();
    });

    it('detects the wrapped array form with columns', () => {
      const descriptor = describeRepeat({
        repeat: ['a', 'b', 'c'],
        columns: 2,
        spec: barChild,
      });
      expect(descriptor!.wrapFields).toEqual(['a', 'b', 'c']);
      expect(descriptor!.columns).toBe(2);
    });

    it('returns null for empty or missing repeat definitions', () => {
      expect(describeRepeat({ repeat: [], spec: barChild })).toBeNull();
      expect(describeRepeat({ repeat: {}, spec: barChild })).toBeNull();
      expect(describeRepeat({ repeat: ['a'] })).toBeNull();
    });
  });

  describe('substituteRepeatFields', () => {
    it('replaces {repeat: ...} references anywhere in the child spec', () => {
      const child: VegaLiteSpec = {
        mark: 'point',
        encoding: {
          x: { field: { repeat: 'column' } as unknown as string, type: 'quantitative' },
          y: { field: { repeat: 'row' } as unknown as string, type: 'quantitative' },
        },
      };
      const substituted = substituteRepeatFields(child, { row: 'hp', column: 'mpg' });
      expect(substituted.encoding?.x?.field).toBe('mpg');
      expect(substituted.encoding?.y?.field).toBe('hp');
      // The original child spec is untouched (deep clone).
      expect(child.encoding?.y?.field).toEqual({ repeat: 'row' });
    });

    it('leaves objects that merely contain a repeat key untouched', () => {
      const child = {
        mark: 'point',
        encoding: { x: { field: 'a', repeat: 'not-a-ref' } },
      } as unknown as VegaLiteSpec;
      const substituted = substituteRepeatFields(child, { repeat: 'b' });
      expect((substituted.encoding?.x as Record<string, unknown>).repeat).toBe('not-a-ref');
    });
  });

  describe('repeatChildName', () => {
    it('matches Vega-Lite child view naming', () => {
      expect(repeatChildName({ repeat: 'yield' })).toBe('child__yield');
      expect(repeatChildName({ row: 'yield' })).toBe('child__row_yield');
      expect(repeatChildName({ column: 'year' })).toBe('child__column_year');
      expect(repeatChildName({ row: 'yield', column: 'year' }))
        .toBe('child__row_yieldcolumn_year');
      // Non-word characters in field names become underscores.
      expect(repeatChildName({ repeat: 'my field' })).toBe('child__my_field');
    });
  });

  describe('chunkIntoRows', () => {
    it('wraps into rows of the given width, ragged at the end', () => {
      expect(chunkIntoRows(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
      expect(chunkIntoRows(['a', 'b', 'c'], undefined)).toEqual([['a', 'b', 'c']]);
      expect(chunkIntoRows([], 2)).toEqual([]);
    });
  });
});

describe('vega-Lite faceted conversion', () => {
  it('converts a column facet into a 1xN subplot grid with per-cell data', () => {
    const spec: VegaLiteSpec = {
      title: 'Yield by Site',
      data: { values: siteValues },
      facet: { column: { field: 'site', type: 'nominal' } },
      spec: barChild,
    };
    const result = vegaLiteToMaidr(spec);

    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(3);

    const [cellA, cellB, cellC] = result.subplots[0];
    expect(cellA.layers[0].title).toBe('site: A');
    expect(cellB.layers[0].title).toBe('site: B');
    expect(cellC.layers[0].title).toBe('site: C');

    // Per-cell data is filtered from the shared dataset.
    const dataA = cellA.layers[0].data as BarPoint[];
    expect(dataA).toEqual([{ x: 'v1', y: 10 }, { x: 'v2', y: 20 }]);
    const dataC = cellC.layers[0].data as BarPoint[];
    expect(dataC).toEqual([{ x: 'v1', y: 12 }, { x: 'v2', y: 30 }]);

    // Selectors are cell-scoped via the stamped attribute and target the
    // facet child mark classes.
    const selectorA = cellA.layers[0].selectors as string;
    expect(selectorA).toContain('g[data-maidr-cell="vl-chart-0-0"]');
    expect(selectorA).toContain('child_marks');
    const selectorC = cellC.layers[0].selectors as string;
    expect(selectorC).toContain('g[data-maidr-cell="vl-chart-0-2"]');

    // Subplot selector points at the cell's background path.
    expect(cellA.selector).toBe('g[data-maidr-cell="vl-chart-0-0"] > path.background');

    // Layer ids are unique across the whole figure.
    const ids = result.subplots.flat().flatMap(s => s.layers.map(l => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('converts a row facet into an Nx1 subplot grid', () => {
    const spec: VegaLiteSpec = {
      data: { values: siteValues },
      facet: { row: { field: 'site', type: 'nominal' } },
      spec: barChild,
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(3);
    expect(result.subplots.every(row => row.length === 1)).toBe(true);
    expect(result.subplots[1][0].layers[0].title).toBe('site: B');
  });

  it('converts the encoding.column shorthand like the facet operator', () => {
    const spec: VegaLiteSpec = {
      data: { values: siteValues },
      mark: 'bar',
      encoding: {
        x: { field: 'variety', type: 'nominal' },
        y: { field: 'yield', type: 'quantitative' },
        column: { field: 'site', type: 'nominal' },
      },
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(3);
    expect(result.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    expect(result.subplots[0][0].layers[0].data).toEqual([
      { x: 'v1', y: 10 },
      { x: 'v2', y: 20 },
    ]);
  });

  it('emits sparse row x column facets with ragged rows for missing combos', () => {
    const values = [
      { site: 'A', year: 1931, variety: 'v1', yield: 10 },
      { site: 'B', year: 1931, variety: 'v1', yield: 15 },
      { site: 'B', year: 1932, variety: 'v1', yield: 25 },
      { site: 'C', year: 1932, variety: 'v1', yield: 12 },
    ];
    const spec: VegaLiteSpec = {
      data: { values },
      facet: {
        row: { field: 'year', type: 'ordinal' },
        column: { field: 'site', type: 'nominal' },
      },
      spec: barChild,
    };
    const result = vegaLiteToMaidr(spec);

    // 1931 exists for sites A and B; 1932 for B and C.
    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0].map(s => s.layers[0].title)).toEqual([
      'year: 1931, site: A',
      'year: 1931, site: B',
    ]);
    expect(result.subplots[1].map(s => s.layers[0].title)).toEqual([
      'year: 1932, site: B',
      'year: 1932, site: C',
    ]);
    const bTitles = result.subplots[1][0].layers[0].data as BarPoint[];
    expect(bTitles).toEqual([{ x: 'v1', y: 25 }]);
  });

  it('wraps a single-field facet into rows of `columns` panels', () => {
    const spec: VegaLiteSpec = {
      data: { values: siteValues },
      facet: { field: 'site', type: 'nominal' },
      columns: 2,
      spec: barChild,
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(1);
    expect(result.subplots[1][0].layers[0].title).toBe('site: C');
  });

  it('orders panels by the compiled view domain datasets when available', () => {
    const view = {
      data: (name: string) => {
        if (name === 'column_domain') {
          return [{ site: 'C' }, { site: 'A' }, { site: 'B' }];
        }
        throw new Error(`no dataset ${name}`);
      },
      container: () => null,
      runAsync: () => Promise.resolve(view),
      scale: () => undefined,
    } as unknown as VegaView;

    const spec: VegaLiteSpec = {
      data: { values: siteValues },
      facet: { column: { field: 'site', type: 'nominal' } },
      spec: barChild,
    };
    const result = vegaLiteToMaidr(spec, view);
    expect(result.subplots[0].map(s => s.layers[0].title)).toEqual([
      'site: C',
      'site: A',
      'site: B',
    ]);
    expect(result.subplots[0][0].layers[0].data).toEqual([
      { x: 'v1', y: 12 },
      { x: 'v2', y: 30 },
    ]);
  });

  it('supports boxplot children with per-cell grouping', () => {
    const values = [
      { site: 'A', variety: 'v1', yield: 10 },
      { site: 'A', variety: 'v1', yield: 14 },
      { site: 'A', variety: 'v2', yield: 20 },
      { site: 'B', variety: 'v1', yield: 15 },
    ];
    const spec: VegaLiteSpec = {
      data: { values },
      facet: { column: { field: 'site', type: 'nominal' } },
      spec: {
        mark: 'boxplot',
        encoding: {
          x: { field: 'variety', type: 'nominal' },
          y: { field: 'yield', type: 'quantitative' },
        },
      },
    };
    const result = vegaLiteToMaidr(spec);
    const cellA = result.subplots[0][0].layers[0];
    expect(cellA.type).toBe(TraceType.BOX);
    expect((cellA.data as BoxPoint[]).map(b => b.z)).toEqual(['v1', 'v2']);
    const cellB = result.subplots[0][1].layers[0];
    expect((cellB.data as BoxPoint[]).map(b => b.z)).toEqual(['v1']);
  });
});

describe('vega-Lite repeat conversion', () => {
  const numericValues = [
    { g: 'p', a: 1, b: 2, c: 3 },
    { g: 'q', a: 4, b: 5, c: 6 },
  ];

  it('converts repeat.row into an Nx1 grid with substituted fields', () => {
    const spec: VegaLiteSpec = {
      data: { values: numericValues },
      repeat: { row: ['b', 'c'] },
      spec: {
        mark: 'point',
        encoding: {
          x: { field: 'a', type: 'quantitative' },
          y: { field: { repeat: 'row' } as unknown as string, type: 'quantitative' },
        },
      },
    };
    const result = vegaLiteToMaidr(spec);

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots.every(row => row.length === 1)).toBe(true);

    const [top, bottom] = result.subplots.map(row => row[0].layers[0]);
    expect(top.type).toBe(TraceType.SCATTER);
    expect(top.title).toBe('b');
    expect(top.axes?.y?.label).toBe('b');
    expect(top.data as ScatterPoint[]).toEqual([{ x: 1, y: 2 }, { x: 4, y: 5 }]);
    expect(bottom.axes?.y?.label).toBe('c');
    expect(bottom.data as ScatterPoint[]).toEqual([{ x: 1, y: 3 }, { x: 4, y: 6 }]);

    // Selectors use the per-cell child view class — unique without stamping.
    expect(top.selectors as string).toContain('child__row_b_marks');
    expect(bottom.selectors as string).toContain('child__row_c_marks');

    // Subplot selector points at the repeat cell group's background path.
    expect(result.subplots[0][0].selector)
      .toBe('g.mark-group.role-scope.child__row_b_group > g > path.background');
  });

  it('converts repeat.row x repeat.column into a full grid', () => {
    const spec: VegaLiteSpec = {
      data: { values: numericValues },
      repeat: { row: ['b', 'c'], column: ['a', 'b'] },
      spec: {
        mark: 'point',
        encoding: {
          x: { field: { repeat: 'column' } as unknown as string, type: 'quantitative' },
          y: { field: { repeat: 'row' } as unknown as string, type: 'quantitative' },
        },
      },
    };
    const result = vegaLiteToMaidr(spec);

    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[0][0].layers[0].title).toBe('b vs a');
    expect(result.subplots[0][0].layers[0].selectors as string)
      .toContain('child__row_bcolumn_a_marks');
    expect(result.subplots[1][1].layers[0].axes?.x?.label).toBe('b');
    expect(result.subplots[1][1].layers[0].axes?.y?.label).toBe('c');

    const ids = result.subplots.flat().flatMap(s => s.layers.map(l => l.id));
    expect(new Set(ids).size).toBe(4);
  });

  it('wraps repeat arrays into rows of `columns` panels', () => {
    const spec: VegaLiteSpec = {
      data: { values: numericValues },
      repeat: ['a', 'b', 'c'],
      columns: 2,
      spec: {
        mark: 'bar',
        encoding: {
          x: { field: 'g', type: 'nominal' },
          y: { field: { repeat: 'repeat' } as unknown as string, type: 'quantitative' },
        },
      },
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(1);
    expect(result.subplots[1][0].layers[0].title).toBe('c');
    expect(result.subplots[1][0].layers[0].selectors as string)
      .toContain('child__c_marks');
  });
});

describe('concat wrap columns', () => {
  it('honours spec.columns for general concat', () => {
    const child = (values: Record<string, unknown>[]): VegaLiteSpec => ({
      data: { values },
      mark: 'bar',
      encoding: {
        x: { field: 'x', type: 'nominal' },
        y: { field: 'y', type: 'quantitative' },
      },
    });
    const spec: VegaLiteSpec = {
      concat: [
        child([{ x: 'a', y: 1 }]),
        child([{ x: 'b', y: 2 }]),
        child([{ x: 'c', y: 3 }]),
      ],
      columns: 2,
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(2);
    expect(result.subplots[0]).toHaveLength(2);
    expect(result.subplots[1]).toHaveLength(1);
  });

  it('keeps a single row when columns is omitted', () => {
    const spec: VegaLiteSpec = {
      concat: [
        { data: { values: [{ x: 'a', y: 1 }] }, mark: 'bar', encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } } },
        { data: { values: [{ x: 'b', y: 2 }] }, mark: 'bar', encoding: { x: { field: 'x', type: 'nominal' }, y: { field: 'y', type: 'quantitative' } } },
      ],
    };
    const result = vegaLiteToMaidr(spec);
    expect(result.subplots).toHaveLength(1);
    expect(result.subplots[0]).toHaveLength(2);
  });
});

describe('stampFacetCells / buildCellDomMap (DOM)', () => {
  /**
   * Build a minimal jsdom SVG mimicking Vega-Lite's faceted output: one
   * `g.mark-group.role-scope.cell` whose direct <g> children are the
   * per-cell items (each with a background path and a child_marks group),
   * plus column headers with the facet values.
   */
  function buildFacetDom(
    cellCount: number,
    headers: string[],
    options?: { emptyCellAt?: number },
  ): { svg: SVGSVGElement; dom: unknown } {
    const header = (text: string): string =>
      `<g><g><g class="mark-group role-title"><g><g>`
      + `<g class="mark-text role-title-text"><text>${text}</text></g>`
      + `</g></g></g></g></g>`;
    const cell = (empty: boolean): string =>
      `<g transform="translate(0,0)"><path class="background"></path><g>${
        empty
          ? ''
          : `<g class="mark-rect role-mark child_marks"><path></path><path></path></g>`
      }</g></g>`;
    const cells = Array.from(
      { length: cellCount },
      (_, i) => cell(i === options?.emptyCellAt),
    );
    const html = `<!DOCTYPE html><body><svg>`
      + `<g class="mark-group role-frame root"><g><g>`
      + `<g class="mark-group role-column-header column_header">${headers.map(header).join('')}</g>`
      + `<g class="mark-group role-scope cell">${cells.join('')}</g>`
      + `</g></g></g>`
      + `</svg></body>`;
    const dom = new JSDOM(html);
    const svg = dom.window.document.querySelector('svg') as SVGSVGElement;
    return { svg, dom };
  }

  const facetSpec: VegaLiteSpec = {
    data: { values: siteValues },
    facet: { column: { field: 'site', type: 'nominal' } },
    spec: barChild,
  };

  it('stamps cells in DOM order and makes cell-scoped selectors resolve', () => {
    const maidr = vegaLiteToMaidr(facetSpec);
    const { svg } = buildFacetDom(3, ['A', 'B', 'C']);

    stampFacetCells(svg, maidr);

    const cellGroup = svg.querySelector('g.mark-group.role-scope.cell')!;
    const items = Array.from(cellGroup.children);
    expect(items.map(el => el.getAttribute('data-maidr-cell'))).toEqual([
      'vl-chart-0-0',
      'vl-chart-0-1',
      'vl-chart-0-2',
    ]);

    // Each panel's layer selector now matches exactly its own cell's marks.
    for (let c = 0; c < 3; c++) {
      const selector = maidr.subplots[0][c].layers[0].selectors as string;
      const matched = svg.querySelectorAll(selector);
      expect(matched).toHaveLength(2);
      expect(items[c].contains(matched[0])).toBe(true);
    }

    // Subplot selectors resolve to each cell's background path.
    const background = svg.querySelector(maidr.subplots[0][1].selector!);
    expect(background).not.toBeNull();
    expect(items[1].contains(background!)).toBe(true);
  });

  it('builds the per-layer cell root map after stamping', () => {
    const maidr = vegaLiteToMaidr(facetSpec);
    const { svg } = buildFacetDom(3, ['A', 'B', 'C']);
    stampFacetCells(svg, maidr);

    const map = buildCellDomMap(svg, maidr);
    expect(map.size).toBe(3);

    const cellGroup = svg.querySelector('g.mark-group.role-scope.cell')!;
    const firstLayer = maidr.subplots[0][0].layers[0];
    const info = map.get(firstLayer)!;
    expect(info.root).toBe(cellGroup.children[0]);
    expect(info.scope).toBe('g[data-maidr-cell="vl-chart-0-0"]');
  });

  it('skips mark-less cells rendered for empty cross-facet combinations', () => {
    const maidr = vegaLiteToMaidr(facetSpec);
    // Four rendered cells, one of them empty (no role-mark group inside) —
    // Vega renders these for (row, column) combinations with no data.
    const { svg } = buildFacetDom(4, ['A', 'B', 'C'], { emptyCellAt: 1 });

    stampFacetCells(svg, maidr);

    const cellGroup = svg.querySelector('g.mark-group.role-scope.cell')!;
    const items = Array.from(cellGroup.children);
    expect(items[0].getAttribute('data-maidr-cell')).toBe('vl-chart-0-0');
    expect(items[1].hasAttribute('data-maidr-cell')).toBe(false);
    expect(items[2].getAttribute('data-maidr-cell')).toBe('vl-chart-0-1');
    expect(items[3].getAttribute('data-maidr-cell')).toBe('vl-chart-0-2');
  });

  it('warns and skips stamping on a cell count mismatch', () => {
    const maidr = vegaLiteToMaidr(facetSpec);
    const { svg } = buildFacetDom(2, ['A', 'B']); // one cell missing
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      stampFacetCells(svg, maidr);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cell count mismatch'));
      const stamped = svg.querySelectorAll('[data-maidr-cell]');
      expect(stamped).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns when header texts disagree with panel titles', () => {
    const maidr = vegaLiteToMaidr(facetSpec);
    const { svg } = buildFacetDom(3, ['X', 'Y', 'Z']); // wrong headers
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      stampFacetCells(svg, maidr);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not match'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does nothing for non-facet charts', () => {
    const singleView = vegaLiteToMaidr({ ...barChild, data: { values: siteValues } });
    const { svg } = buildFacetDom(3, ['A', 'B', 'C']);
    stampFacetCells(svg, singleView);
    expect(svg.querySelectorAll('[data-maidr-cell]')).toHaveLength(0);
    expect(buildCellDomMap(svg, singleView).size).toBe(0);
  });
});
