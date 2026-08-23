import type { ErrorBarPoint, ScatterPoint } from '@type/grammar';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { TraceType } from '@type/grammar';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

/**
 * Series types the adapter drew nothing for (#1138).
 *
 * `convertSeries` dispatches on the series type and its `default:` warns and
 * returns `null`, so a series it does not name contributes no layer and the
 * chart reads as though it were not there. On a single-series chart that is
 * silence. Sixteen of Highcharts' types were in that position; these four
 * needed no new trace type, no new point shape and no convention decision --
 * each is a chart MAIDR already reads, drawn under a name this adapter did
 * not know.
 *
 * The other twelve are recorded on #1138 rather than here: four want a
 * judgement written down first (`bellcurve`, `pareto`, `timeline`,
 * `organization`), three have no honest reading at all (`venn`, `polygon`,
 * `vector`/`windbarb`/`flags`), and `variwide` is a mosaic, which is more
 * than a dispatch line.
 */

const CATEGORIES = ['a', 'b', 'c'];

/**
 * A one-series chart of the given type.
 *
 * @param type - The Highcharts series type to draw
 * @param data - The series' points
 * @returns The chart
 */
function chartOf(type: string, data: unknown[]): ReturnType<typeof fakeChart> {
  return fakeChart({
    title: 'Measured',
    renderToId: 'chart',
    series: [fakeSeries({
      index: 0,
      type,
      name: type,
      xAxis: fakeAxis({ categories: CATEGORIES }),
      yAxis: fakeAxis({ options: { title: { text: 'Value' } } }),
      data: data as never,
    })],
  });
}

/**
 * The layers a chart of the given type produces.
 *
 * @param type - The Highcharts series type to draw
 * @param data - The series' points
 * @returns The layers, which was an empty list for every type here
 */
function layersOf(type: string, data: unknown[]): { type: string; data: unknown }[] {
  const maidr = highchartsToMaidr(chartOf(type, data));
  return (maidr?.subplots?.[0]?.[0]?.layers ?? []) as never;
}

const SIZED = CATEGORIES.map((category, i) => ({
  x: i,
  category,
  y: (i + 1) * 10,
  z: i + 2,
}));
const BANDS = CATEGORIES.map((category, i) => ({
  x: i,
  category,
  low: i * 5,
  high: i * 5 + 8,
}));
const PLAIN = CATEGORIES.map((category, i) => ({
  x: i,
  category,
  y: (i + 1) * 10,
}));

describe('highcharts series the adapter did not reach', () => {
  it('reads a bubble as the scatter it is, keeping the marker size', () => {
    const [layer] = layersOf('bubble', SIZED);

    expect(layer.type).toBe(TraceType.SCATTER);
    // `z` is a third measured quantity, not decoration: `ScatterTrace` reads
    // it through `zIntensityFor()`, so the size is audible as well as
    // readable. Dropping it is the defect #826 fixed for Chart.js.
    expect((layer.data as ScatterPoint[]).map(p => p.z)).toEqual([2, 3, 4]);
    expect((layer.data as ScatterPoint[]).map(p => p.y)).toEqual([10, 20, 30]);
  });

  it('keeps an unsized bubble point rather than dropping it', () => {
    // A series that mixes sized and unsized markers keeps both; the unsized
    // one simply carries no third quantity. Filtering on `z` instead would
    // silently lose a drawn point.
    const mixed = [
      { x: 0, category: 'a', y: 10, z: 4 },
      { x: 1, category: 'b', y: 20 },
    ];
    const [layer] = layersOf('bubble', mixed);

    expect((layer.data as ScatterPoint[])).toHaveLength(2);
    expect((layer.data as ScatterPoint[])[1].z).toBeUndefined();
  });

  it('keeps a bubble on a category axis a scatter, and keeps the name', () => {
    // A plain scatter pinned to ticks reads as a dot plot, because it really
    // is one value per category. A bubble is not: it has two, and
    // `convertDotSeries` emits `BarPoint`s, which have nowhere to put the
    // second -- so a categorical bubble read as a dot would lose its size
    // silently, which is #826's defect wearing a different name.
    const [layer] = layersOf('bubble', SIZED);

    expect(layer.type).toBe(TraceType.SCATTER);
    // The category name is not the price of that: it travels as `xLabel`,
    // which is the field for "this position on x is called a".
    expect((layer.data as ScatterPoint[]).map(p => p.xLabel))
      .toEqual(CATEGORIES);
  });

  it('leaves a plain categorical scatter reading as the dot plot it is', () => {
    // The guard on the branch above: only `bubble` changed.
    const [layer] = layersOf('scatter', PLAIN);

    expect(layer.type).toBe(TraceType.DOT);
  });

  it('reads a columnrange as the band it draws', () => {
    const [layer] = layersOf('columnrange', BANDS);

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    const points = layer.data as ErrorBarPoint[];
    expect(points.map(p => [p.yMin, p.yMax])).toEqual([[0, 8], [5, 13], [10, 18]]);
    // No estimate to invent: a column drawn from low to high has no centre,
    // which is exactly what #1047 made expressible.
    expect(points.every(p => p.y === undefined)).toBe(true);
  });

  it.each(['columnpyramid', 'pictorial'])(
    'reads %s as the column it carries the data of',
    (type) => {
      // Same `point.y` per category as `column`; only the painting differs.
      const [layer] = layersOf(type, PLAIN);

      expect(layer.type).toBe(TraceType.BAR);
      expect((layer.data as { y: number }[]).map(p => p.y)).toEqual([10, 20, 30]);
    },
  );

  it('still declines a series with no statistical reading', () => {
    // The guard on the change: dispatching more types must not turn into
    // dispatching every type. A `venn` has no axis and a `polygon` has no
    // reading, so both stay declined rather than being forced into a shape.
    expect(layersOf('venn', PLAIN)).toHaveLength(0);
    expect(layersOf('polygon', PLAIN)).toHaveLength(0);
  });
});
