import type { LinePoint } from '@type/grammar';
import { bindD3Area } from '@adapters/d3/binders/area';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';

/** One row of the wide table `d3.stack()` is applied to. */
type Row = Record<string, string | number>;

/**
 * Builds what `d3.stack().keys(keys)(rows)` leaves bound to each `<path>`: one
 * array per series, carrying its `.key`, whose items are `[y0, y1]` tuples
 * with a `.data` back-reference to the row they were computed from.
 */
function stack(keys: string[], rows: Row[]): unknown[] {
  return keys.map((key, seriesIndex) => {
    const series = rows.map((row) => {
      // Everything stacked below this series at that row is its lower edge.
      const y0 = keys
        .slice(0, seriesIndex)
        .reduce((sum, lower) => sum + Number(row[lower]), 0);
      const tuple: number[] & { data?: unknown } = [y0, y0 + Number(row[key])];
      tuple.data = row;
      return tuple;
    });
    return Object.assign(series, { key, index: seriesIndex });
  });
}

/**
 * Builds an SVG holding one `path.area` per datum, in the order given, with
 * each datum bound the way `selectAll('path.area').data(...).join('path')`
 * would leave it.
 */
function buildAreaSvg(data: unknown[]): SVGElement {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="area-svg"></svg>`);
  const svg = dom.window.document.querySelector('svg') as unknown as SVGElement;
  for (const datum of data) {
    const path = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'area');
    (path as unknown as { __data__: unknown }).__data__ = datum;
    svg.appendChild(path);
  }
  return svg;
}

const ROWS: Row[] = [
  { year: '2019', Subscriptions: 10, Services: 4 },
  { year: '2020', Subscriptions: 20, Services: 6 },
  { year: '2021', Subscriptions: 35, Services: 9 },
];

/** The same table keyed by one of the aliases the binder infers `x` from. */
const DATED_ROWS: Row[] = ROWS.map(({ year, ...rest }) => ({ date: year, ...rest }));

describe('bindD3Area with d3.stack() output', () => {
  test('emits each band\'s own height, not the accumulated top edge', () => {
    const svg = buildAreaSvg(stack(['Subscriptions', 'Services'], ROWS));

    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      title: 'Revenue by Product',
      axes: { x: 'Year', y: 'Revenue', fill: 'Product' },
      x: 'year',
    });

    expect(result.layer.type).toBe(TraceType.STACKED_AREA);
    // AreaTrace sums the series it is given to recover the running total, so
    // `Services` must carry 4/6/9 — its own value — and not 14/26/44.
    expect(result.layer.data).toEqual([
      [
        { x: '2019', y: 10, z: 'Subscriptions' },
        { x: '2020', y: 20, z: 'Subscriptions' },
        { x: '2021', y: 35, z: 'Subscriptions' },
      ],
      [
        { x: '2019', y: 4, z: 'Services' },
        { x: '2020', y: 6, z: 'Services' },
        { x: '2021', y: 9, z: 'Services' },
      ],
    ]);
  });

  test('infers the x accessor from the stacked row, not from the [y0, y1] tuple', () => {
    const svg = buildAreaSvg(stack(['Subscriptions'], DATED_ROWS));

    // No `x` given: `date` is found on the row the tuple points back to, which
    // is the only place a category exists — the tuple is a pair of edges.
    const result = bindD3Area(svg, { selector: 'path.area', type: TraceType.STACKED_AREA });

    expect((result.layer.data as LinePoint[][])[0].map(point => point.x))
      .toEqual(['2019', '2020', '2021']);
  });

  test('names each series from its d3.stack() key and reports them as the legend', () => {
    const svg = buildAreaSvg(stack(['Subscriptions', 'Services'], ROWS));

    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      x: 'year',
    });

    expect(result.maidr.subplots[0][0].legend).toEqual(['Subscriptions', 'Services']);
  });

  test('stamps one selector per band so the model can highlight a single series', () => {
    const svg = buildAreaSvg(stack(['Subscriptions', 'Services'], ROWS));

    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      x: 'year',
    });

    // A bare selector matches both paths at once, and LineTrace withdraws
    // highlighting unless the selector count equals the series count.
    expect(result.layer.selectors).toEqual([
      '#area-svg path.area[data-maidr-line-index="0"]',
      '#area-svg path.area[data-maidr-line-index="1"]',
    ]);
    const paths = Array.from(svg.querySelectorAll('path.area'));
    expect(paths.map(path => path.getAttribute('data-maidr-line-index'))).toEqual(['0', '1']);
  });

  test('reads a d3.stackOffsetExpand chart as shares of the whole', () => {
    // 100% stacked: the offset scales each column to 1, and the band height is
    // still `y1 - y0` — the share this series holds at that x.
    const expanded = [0, 1].map((seriesIndex) => {
      const series = ROWS.map((row) => {
        const total = Number(row.Subscriptions) + Number(row.Services);
        const own = seriesIndex === 0 ? Number(row.Subscriptions) : Number(row.Services);
        const y0 = seriesIndex === 0 ? 0 : Number(row.Subscriptions) / total;
        const tuple: number[] & { data?: unknown } = [y0, y0 + own / total];
        tuple.data = row;
        return tuple;
      });
      return Object.assign(series, { key: seriesIndex === 0 ? 'Subscriptions' : 'Services' });
    });
    const svg = buildAreaSvg(expanded);

    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.NORMALIZED_AREA,
      x: 'year',
    });

    expect(result.layer.type).toBe(TraceType.NORMALIZED_AREA);
    const data = result.layer.data as LinePoint[][];
    expect(data[0][0].y).toBeCloseTo(10 / 14);
    expect(data[1][0].y).toBeCloseTo(4 / 14);
  });

  test('honors an explicit y accessor, resolved against the tuple', () => {
    const svg = buildAreaSvg(stack(['Subscriptions'], ROWS));

    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      x: 'year',
      y: (d: unknown) => (d as number[])[1] - (d as number[])[0],
    });

    expect((result.layer.data as LinePoint[][])[0].map(point => point.y)).toEqual([10, 20, 35]);
  });
});

describe('bindD3Area with plain point arrays', () => {
  test('reads the point array a line path carries', () => {
    const svg = buildAreaSvg([
      [{ month: 'Jan', temp: 30 }, { month: 'Feb', temp: 34 }],
    ]);

    const result = bindD3Area(svg, {
      selector: 'path.area',
      axes: { x: 'Month', y: 'Temperature' },
      x: 'month',
      y: 'temp',
    });

    // Plain area: independent bands, the default variant.
    expect(result.layer.type).toBe(TraceType.AREA);
    expect(result.layer.data).toEqual([[{ x: 'Jan', y: 30 }, { x: 'Feb', y: 34 }]]);
    // One path → one scoped selector is enough to highlight it.
    expect(result.layer.selectors).toBe('#area-svg path.area');
  });

  test('throws an actionable error when the selector matches no bands', () => {
    const svg = buildAreaSvg([[{ x: 'Jan', y: 1 }]]);

    expect(() => bindD3Area(svg, { selector: 'path.band' })).toThrow(/area path/);
  });

  test('rejects a selector that mixes a stacked band with a non-stacked path', () => {
    // An axis line or reference band caught by the same selector would
    // otherwise be read as a series with no data behind it.
    const svg = buildAreaSvg([
      ...stack(['Subscriptions'], ROWS),
      [{ year: '2019', value: 1 }],
    ]);

    expect(() => bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      x: 'year',
    })).toThrow(/not d3\.stack\(\) output/);
  });
});

describe('core-model integration', () => {
  test('the emitted stacked-area layer constructs a navigable Figure', () => {
    const svg = buildAreaSvg(stack(['Subscriptions', 'Services'], ROWS));
    const result = bindD3Area(svg, {
      selector: 'path.area',
      type: TraceType.STACKED_AREA,
      title: 'Revenue by Product',
      x: 'year',
    });

    // Drop the selectors for this assertion only: LineTrace resolves them by
    // parsing the `<path>` geometry, narrowing with `instanceof
    // SVGPathElement`, and jsdom implements no such class — so highlighting is
    // asserted on the emitted selector strings above, and this checks the part
    // jsdom can run. The model resolves what is left via the page-global
    // `document`; point it at this test's JSDOM document meanwhile.
    const { selectors: _selectors, ...layer } = result.layer;
    const globals = globalThis as { document?: Document };
    const previousDocument = globals.document;
    globals.document = svg.ownerDocument;
    try {
      const figure = new Figure({ ...result.maidr, subplots: [[{ layers: [layer] }]] });
      figure.applyLayout(resolveSubplotLayout(figure.subplots));

      // Reading the state exercises Subplot/Trace construction end-to-end: the
      // payload is one AreaTrace accepts, and the layer announces the chart
      // the user drew rather than a plain line.
      expect(figure.state.empty).toBe(false);
      expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.STACKED_AREA]);
    } finally {
      if (previousDocument === undefined) {
        delete globals.document;
      } else {
        globals.document = previousDocument;
      }
    }
  });
});
