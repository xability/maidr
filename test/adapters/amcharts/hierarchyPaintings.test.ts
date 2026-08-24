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
 *
 * The second half of #1140 is the name. Opening the gate first read all three
 * as `treemap`, because the navigation is identical -- but the trace type is
 * also what the reader is *told* is on the page, and a node-link diagram
 * announced as a treemap is a chart type nobody drew. `Tree` and
 * `LinkedHierarchy` are one mark (`Tree` draws by extending
 * `LinkedHierarchy`) and take `TraceType.TREE`; `Pack` draws nested circles
 * and takes `TraceType.PACK`. All five still share the one branch of the
 * dispatch and the one converter, which is the part that was never in doubt.
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

const PAINTINGS = [
  ['Tree', TraceType.TREE],
  ['Pack', TraceType.PACK],
  ['LinkedHierarchy', TraceType.TREE],
] as const;

describe('amCharts hierarchy paintings', () => {
  it.each(PAINTINGS)('reads a standalone %s as the hierarchy it is', (className, type) => {
    // The am5hierarchy pattern: a series pushed straight into a container,
    // with no chart around it. This threw before the fix.
    const root = fakeRoot([fakeContainer([hierarchy(className)])]);

    expect(layerTypes(root)).toEqual([type]);
  });

  it.each(PAINTINGS)('reads %s inside a chart too', (className, type) => {
    const root = fakeRoot([fakeChart({ series: [hierarchy(className)] })]);

    expect(layerTypes(root)).toEqual([type]);
  });

  it('names each after the painting on the page, not after the treemap', () => {
    // The half of #1140 the grammar had to grow for. Reading all three as
    // `treemap` navigated correctly and announced the wrong chart.
    const drawn = PAINTINGS.map(([c]) => classifySeriesKind({ className: c } as never));

    expect(drawn).toEqual(['tree', 'pack', 'tree']);
    expect(classifySeriesKind({ className: 'Treemap' } as never)).toBe('treemap');
  });

  it('gives a Tree and a Pack different names', () => {
    // Nailed down separately, because a mapping that collapsed the two back
    // onto one name would still pass every per-class case above.
    const tree = fakeRoot([fakeContainer([hierarchy('Tree')])]);
    const pack = fakeRoot([fakeContainer([hierarchy('Pack')])]);

    expect(layerTypes(tree)).not.toEqual(layerTypes(pack));
  });

  it('reads all five through the one converter', () => {
    // The names differ; the data does not. A Tree's points are the treemap's
    // points, which is why one branch of the dispatch still serves all five.
    const of = (className: string): unknown =>
      fromAmCharts(fakeRoot([fakeContainer([hierarchy(className)])]) as never)
        ?.subplots
        ?.flat()
        .flatMap(s => s?.layers ?? [])[0]
        ?.data;

    expect(of('Tree')).toEqual(of('Treemap'));
    expect(of('Pack')).toEqual(of('Treemap'));
  });

  it('still declines a Venn', () => {
    // Not an oversight. An overlap diagram has no axis and no per-category
    // magnitude to walk, so not reading it is the reading -- the same answer
    // `polygon` gets in the Highcharts sweep (#1138).
    const root = fakeRoot([fakeContainer([hierarchy('Venn')])]);

    expect(() => layerTypes(root)).toThrow(/no XYChart or PieChart/);
  });
});
