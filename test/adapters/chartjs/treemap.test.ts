/**
 * The Chart.js adapter refuses treemaps, though the trace already exists (#1108).
 *
 * `extractor.ts` said in its own header that MAIDR had "no semantically
 * equivalent trace" for a treemap. That stopped being true when
 * `TraceType.TREEMAP` got hierarchical navigation in #808, so an identical
 * chart drawn with `chartjs-chart-treemap` raised where the same hierarchy
 * drawn anywhere else was navigable.
 *
 * Every fixture below is transcribed from a **running** chart: `chart.js@4`
 * with `chartjs-chart-treemap@4.2.0` on Node, driven through a stub canvas so
 * the controller's real layout ran. Three findings decided the reading, and
 * two of them contradict what the plugin's published types suggest:
 *
 *   - `dataset.data` after `chart.update()` *is* the array of laid-out
 *     rectangles -- the identical objects each element's `$context.raw`
 *     points at -- so no element walk is needed.
 *
 *   - the layout **reorders**. A source listing France (67) then Japan (125)
 *     comes back Japan first. `_data._idx` keeps the original row number, and
 *     is deliberately not used: the drawn order is what a reader sweeps.
 *
 *   - `isLeaf` means "at the deepest declared group", not "has no children".
 *     With `groups: ['continent']` over rows that also carry a country,
 *     `Asia` comes back `isLeaf: true` holding two children. Nothing here
 *     reads it, which is why the omit-`y` rule counts the drawn children
 *     instead.
 */
import type { ChartJsChart, ChartJsDataset } from '@adapters/chartjs/types';
import type { TreemapPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * A treemap chart as Chart.js leaves it after `update()`.
 *
 * @param dataset - The dataset, with `data` already laid out by the plugin
 * @returns The chart
 */
function treemapChart(dataset: ChartJsDataset): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels: [], datasets: [dataset] },
    options: { plugins: {} },
    config: { type: 'treemap' },
    getDatasetMeta: () => ({ data: [], type: 'treemap' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/**
 * The rectangles a two-level `groups: ['continent', 'country']` chart with
 * `key: 'pop'` laid out, in the order the plugin returned them.
 */
function twoLevelDataset(): ChartJsDataset {
  const row = (continent: string, country: string, pop: number): Record<string, unknown> =>
    ({ continent, country, pop });
  return {
    label: 'Population',
    groups: ['continent', 'country'],
    key: 'pop',
    data: [
      { v: 177, s: 177, l: 0, g: 'Asia', isLeaf: false, _data: { children: [row('Asia', 'Japan', 125), row('Asia', 'Korea', 52)] } },
      { v: 114, s: 114, l: 0, g: 'Europe', isLeaf: false, _data: { children: [row('Europe', 'France', 67), row('Europe', 'Spain', 47)] } },
      { v: 125, s: 125, l: 1, g: 'Japan', gs: 177, isLeaf: true, _data: { children: [row('Asia', 'Japan', 125)] } },
      { v: 52, s: 52, l: 1, g: 'Korea', gs: 177, isLeaf: true, _data: { children: [row('Asia', 'Korea', 52)] } },
      { v: 67, s: 67, l: 1, g: 'France', gs: 114, isLeaf: true, _data: { children: [row('Europe', 'France', 67)] } },
      { v: 47, s: 47, l: 1, g: 'Spain', gs: 114, isLeaf: true, _data: { children: [row('Europe', 'Spain', 47)] } },
    ],
  } as unknown as ChartJsDataset;
}

/** The single treemap layer of a chart. */
function treemapLayer(chart: ChartJsChart): { data: TreemapPoint[]; layer: any } {
  const maidr = extractChartData(chart).maidr;
  const layer = maidr.subplots[0][0].layers[0];
  return { data: layer.data as TreemapPoint[], layer };
}

describe('chart.js treemap', () => {
  it('is read rather than refused', () => {
    const { layer } = treemapLayer(treemapChart(twoLevelDataset()));

    expect(layer.type).toBe(TraceType.TREEMAP);
    expect(layer.title).toBe('Population');
  });

  it('names each node and gives it the ancestry the dataset declares', () => {
    const { data } = treemapLayer(treemapChart(twoLevelDataset()));

    expect(data.map(p => p.x)).toEqual([
      'Asia',
      'Europe',
      'Japan',
      'Korea',
      'France',
      'Spain',
    ]);
    // Root first, excluding the node itself. Built from `groups` and each
    // node's own source row rather than split out of the plugin's dot-joined
    // `_data.path`, which cannot be split back when a name contains a dot.
    expect(data.map(p => p.path)).toEqual([
      undefined,
      undefined,
      ['Asia'],
      ['Asia'],
      ['Europe'],
      ['Europe'],
    ]);
  });

  it('omits an interior value that is the sum of its children, and keeps a leaf', () => {
    const { data } = treemapLayer(treemapChart(twoLevelDataset()));

    // Asia is 125 + 52 and Europe is 67 + 47, so both are the ordinary
    // omittable case `TreemapPoint.y` describes.
    expect(data.map(p => p.y)).toEqual([
      undefined,
      undefined,
      125,
      52,
      67,
      47,
    ]);
  });

  it('keeps a declared parent value that disagrees with its children', () => {
    // `TreemapPoint.y` says so explicitly: a parent may carry mass no child
    // accounts for, and overwriting it would be inventing data. The rule is
    // therefore the measured sum rather than "interior nodes have no value",
    // which is what makes this case reachable at all.
    const dataset = twoLevelDataset();
    (dataset.data[0] as { v: number }).v = 200;

    const { data } = treemapLayer(treemapChart(dataset));

    expect(data[0].x).toBe('Asia');
    expect(data[0].y).toBe(200);
    // Europe still adds up, so it is still omitted -- the rule is per node.
    expect(data[1].y).toBeUndefined();
  });

  it('calls a flat tree of numbers by position, having no name to use', () => {
    // Measured: `tree: [6, 3, 1]` lays out as three rectangles carrying only
    // `v`, `s` and a numeric `_data` -- no `g`, no `l`, no `isLeaf` -- and the
    // controller ignores `data.labels` entirely. The position among its
    // siblings is the only identity such a node has.
    const chart = treemapChart({
      label: 'Flat',
      data: [
        { v: 6, s: 6, _data: 6 },
        { v: 3, s: 3, _data: 3 },
        { v: 1, s: 1, _data: 1 },
      ],
    } as unknown as ChartJsDataset);

    const { data } = treemapLayer(chart);

    expect(data).toEqual([
      { x: 1, y: 6 },
      { x: 2, y: 3 },
      { x: 3, y: 1 },
    ]);
  });

  it('names its axes after the fields, not "X" and "Y"', () => {
    const { layer } = treemapLayer(treemapChart(twoLevelDataset()));

    // A treemap has no scales, so `getAxisLabel`'s fallback would announce a
    // hierarchy's two dimensions as the letters of axes it does not have.
    expect(layer.axes.x.label).toBe('continent / country');
    expect(layer.axes.y.label).toBe('pop');
  });

  it('outlines the rectangle the cursor is on, at every depth', () => {
    // The blind spot this pins: audio, text and braille all read correctly
    // while the wrong rectangle lights up, so nothing else in an accessibility
    // suite would catch a mis-mapped address (#814).
    const chart = treemapChart(twoLevelDataset());
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const at = (row: number, col: number): number[] =>
      resolveActiveTargets(
        layers,
        maps,
        extraction.layerDatasetIndices,
        layers[0].id,
        row,
        col,
      ).map(t => t.index);

    // Depth 0 is the two continents, in emission order.
    expect(at(0, 0)).toEqual([0]);
    expect(at(0, 1)).toEqual([1]);
    // Depth 1 runs across parents: Japan, Korea, France, Spain — which is why
    // the address is a position within the depth rather than within a parent.
    expect(at(1, 0)).toEqual([2]);
    expect(at(1, 2)).toEqual([4]);
    expect(at(1, 3)).toEqual([5]);
    // Nothing is outlined for a position the tree does not have, rather than
    // an element chosen at random.
    expect(at(1, 9)).toEqual([]);
    expect(at(5, 0)).toEqual([]);
  });

  it('still refuses a plugin type nothing reads', () => {
    const chart = treemapChart({ label: 'x', data: [] } as unknown as ChartJsDataset);
    (chart as unknown as { config: { type: string } }).config.type = 'sankey';

    expect(() => extractChartData(chart)).toThrow(/unsupported chart type "sankey"/);
  });
});
