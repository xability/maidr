import type { TreemapPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeChart, fakeGraphic, fakeSeries } from './helpers';

/**
 * A two-level hierarchy declared the way Highcharts asks for one: interior
 * nodes carry an `id` and no value, leaves point at them with `parent`.
 */
const NODES = [
  { id: 'europe', name: 'Europe' },
  { id: 'asia', name: 'Asia' },
  { name: 'France', parent: 'europe', value: 67 },
  { name: 'Spain', parent: 'europe', value: 47 },
  { name: 'Japan', parent: 'asia', value: 125 },
];

describe('highcharts treemap series', () => {
  it('materialises each node\'s ancestor path from its parent chain', () => {
    const chart = fakeChart({
      title: 'Population',
      type: 'treemap',
      renderToId: 'treemap-chart',
      series: [fakeSeries({ index: 0, type: 'treemap', name: 'People', data: NODES })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.title).toBe('People');
    // An interior node keeps no value: TreemapTrace derives its total from the
    // children the paths give it.
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'Europe', path: [] },
      { x: 'Asia', path: [] },
      { x: 'France', y: 67, path: ['Europe'] },
      { x: 'Spain', y: 47, path: ['Europe'] },
      { x: 'Japan', y: 125, path: ['Asia'] },
    ]);
    expect(layer.axes?.x?.label).toBe('Node');
    expect(layer.axes?.y?.label).toBe('Value');
  });

  it('addresses each node by a stamp rather than by document order', () => {
    const series = fakeSeries({
      index: 0,
      type: 'treemap',
      data: NODES.map(node => ({ ...node, graphic: fakeGraphic() })),
    });
    const chart = fakeChart({ type: 'treemap', renderToId: 'treemap-stamped', series: [series] });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    // Highcharts files the rectangles into one group per depth ordered by
    // z-index, so document order carries no declaration order to index into.
    expect(series.data.map(p => p.graphic?.element.getAttribute('data-maidr-node-index')))
      .toEqual(['0', '1', '2', '3', '4']);
    expect(layer.selectors).toEqual([
      '#treemap-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="0"]',
      '#treemap-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="1"]',
      '#treemap-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="2"]',
      '#treemap-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="3"]',
      '#treemap-stamped .highcharts-series-group .highcharts-series-0 [data-maidr-node-index="4"]',
    ]);
  });

  it('stops a path at a parent that was never declared', () => {
    const chart = fakeChart({
      type: 'treemap',
      series: [fakeSeries({
        index: 0,
        type: 'treemap',
        data: [{ name: 'Orphan', parent: 'nowhere', value: 3 }],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as TreemapPoint[];

    // Highcharts attaches such a node to the root, so naming an ancestor that
    // does not exist would describe a tree the chart never drew.
    expect(data).toEqual([{ x: 'Orphan', y: 3, path: [] }]);
  });

  it('refuses to loop on a cyclic parent chain', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chart = fakeChart({
      type: 'treemap',
      series: [fakeSeries({
        index: 0,
        type: 'treemap',
        data: [
          { id: 'a', name: 'A', parent: 'b' },
          { id: 'b', name: 'B', parent: 'a' },
        ],
      })],
    });

    const data = highchartsToMaidr(chart).subplots[0][0].layers[0].data as TreemapPoint[];

    expect(data).toEqual([{ x: 'A', path: ['B'] }, { x: 'B', path: ['A'] }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cyclic parent chain'));
    warn.mockRestore();
  });

  it('reads a sunburst as the same tree drawn as rings', () => {
    const chart = fakeChart({
      type: 'sunburst',
      series: [fakeSeries({ index: 0, type: 'sunburst', data: NODES })],
    });

    const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SUNBURST);
    expect((layer.data as TreemapPoint[])[2]).toEqual({ x: 'France', y: 67, path: ['Europe'] });
  });
});
