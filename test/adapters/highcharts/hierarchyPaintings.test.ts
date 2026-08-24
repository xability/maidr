import type { HighchartsPoint, HighchartsSeries } from '@adapters/highcharts/types';
import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/**
 * Highcharts draws a hierarchy five ways, and the adapter read three (#1140's
 * shape, on the Highcharts side).
 *
 * `treemap`, `sunburst` and `organization` were already read. `treegraph`
 * (nodes and links) and `packedbubble` (circles packed together) were not:
 * both fell through the series-type switch to
 *
 *     [MAIDR Highcharts] Unsupported series type: "treegraph"; skipping.
 *     [MAIDR Highcharts] Unsupported series type: "packedbubble"; skipping.
 *
 * and produced no layer at all. Measured in Highcharts 13 with
 * `modules/treegraph.js` and `highcharts-more.js`, against `treemap` as the
 * control:
 *
 *     treegraph      no layers            <- declined
 *     packedbubble   no layers            <- declined
 *     treemap        treemap  n=5         <- control
 *     bubble         point    n=2         <- control
 *
 * Both now have a name in the grammar -- `TREE` from #1158 and `PACK` from
 * #1159 -- and the naming argument is the one those made: the trace type is
 * what the reader is *told* is on the page, so a node-link diagram is a tree
 * and a cluster of circles is a pack, not a treemap.
 *
 * ## The one thing that is not shared
 *
 * A treegraph declares exactly what a treemap does, so the walk up the
 * `parent` chain is the treemap's. What differs is the magnitude. A
 * treegraph's layout sizes nothing by value and Highcharts fills the field in
 * regardless:
 *
 *     treegraph, no values      point.value 0        point.options.value undefined
 *     treegraph, values 1..5    point.value 1..5     point.options.value 1..5
 *
 * so reading `point.value` would announce a magnitude of zero for a chart that
 * has none -- #1153's defect, and the reason `convertOrganizationSeries`
 * exists. The declaration is read instead.
 *
 * A treemap is untouched by that and must stay so. There the computed field is
 * a real total: an interior node with no declared value comes back carrying
 * the sum of its children (measured, 12 and 8 on a leaves-only tree), and a
 * treemap with no values anywhere renders **zero** nodes, so the case this
 * guards against cannot arise.
 */

const NODES = [
  { id: 'root', name: 'Company' },
  { id: 'a', parent: 'root', name: 'Sales' },
  { id: 'b', parent: 'root', name: 'Engineering' },
  { id: 'b1', parent: 'b', name: 'Frontend' },
  { id: 'b2', parent: 'b', name: 'Backend' },
];

/**
 * A treegraph series shaped the way Highcharts hands one over.
 *
 * `value` is the layout's own field and `options.value` is what the author
 * wrote, so the two are supplied separately -- a fixture that set only
 * `options` would let a converter reading `value` pass by accident.
 *
 * @param declared - The value each node declares, `undefined` for none
 * @returns The series
 */
function treegraph(declared: (number | undefined)[]): HighchartsSeries {
  return fakeSeries({
    index: 0,
    type: 'treegraph',
    name: 'Org',
    data: NODES.map((node, i) => ({
      ...node,
      // Highcharts' computed field: zero on every node of a valueless chart.
      value: declared[i] ?? 0,
      options: declared[i] === undefined ? {} : { value: declared[i] },
    })),
  });
}

/**
 * One `packedbubble` series: a group of bubbles with no parents among them.
 *
 * @param index - The series index
 * @param name - The group's name, which the chart shows in its legend
 * @param bubbles - One name and value per bubble
 * @returns The series
 */
function packedBubble(
  index: number,
  name: string,
  bubbles: { name: string; value: number }[],
): HighchartsSeries {
  return fakeSeries({
    index,
    type: 'packedbubble',
    name,
    data: bubbles.map(bubble => ({ ...bubble, options: { value: bubble.value } })),
  });
}

/**
 * The layers a chart produces, or `[]` when every series was declined.
 *
 * @param series - The series to read
 * @param renderToId - The container id the selectors are built against
 * @returns The layers
 */
function layersOf(series: HighchartsSeries[], renderToId: string): MaidrLayer[] {
  const chart = fakeChart({ type: series[0].type, renderToId, series });
  return highchartsToMaidr(chart).subplots.flat().flatMap(s => s.layers);
}

describe('highcharts treegraph series', () => {
  it('reads the hierarchy a treemap would, under the name of what is drawn', () => {
    const [layer] = layersOf([treegraph([1, 2, 3, 4, 5])], 'treegraph-valued');

    // TREE, not TREEMAP: the navigation is the same and the picture is not.
    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.title).toBe('Org');
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Company', y: 1, path: [] },
      { x: 'Sales', y: 2, path: ['Company'] },
      { x: 'Engineering', y: 3, path: ['Company'] },
      { x: 'Frontend', y: 4, path: ['Company', 'Engineering'] },
      { x: 'Backend', y: 5, path: ['Company', 'Engineering'] },
    ]);
    expect(layer.axes?.y?.label).toBe('Value');
  });

  it('announces no magnitude for a chart that declares none', () => {
    // The defect the declaration guards against. Highcharts hands over
    // `value: 0` on every node here, and emitting it would tell the reader
    // every box in the org chart measures zero.
    const [layer] = layersOf([treegraph([])], 'treegraph-valueless');

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Company', path: [] },
      { x: 'Sales', path: ['Company'] },
      { x: 'Engineering', path: ['Company'] },
      { x: 'Frontend', path: ['Company', 'Engineering'] },
      { x: 'Backend', path: ['Company', 'Engineering'] },
    ]);
    // And no axis for the magnitude that is not there, which is the answer an
    // organization chart already gets (#1153).
    expect(layer.axes?.y).toBeUndefined();
    expect(layer.axes?.x?.label).toBe('Node');
  });

  it('keeps a declared zero, which is not the layout\'s zero', () => {
    // The case that separates "declared" from "truthy". Highcharts hands
    // over `value: 0` for a node that declared nothing *and* for a node that
    // declared zero; only `options.value` tells them apart, and only a
    // `typeof` test reads a declared zero as declared. Raised in review of
    // #1165.
    const [layer] = layersOf([treegraph([0, 0, 0, 0, 0])], 'treegraph-zeros');

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Company', y: 0, path: [] },
      { x: 'Sales', y: 0, path: ['Company'] },
      { x: 'Engineering', y: 0, path: ['Company'] },
      { x: 'Frontend', y: 0, path: ['Company', 'Engineering'] },
      { x: 'Backend', y: 0, path: ['Company', 'Engineering'] },
    ]);
    // Declared, so the axis naming the magnitude is drawn -- unlike the
    // valueless chart above, whose identical `point.value` fields are the
    // layout's own.
    expect(layer.axes?.y?.label).toBe('Value');
  });

  it('keeps a declared value beside an undeclared sibling', () => {
    // Leaves valued, interiors not -- the ordinary way a weighted tree is
    // written. The interiors carry no `y`, so `TreemapTrace` derives their
    // totals from the children the paths give it, exactly as for a treemap.
    const [layer] = layersOf(
      [treegraph([undefined, 4, undefined, 4, 4])],
      'treegraph-partial',
    );

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Company', path: [] },
      { x: 'Sales', y: 4, path: ['Company'] },
      { x: 'Engineering', path: ['Company'] },
      { x: 'Frontend', y: 4, path: ['Company', 'Engineering'] },
      { x: 'Backend', y: 4, path: ['Company', 'Engineering'] },
    ]);
    // One node declares a magnitude, so the axis naming it is drawn.
    expect(layer.axes?.y?.label).toBe('Value');
  });

  it('addresses each node by the same stamp a treemap uses', () => {
    const series = fakeSeries({
      index: 0,
      type: 'treegraph',
      data: NODES.map(node => ({ ...node, value: 0, options: {}, graphic: fakeGraphic() })),
    });
    const [layer] = layersOf([series], 'treegraph-stamped');

    // Load-bearing here in a way it is not for a treemap: Highcharts classes
    // a treegraph's link paths `highcharts-point` too, so a selector list
    // indexed by document position would address the links.
    expect(series.data.map((p: HighchartsPoint) =>
      p.graphic?.element.getAttribute('data-maidr-node-index'))).toEqual(['0', '1', '2', '3', '4']);
    expect((layer.selectors as string[])[0]).toBe(
      '#treegraph-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="0"]',
    );
  });
});

describe('highcharts packedbubble series', () => {
  it('reads each group as its own pack of circles', () => {
    const layers = layersOf([
      packedBubble(0, 'Europe', [{ name: 'Germany', value: 12 }, { name: 'France', value: 8 }]),
      packedBubble(1, 'Asia', [{ name: 'Japan', value: 15 }, { name: 'India', value: 20 }]),
    ], 'packed-groups');

    expect(layers.map(l => l.type)).toEqual([TraceType.PACK, TraceType.PACK]);
    // The grouping is which *series* a bubble is in -- nothing declares a
    // `parent` -- and the adapter already names each layer after its series,
    // so the paths are empty and each layer is the flat pack it draws.
    expect(layers.map(l => l.title)).toEqual(['Europe', 'Asia']);
    expect(layers[0].data as TreemapPoint[]).toEqual([
      { x: 'Germany', y: 12, path: [] },
      { x: 'France', y: 8, path: [] },
    ]);
    expect(layers[1].data as TreemapPoint[]).toEqual([
      { x: 'Japan', y: 15, path: [] },
      { x: 'India', y: 20, path: [] },
    ]);
  });

  it('gives a pack a different name from a treemap', () => {
    // Nailed down separately: a mapping that collapsed the two back onto one
    // name would still pass every assertion above.
    const [packed] = layersOf(
      [packedBubble(0, 'Europe', [{ name: 'Germany', value: 12 }])],
      'packed-named',
    );
    const [treemapped] = layersOf(
      [fakeSeries({ index: 0, type: 'treemap', name: 'Europe', data: [{ name: 'Germany', value: 12 }] })],
      'treemap-named',
    );

    expect(packed.type).not.toBe(treemapped.type);
    // The data does not differ; only the name does. That is why one converter
    // still serves both.
    expect(packed.data).toEqual(treemapped.data);
  });
});

describe('the treemap reading these two were built on', () => {
  it('still takes its interior totals from the computed field', () => {
    // The bound on the change. A treegraph reads `options.value` because its
    // computed field is a layout artefact; a treemap's is a real total, and
    // moving it to the declaration would silently drop every interior sum.
    const series = fakeSeries({
      index: 0,
      type: 'treemap',
      name: 'People',
      data: [
        { id: 'root', name: 'Company', value: 12 },
        { id: 'b', parent: 'root', name: 'Engineering', value: 8 },
        { name: 'Frontend', parent: 'b', value: 4 },
      ],
    });
    const [layer] = layersOf([series], 'treemap-unchanged');

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Company', y: 12, path: [] },
      { x: 'Engineering', y: 8, path: ['Company'] },
      { x: 'Frontend', y: 4, path: ['Company', 'Engineering'] },
    ]);
    expect(layer.axes?.y?.label).toBe('Value');
  });
});
