/**
 * A Highcharts variwide is a column chart whose widths carry data, and used to
 * be nothing at all (#1138).
 *
 * `buildSubplot` sorts series into buckets by type and `barTypes` names only
 * `bar`, `column`, `columnpyramid` and `pictorial`. Highcharts' variwide
 * module registers `series.type = 'variwide'`, which fell into no bucket,
 * reached `convertSeries` as an unsupported type and was declined — so the
 * chart emitted **zero layers** and was not navigable at all.
 *
 * It is read as a mosaic rather than as a bar, because a bar has nowhere to
 * put the width: `BarPoint` is `{x, y}`, so half of what the chart draws
 * would be dropped silently. `MosaicPoint.width` is defined as "the fraction
 * the column is drawn at", which is exactly what a variwide's `z` resolves to.
 *
 * Measured on Highcharts 11.4.8 plus `modules/variwide.js` in Chromium, four
 * columns over a 726px plot:
 *
 *   point      z      z / sum(z)   drawn width
 *   Norway     5.4    0.0393       28px
 *   Germany   83.2    0.6060       440px
 *   Poland    38.0    0.2768       201px
 *   Greece    10.7    0.0779       57px
 *
 * — the share to the pixel. The edge cases were measured the same way, three
 * columns of z = 4, 6, 10:
 *
 *   declared                  what Highcharts drew
 *   all three sized           three columns, 145 / 218 / 363 px wide
 *   middle point y = 0        three columns, the middle one 0px TALL
 *   middle point y = null     TWO columns; the null one has no graphic
 *   middle point z = 0        three columns, the middle one 1px wide
 *   middle point has no z     three columns at 0x0 — the whole series dies
 *   every z = 0               every column at 0x0
 *
 * The last two are why a share is emitted only when every point carries one:
 * Highcharts sizes all the columns or none of them, and shares computed over
 * the survivors would describe a chart nobody was shown.
 */
import type { MosaicPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/** The four columns measured above, as the adapter is handed them. */
const GDP = [
  { name: 'Norway', y: 42, z: 5.4 },
  { name: 'Germany', y: 39, z: 83.2 },
  { name: 'Poland', y: 27, z: 38.0 },
  { name: 'Greece', y: 20, z: 10.7 },
];

/**
 * A one-series variwide chart.
 *
 * @param points - The columns, as `{name, y, z}` triples
 * @param options - How the chart is drawn
 * @param options.inverted - Lays the columns across the page
 * @returns The fake chart
 */
function variwideChart(
  points: { name: string; y: number | null; z?: number }[] = GDP,
  options: { inverted?: boolean } = {},
): ReturnType<typeof fakeChart> {
  return fakeChart({
    type: 'variwide',
    renderToId: 'variwide-chart',
    inverted: options.inverted,
    series: [fakeSeries({
      index: 0,
      type: 'variwide',
      name: 'GDP',
      xAxis: fakeAxis({ options: { title: { text: 'Country' } } }),
      yAxis: fakeAxis({ options: { title: { text: 'GDP per capita' } } }),
      data: points.map((p, i) => ({ x: i, y: p.y, z: p.z, name: p.name })),
    })],
  });
}

/**
 * The single row of cells a one-series variwide reads as.
 *
 * @param chart - The chart to convert
 * @returns The cells
 */
function cells(chart: ReturnType<typeof fakeChart>): MosaicPoint[] {
  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  return (layer.data as MosaicPoint[][])[0];
}

describe('highcharts variwide', () => {
  it('reads a variwide as a mosaic rather than declining it', () => {
    const layer = highchartsToMaidr(variwideChart()).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.MOSAIC);
    expect(layer.title).toBe('GDP');
    expect(layer.orientation).toBe(Orientation.VERTICAL);
  });

  it('carries the height on y and the drawn width as a share', () => {
    const total = 5.4 + 83.2 + 38.0 + 10.7;

    expect(cells(variwideChart())).toEqual([
      { x: 'Norway', y: 42, z: 'GDP', width: 5.4 / total },
      { x: 'Germany', y: 39, z: 'GDP', width: 83.2 / total },
      { x: 'Poland', y: 27, z: 'GDP', width: 38.0 / total },
      { x: 'Greece', y: 20, z: 'GDP', width: 10.7 / total },
    ]);
  });

  it('reports shares that match the widths Highcharts drew', () => {
    // The measured table at the top of this file, to three decimal places —
    // the arithmetic above restated as the pixels a sighted reader saw, so a
    // converter that quietly changed its definition of "share" fails here
    // rather than passing on its own terms.
    const shares = cells(variwideChart()).map(cell =>
      Number((cell.width as number).toFixed(3)));

    expect(shares).toEqual([0.039, 0.606, 0.277, 0.078]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 2);
  });

  it('does not announce a width magnitude as a count', () => {
    // A mosaic is usually drawn from a contingency table, but a variwide's `z`
    // is any measure at all — population, revenue, hours. "Count 83.2" for a
    // chart of millions of people is a number the data does not contain.
    for (const cell of cells(variwideChart())) {
      expect(cell.count).toBeUndefined();
    }
  });

  it('names the axes the chart named them', () => {
    const layer = highchartsToMaidr(variwideChart()).subplots[0][0].layers[0];

    expect(layer.axes).toEqual({
      x: { label: 'Country' },
      y: { label: 'GDP per capita' },
    });
  });

  it('highlights each column through the bar selector', () => {
    // Measured: a variwide column is a `path.highcharts-point` inside its own
    // `.highcharts-series-0`, one per drawn column, in declaration order —
    // which is what `barSelector` already resolves.
    const layer = highchartsToMaidr(variwideChart()).subplots[0][0].layers[0];

    expect(layer.selectors).toBe(
      '#variwide-chart .highcharts-series-group .highcharts-series-0 .highcharts-point',
    );
  });

  it('drops a column the chart did not draw', () => {
    // Measured: a `y: null` point has no graphic at all, so three declared
    // columns render two elements. Keeping the gap would hand the third
    // column the second column's path and highlight the wrong bar.
    const gappy = cells(variwideChart([
      { name: 'A', y: 10, z: 4 },
      { name: 'B', y: null, z: 6 },
      { name: 'C', y: 30, z: 10 },
    ]));

    expect(gappy.map(cell => cell.x)).toEqual(['A', 'C']);
    // The dropped column takes its width out of the total too: the chart
    // Highcharts drew has two columns in it, and they are 4/20 and 10/20 of
    // the plot rather than 4/14 and 10/14.
    expect(gappy.map(cell => cell.width)).toEqual([4 / 20, 10 / 20]);
  });

  it('keeps a column of zero height, which is drawn', () => {
    // The other half of the rule above. A `y: 0` column is drawn at full
    // width and no height — it is on the page, so it is in the reading, and
    // dropping it would shift every later highlight.
    const flat = cells(variwideChart([
      { name: 'A', y: 10, z: 4 },
      { name: 'B', y: 0, z: 6 },
      { name: 'C', y: 30, z: 10 },
    ]));

    expect(flat.map(cell => cell.x)).toEqual(['A', 'B', 'C']);
    expect(flat[1]).toEqual({ x: 'B', y: 0, z: 'GDP', width: 6 / 20 });
  });

  it('reports no share when one column declares no width', () => {
    // Measured: a single point without `z` collapses the WHOLE series to
    // 0x0 — Highcharts sizes all the columns or none of them. Shares over
    // the survivors would announce a chart that was never drawn.
    const unsized = cells(variwideChart([
      { name: 'A', y: 10, z: 4 },
      { name: 'B', y: 20 },
      { name: 'C', y: 30, z: 10 },
    ]));

    expect(unsized).toEqual([
      { x: 'A', y: 10, z: 'GDP' },
      { x: 'B', y: 20, z: 'GDP' },
      { x: 'C', y: 30, z: 'GDP' },
    ]);
  });

  it('reports no share when every width is zero', () => {
    // Same chart arrived at differently — every column drew at 0x0 — and
    // 0/0 would announce each of them as NaN% of the whole.
    expect(cells(variwideChart([
      { name: 'A', y: 10, z: 0 },
      { name: 'B', y: 20, z: 0 },
    ]))).toEqual([
      { x: 'A', y: 10, z: 'GDP' },
      { x: 'B', y: 20, z: 'GDP' },
    ]);
  });

  it('reads a zero width beside real ones as the nothing it is drawn at', () => {
    // Not the same as the case above: measured, a lone `z: 0` beside
    // z = 4 and z = 10 still draws — at 1px, the thinnest mark Highcharts
    // makes — so the column is on the page and its share really is none of
    // the chart.
    const cell = cells(variwideChart([
      { name: 'A', y: 10, z: 4 },
      { name: 'B', y: 20, z: 0 },
      { name: 'C', y: 30, z: 10 },
    ]))[1];

    expect(cell).toEqual({ x: 'B', y: 20, z: 'GDP', width: 0 });
  });

  it('lays an inverted variwide across the page', () => {
    // Measured: variwide honours `chart.inverted`, drawing the same four
    // columns sideways at the same shares. A horizontal layer carries its
    // category on `y` and its magnitude on `x`, and the axis labels swap
    // with them — the reading `MosaicTrace` already has for either drawing.
    const inverted = highchartsToMaidr(variwideChart(GDP, { inverted: true }));
    const layer = inverted.subplots[0][0].layers[0];

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({
      x: { label: 'GDP per capita' },
      y: { label: 'Country' },
    });
    expect((layer.data as MosaicPoint[][])[0][1]).toEqual({
      x: 39,
      y: 'Germany',
      z: 'GDP',
      width: 83.2 / (5.4 + 83.2 + 38.0 + 10.7),
    });
  });

  it('gives two variwide series a mosaic each', () => {
    // Measured: two variwide series on one chart are drawn side by side, each
    // sizing its own columns from its own `z` total — series totals of 4 and
    // 6 gave each series its own widths. Folding them into shared mosaic
    // columns would report shares of a total no column was drawn against.
    const chart = fakeChart({
      type: 'variwide',
      renderToId: 'two-variwide',
      series: [
        fakeSeries({
          index: 0,
          type: 'variwide',
          name: 'one',
          data: [{ x: 0, y: 10, z: 1, name: 'A' }, { x: 1, y: 20, z: 3, name: 'B' }],
        }),
        fakeSeries({
          index: 1,
          type: 'variwide',
          name: 'two',
          data: [{ x: 0, y: 5, z: 2, name: 'A' }, { x: 1, y: 15, z: 4, name: 'B' }],
        }),
      ],
    });

    const layers = highchartsToMaidr(chart).subplots[0][0].layers;

    expect(layers.map(layer => layer.type)).toEqual([
      TraceType.MOSAIC,
      TraceType.MOSAIC,
    ]);
    expect((layers[0].data as MosaicPoint[][])[0].map(c => c.width))
      .toEqual([1 / 4, 3 / 4]);
    expect((layers[1].data as MosaicPoint[][])[0].map(c => c.width))
      .toEqual([2 / 6, 4 / 6]);
    expect(layers.map(layer => layer.selectors)).toEqual([
      '#two-variwide .highcharts-series-group .highcharts-series-0 .highcharts-point',
      '#two-variwide .highcharts-series-group .highcharts-series-1 .highcharts-point',
    ]);
  });
});
