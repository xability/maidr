/**
 * The Chart.js adapter refused `chartjs-chart-pcp`, though `parallel` has
 * existed since #794 (#1184).
 *
 * The plugin registers **two** controllers, `pcp` and `logarithmicPcp`, and
 * `extractLayers` threw on both. It is also the one Chart.js plugin whose
 * layout is the transpose of every other, which is what makes the reading
 * more than a dispatch case.
 *
 * Measured against a running chart -- `chart.js@4.5` with
 * `chartjs-chart-pcp@4.3`, driven headlessly through Chart.js's own
 * `BasicPlatform`:
 *
 *     dataset.label     'mpg', 'hp', 'wt'          the AXES
 *     data.labels       'car A', 'car B', 'car C'  the OBSERVATIONS
 *     meta.vScale       a LinearAxis element per dataset, id = its label
 *     chart.scales      'x' only, of type 'pcp'
 *     _parsed           [{x: 0, y: 21}, {x: 1, y: 15}, {x: 2, y: 33}]
 *
 * Three things follow, and each is a fact about the plugin:
 *
 *   - **one dataset is one axis**, so the payload is the transpose. A series
 *     per observation, a point per axis, which is what `ParallelTrace`
 *     navigates and what `convertParallelSeries` already emits for
 *     Highcharts.
 *
 *   - **`_parsed.x` is meaningless and is not read.** It is the `pcp`
 *     `CategoryScale` parsing an observation's name against a label list
 *     holding the *axis* names, so it never matches and falls back to the
 *     index -- capped at the dataset count. Four observations over three
 *     axes parse to `x: 0, 1, 2, null`.
 *
 *   - **a gap holds its column open.** A point dropped from the middle of an
 *     observation used to slide every later value onto the axis before it,
 *     which is #1182; `LinePoint.y` is nullable for exactly this.
 */
import type { ChartJsChart, ChartJsDataValue } from '@adapters/chartjs/types';
import type { LinePoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

interface Axis {
  /** The dataset's label, which is what names the axis. */
  label?: string;
  /** One value per observation. */
  data: ChartJsDataValue[];
  /** Whether Chart.js draws it. A hidden dataset is a hidden axis. */
  hidden?: boolean;
  /** A displayed axis title, which names the axis ahead of the label. */
  title?: { display?: boolean; text?: string };
}

/**
 * A parallel coordinates chart as Chart.js leaves it after `update()`.
 *
 * The per-dataset `vScale` is the part worth building faithfully: the plugin
 * gives every dataset its own `LinearAxis` **element** and assigns it there,
 * so a pcp chart's axes are on the metas rather than in `chart.scales`.
 *
 * @param axes - One entry per drawn axis, in order
 * @param labels - The observation names, or absent
 * @param type - Which of the two controllers drew it
 * @returns The chart
 */
function pcpChart(
  axes: Axis[],
  labels?: (string | number)[],
  type: 'pcp' | 'logarithmicPcp' = 'pcp',
): ChartJsChart {
  const datasets = axes.map(axis => ({ label: axis.label, data: axis.data }));
  return {
    canvas: {} as HTMLCanvasElement,
    data: { ...(labels === undefined ? {} : { labels }), datasets },
    options: { plugins: {}, scales: { x: { type: 'pcp' } } },
    config: { type },
    isDatasetVisible: (index: number) => axes[index]?.hidden !== true,
    getDatasetMeta: (index: number) => ({
      data: [],
      type,
      vScale: { id: axes[index]?.label, options: { title: axes[index]?.title } },
    }),
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** The one layer a pcp chart reads as. */
function parallelLayer(chart: ChartJsChart): { layer: any; rows: LinePoint[][] } {
  const layers = extractChartData(chart).maidr.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return { layer: layers[0], rows: layers[0].data as LinePoint[][] };
}

const CARS = ['car A', 'car B', 'car C'];
const THREE_AXES: Axis[] = [
  { label: 'mpg', data: [21, 15, 33] },
  { label: 'hp', data: [110, 245, 65] },
  { label: 'wt', data: [2.6, 3.6, 1.8] },
];

describe('chart.js parallel coordinates', () => {
  it('reads a pcp chart as parallel coordinates rather than raising', () => {
    // The reproduction. Before this the dispatcher's default threw, naming
    // every supported type and not this one.
    const { layer } = parallelLayer(pcpChart(THREE_AXES, CARS));

    expect(layer.type).toBe(TraceType.PARALLEL);
  });

  it('transposes the chart: a series per observation, a point per axis', () => {
    // The plugin's layout is the other way up. Read as written, this would be
    // three series named mpg, hp and wt, each running across the cars -- which
    // is neither what the chart draws nor a shape the trace can navigate.
    const { rows } = parallelLayer(pcpChart(THREE_AXES, CARS));

    expect(rows).toEqual([
      [
        { x: 'mpg', y: 21, z: 'car A' },
        { x: 'hp', y: 110, z: 'car A' },
        { x: 'wt', y: 2.6, z: 'car A' },
      ],
      [
        { x: 'mpg', y: 15, z: 'car B' },
        { x: 'hp', y: 245, z: 'car B' },
        { x: 'wt', y: 3.6, z: 'car B' },
      ],
      [
        { x: 'mpg', y: 33, z: 'car C' },
        { x: 'hp', y: 65, z: 'car C' },
        { x: 'wt', y: 1.8, z: 'car C' },
      ],
    ]);
  });

  it('names the axes generically, since none of them is "the" x axis', () => {
    // Every axis is a variable of its own, so there is no single pair of axis
    // names to read off the chart. `plugins.maidr.axes` overrides these.
    const { layer } = parallelLayer(pcpChart(THREE_AXES, CARS));

    expect(layer.axes).toEqual({
      x: { label: 'Variable' },
      y: { label: 'Value' },
    });
  });

  it('holds a gapped column open rather than shortening the observation', () => {
    // The failure #1182 describes, prevented at the source: dropping car B's
    // missing economy would put its horsepower where every other observation
    // has its economy, and the extent that column is scaled against would
    // then hold two units at once.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, null, 33] },
      { label: 'hp', data: [110, 245, 65] },
    ], CARS));

    expect(rows[1]).toEqual([
      { x: 'mpg', y: null, z: 'car B' },
      { x: 'hp', y: 245, z: 'car B' },
    ]);
    expect(rows.every(row => row.length === 2)).toBe(true);
  });

  it('drops a hidden dataset, because a hidden dataset is a hidden axis', () => {
    // Chart.js lays out no scale for it, so it is not a column of the drawn
    // chart -- announcing it would put a variable on the page that is not
    // there, and every observation would be one axis wider than it looks.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, 15, 33] },
      { label: 'hp', data: [110, 245, 65], hidden: true },
      { label: 'wt', data: [2.6, 3.6, 1.8] },
    ], CARS));

    expect(rows[0].map(point => point.x)).toEqual(['mpg', 'wt']);
  });

  it('names an observation from data.labels and leaves it unnamed without one', () => {
    const named = parallelLayer(pcpChart(THREE_AXES, CARS)).rows;
    const bare = parallelLayer(pcpChart(THREE_AXES)).rows;

    expect(named[0][0].z).toBe('car A');
    expect(bare[0][0]).not.toHaveProperty('z');
  });

  it('falls back to a position when a dataset names no axis', () => {
    // An axis with no name is still an axis a cursor reaches, so it is named
    // by where it sits rather than left empty -- the bar family's own
    // last-resort convention.
    const { rows } = parallelLayer(pcpChart([
      { data: [1, 2] },
      { data: [3, 4] },
    ], ['a', 'b']));

    expect(rows[0].map(point => point.x)).toEqual(['Axis 1', 'Axis 2']);
  });

  it('prefers a displayed axis title to the dataset label', () => {
    // The more descriptive name, and one an author went out of their way to
    // put on the chart.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, 15], title: { display: true, text: 'Miles per gallon' } },
      { label: 'hp', data: [110, 245] },
    ], ['a', 'b']));

    expect(rows[0].map(point => point.x)).toEqual(['Miles per gallon', 'hp']);
  });

  it('ignores a title the chart does not display', () => {
    // Set but not drawn is not the name a sighted reader is given, so it is
    // not the name announced either.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, 15], title: { display: false, text: 'Miles per gallon' } },
      { label: 'hp', data: [110, 245] },
    ], ['a', 'b']));

    expect(rows[0].map(point => point.x)).toEqual(['mpg', 'hp']);
  });

  it('gives a short dataset a gap rather than a missing column', () => {
    // The plugin allows ragged datasets. The third car has no horsepower
    // reading, and the column has to stay open for the same reason a `null`
    // does.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, 15, 33] },
      { label: 'hp', data: [110, 245] },
    ], CARS));

    expect(rows[2]).toEqual([
      { x: 'mpg', y: 33, z: 'car C' },
      { x: 'hp', y: null, z: 'car C' },
    ]);
  });

  it('skips an observation with no reading on any axis', () => {
    // Nothing was drawn for it, so a series of gaps would be a line on the
    // chart that is not there.
    const { rows } = parallelLayer(pcpChart([
      { label: 'mpg', data: [21, null, 33] },
      { label: 'hp', data: [110, null, 65] },
    ], CARS));

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row[0].z)).toEqual(['car A', 'car C']);
  });

  it('reads a logarithmicPcp the same way', () => {
    // The plugin changes where a value is drawn on its axis, not what the
    // value is. `ParallelTrace` places a value linearly within its own axis
    // either way, so announcing the drawn position instead would mean
    // sonifying a log of the data rather than the data.
    const { layer, rows } = parallelLayer(
      pcpChart(THREE_AXES, CARS, 'logarithmicPcp'),
    );

    expect(layer.type).toBe(TraceType.PARALLEL);
    expect(rows[0].map(point => point.y)).toEqual([21, 110, 2.6]);
  });

  it('reads nothing from a chart with no datasets', () => {
    expect(extractChartData(pcpChart([], CARS)).maidr.subplots[0][0].layers).toEqual([]);
  });

  it('reads nothing when every dataset is hidden', () => {
    // Not an empty chart, but a chart drawing no axes -- and a parallel
    // coordinates plot with no axes has nothing to walk.
    const chart = pcpChart([
      { label: 'mpg', data: [21, 15], hidden: true },
      { label: 'hp', data: [110, 245], hidden: true },
    ], ['a', 'b']);

    expect(extractChartData(chart).maidr.subplots[0][0].layers).toEqual([]);
  });

  it('reads nothing when the datasets carry no values', () => {
    expect(
      extractChartData(pcpChart([{ label: 'mpg', data: [] }], CARS))
        .maidr.subplots[0][0].layers,
    ).toEqual([]);
  });

  it('takes the caller\'s axis names when the plugin options give them', () => {
    // The generic pair is a default, not a decision: an author who can say
    // what the variables and their readings are should be able to.
    const extraction = extractChartData(pcpChart(THREE_AXES, CARS), {
      axes: { x: 'Measure', y: 'Reading' },
    });

    expect(extraction.maidr.subplots[0][0].layers[0].axes).toEqual({
      x: { label: 'Measure' },
      y: { label: 'Reading' },
    });
  });
});
