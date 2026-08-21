/**
 * The Chart.js adapter refuses sankeys, though the trace already exists (#1108).
 *
 * `TraceType.SANKEY` got its cursor in #810 and other adapters read it, so an
 * identical flow diagram drawn anywhere else was navigable and only a Chart.js
 * one raised.
 *
 * Measured against a running chart -- `chart.js@4` with
 * `chartjs-chart-sankey@0.15`, driven headlessly through Chart.js's own
 * BasicPlatform -- and the reading turns out to be almost a rename:
 *
 *   - `dataset.data` comes back **verbatim** after `chart.update()`. Unlike
 *     the treemap controller, the sankey one does not replace the caller's
 *     rows, so `{from, to, flow}` maps straight onto `{source, target, value}`.
 *
 *   - the controller does build its own node map (`_nodes`, keyed by name with
 *     `{in, out, size, x, y, ...}`), and it is deliberately not read.
 *     `FlowPoint` says the nodes come from the edges; MAIDR derives its own
 *     from the same rows, so reading the plugin's would be a second source of
 *     truth for something the data already says.
 *
 *   - **cycles need no handling.** The issue asked for this to be measured
 *     rather than assumed: `a → b` plus `b → a` draws two flows over two nodes
 *     without complaint.
 *
 *   - a row with **no** `flow` is not a case to handle -- the plugin throws
 *     laying it out ("Cannot read properties of undefined") before MAIDR sees
 *     the chart. Zero and negative flows draw fine and are read.
 */
import type { ChartJsChart, ChartJsDataset } from '@adapters/chartjs/types';
import type { FlowPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * A sankey chart as Chart.js leaves it after `update()`.
 *
 * @param dataset - The dataset, whose `data` the controller left untouched
 * @returns The chart
 */
function sankeyChart(dataset: ChartJsDataset): ChartJsChart {
  return {
    canvas: {} as HTMLCanvasElement,
    data: { labels: [], datasets: [dataset] },
    options: { plugins: {} },
    config: { type: 'sankey' },
    getDatasetMeta: () => ({ data: [], type: 'sankey' }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** The energy flow the plugin's own README draws. */
function energyDataset(): ChartJsDataset {
  return {
    label: 'Energy',
    data: [
      { from: 'Coal', to: 'Electricity', flow: 34 },
      { from: 'Gas', to: 'Electricity', flow: 20 },
      { from: 'Electricity', to: 'Homes', flow: 30 },
      { from: 'Electricity', to: 'Industry', flow: 24 },
    ],
  } as unknown as ChartJsDataset;
}

/** The single sankey layer of a chart. */
function sankeyLayer(chart: ChartJsChart): { data: FlowPoint[]; layer: any } {
  const layer = extractChartData(chart).maidr.subplots[0][0].layers[0];
  return { data: layer.data as FlowPoint[], layer };
}

describe('chart.js sankey', () => {
  it('is read rather than refused', () => {
    const { layer } = sankeyLayer(sankeyChart(energyDataset()));

    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.title).toBe('Energy');
  });

  it('reads each flow as the edge it draws, in the order it was declared', () => {
    // Order matters beyond tidiness: `FlowTrace` derives its nodes from the
    // edges and orders them by first appearance, so the emitted order *is*
    // the node order a reader sweeps.
    const { data } = sankeyLayer(sankeyChart(energyDataset()));

    expect(data).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Gas', target: 'Electricity', value: 20 },
      { source: 'Electricity', target: 'Homes', value: 30 },
      { source: 'Electricity', target: 'Industry', value: 24 },
    ]);
  });

  it('announces a node by its label rather than its key', () => {
    // `dataset.labels` maps a key to what the chart puts on screen. The key is
    // an identifier; announcing it where the chart says "Apple" describes a
    // different chart.
    const chart = sankeyChart({
      label: 'Fruit',
      data: [{ from: 'a', to: 'b', flow: 5 }],
      labels: { a: 'Apple', b: 'Banana' },
    } as unknown as ChartJsDataset);

    expect(sankeyLayer(chart).data).toEqual([
      { source: 'Apple', target: 'Banana', value: 5 },
    ]);
  });

  it('leaves a node with no label called by its key', () => {
    const chart = sankeyChart({
      label: 'Partial',
      data: [{ from: 'a', to: 'b', flow: 5 }],
      labels: { a: 'Apple' },
    } as unknown as ChartJsDataset);

    expect(sankeyLayer(chart).data).toEqual([
      { source: 'Apple', target: 'b', value: 5 },
    ]);
  });

  it('reads a cycle as the two edges it is', () => {
    const chart = sankeyChart({
      label: 'Cycle',
      data: [
        { from: 'A', to: 'B', flow: 5 },
        { from: 'B', to: 'A', flow: 3 },
      ],
    } as unknown as ChartJsDataset);

    expect(sankeyLayer(chart).data).toEqual([
      { source: 'A', target: 'B', value: 5 },
      { source: 'B', target: 'A', value: 3 },
    ]);
  });

  it('keeps a zero and a negative flow, which the plugin draws', () => {
    // Neither is a gap: the plugin lays both out. A row with *no* flow is the
    // one it refuses, and it refuses it before MAIDR is involved.
    const chart = sankeyChart({
      label: 'Signed',
      data: [
        { from: 'a', to: 'b', flow: 0 },
        { from: 'a', to: 'c', flow: -3 },
      ],
    } as unknown as ChartJsDataset);

    expect(sankeyLayer(chart).data.map(f => f.value)).toEqual([0, -3]);
  });

  it('drops a row that is not a flow rather than emitting a nameless edge', () => {
    const chart = sankeyChart({
      label: 'Mixed',
      data: [
        { from: 'a', to: 'b', flow: 5 },
        { from: 'a', flow: 2 },
        { from: 'a', to: 'c', flow: Number.NaN },
      ],
    } as unknown as ChartJsDataset);

    expect(sankeyLayer(chart).data).toEqual([
      { source: 'a', target: 'b', value: 5 },
    ]);
  });

  it('outlines nothing rather than the wrong ribbon', () => {
    // A `FlowTrace` navigates nodes while the Chart.js elements are flows, and
    // no part of the navigation callback carries the node's identity. Falling
    // through to the bar/line branch would answer `{ index: col }` -- a node
    // in the second column outlining the second *ribbon*, with audio, text and
    // braille all correct while the wrong element lights up (#814).
    const chart = sankeyChart(energyDataset());
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    for (const [row, col] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      expect(
        resolveActiveTargets(
          layers,
          maps,
          extraction.layerDatasetIndices,
          layers[0].id,
          row,
          col,
        ),
      ).toEqual([]);
    }
  });

  it('still refuses the word cloud plugin', () => {
    const chart = sankeyChart({ label: 'x', data: [] } as unknown as ChartJsDataset);
    (chart as unknown as { config: { type: string } }).config.type = 'wordCloud';

    expect(() => extractChartData(chart)).toThrow(/unsupported chart type "wordCloud"/);
  });
});
