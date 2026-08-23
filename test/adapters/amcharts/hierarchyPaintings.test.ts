import { fromAmCharts } from '@adapters/amcharts/adapter';
import { classifySeriesKind } from '@adapters/amcharts/extractor';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeContainer, fakeRoot, fakeSeries } from './helpers';

/**
 * amCharts draws one hierarchy five ways, and the adapter read three (#1140).
 *
 * `Treemap`, `Partition` and `Sunburst` share a single branch of the dispatch
 * and a single converter, because they are one hierarchy painted three ways --
 * the grammar says as much, calling `ICICLE` and `SUNBURST` "the same
 * hierarchy as a TREEMAP, drawn as ...". `Tree` (nodes and links), `Pack`
 * (nested circles) and `LinkedHierarchy` (their base) carry the same nested
 * `children` shape and would have read through the same converter, but
 * `STANDALONE_SERIES_CLASSES` gates discovery: a class not in it is never
 * wrapped as a panel, so the binder reported no supported chart at all.
 *
 * Measured before the fix, by both routes a series can arrive by:
 *
 *     Tree             throws "no XYChart or Pie" / "no supported series"
 *     Pack             throws "no XYChart or Pie" / "no supported series"
 *     LinkedHierarchy  throws "no XYChart or Pie" / "no supported series"
 *     Treemap          treemap                                    <- control
 *
 * Both throws are the binder's documented contract, so this was the adapter
 * declining rather than misreading -- the same shape as #1138's Highcharts
 * gap, reached through a discovery gate instead of a switch.
 */

const NODES = [
  { name: 'root', value: 100 },
  { name: 'a', value: 60 },
  { name: 'b', value: 40 },
];

/**
 * A hierarchy series of the given amCharts class.
 *
 * @param className - The am5hierarchy class to draw as
 * @returns The series
 */
function hierarchy(className: string): ReturnType<typeof fakeSeries> {
  return fakeSeries({
    className,
    name: className,
    settings: { categoryField: 'name', valueField: 'value' },
    data: NODES,
  });
}

/**
 * The layer types a root produces.
 *
 * @param root - The am5 root to read
 * @returns One trace type per layer, or `[]` when the binder declined
 */
function layerTypes(root: unknown): string[] {
  const maidr = fromAmCharts(root as never);
  return (maidr?.subplots?.flat().flatMap(s => s?.layers ?? []) ?? [])
    .map(layer => layer.type);
}

const PAINTINGS = ['Tree', 'Pack', 'LinkedHierarchy'] as const;

describe('amCharts hierarchy paintings', () => {
  it.each(PAINTINGS)('reads a standalone %s as the hierarchy it is', (className) => {
    // The am5hierarchy pattern: a series pushed straight into a container,
    // with no chart around it. This threw before the fix.
    const root = fakeRoot([fakeContainer([hierarchy(className)])]);

    expect(layerTypes(root)).toEqual([TraceType.TREEMAP]);
  });

  it.each(PAINTINGS)('reads %s inside a chart too', (className) => {
    const root = fakeRoot([fakeChart({ series: [hierarchy(className)] })]);

    expect(layerTypes(root)).toEqual([TraceType.TREEMAP]);
  });

  it('reads them the same way it reads a treemap', () => {
    // The point of the change: these are one hierarchy, so they resolve to
    // one reading rather than to five near-identical ones.
    const drawn = PAINTINGS.map(c => classifySeriesKind({ className: c } as never));

    expect(drawn).toEqual(['treemap', 'treemap', 'treemap']);
    expect(classifySeriesKind({ className: 'Treemap' } as never)).toBe('treemap');
  });

  it('still declines a Venn', () => {
    // Not an oversight. An overlap diagram has no axis and no per-category
    // magnitude to walk, so not reading it is the reading -- the same answer
    // `polygon` gets in the Highcharts sweep (#1138).
    const root = fakeRoot([fakeContainer([hierarchy('Venn')])]);

    expect(() => layerTypes(root)).toThrow(/no XYChart or PieChart/);
  });
});
