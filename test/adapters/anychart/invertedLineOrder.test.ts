/**
 * An AnyChart line on an inverted ordinal scale (#1035).
 *
 * The line half of #1021, which turned the bar family round and left this one:
 * a bar names each mark with its own stamped attribute, so its selector list
 * could be permuted, while a line is named by one prefix covering every marker
 * of the series. #1026 gave the grammar `domMapping.pointOrder` for exactly
 * that case, so the layer declares the direction and `LineTrace` reverses the
 * elements it resolved.
 *
 * Measured against the real library in Chromium, `anychart.line` over
 * `Sat, Sun, Thu, Fri`, resolving the emitted selector against the live DOM:
 *
 *   plain             payload  Sat, Sun, Thu, Fri     marks x  213, 367, 521, 675
 *   xScale.inverted   payload  Sat, Sun, Thu, Fri     marks x  675, 521, 367, 213
 *
 * The markers are stamped in data order either way and the drawing is
 * reversed, so the written payload announced the chart backwards. After the
 * fix the same run reads
 *
 *   xScale.inverted   payload  Fri, Thu, Sun, Sat     pointOrder  reverse
 *
 * and reversing the resolved marks pairs `Fri` with x=213, the leftmost.
 */
import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { anyChartToMaidr } from '@adapters/anychart/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/** The categories in the order they are written. */
const LISTED = ['Sat', 'Sun', 'Thu', 'Fri'];
/** The same categories in the order an inverted scale draws them. */
const DRAWN = ['Fri', 'Thu', 'Sun', 'Sat'];

const ROWS: Array<[string, number]> = [['Sat', 87], ['Sun', 76], ['Thu', 62], ['Fri', 19]];

/**
 * An iterator over mock rows, in AnyChart's own shape.
 * @param rows - The rows to walk
 * @returns The iterator
 */
function createIterator(rows: Array<Record<string, unknown>>): AnyChartIterator {
  let index = -1;
  return {
    advance: () => ++index < rows.length,
    get: (field: string) => rows[index]?.[field],
    getIndex: () => index,
    getRowsCount: () => rows.length,
    reset: () => {
      index = -1;
    },
  };
}

/**
 * A drawn series of the given kind.
 * @param seriesType - What `seriesType()` answers
 * @returns The series
 */
function createSeries(seriesType: string): AnyChartSeries {
  return {
    id: () => 0,
    name: () => seriesType,
    seriesType: () => seriesType,
    getIterator: () => createIterator(ROWS.map(([x, value]) => ({ x, value }))),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

/**
 * The single layer a chart converts to.
 * @param options - What the chart declares
 * @param options.seriesType - The AnyChart series type to draw
 * @param options.xInverted - What `xScale().inverted()` answers
 * @returns The emitted layer
 */
function layerFor(options: {
  seriesType?: string;
  xInverted?: boolean;
} = {}): MaidrLayer {
  const series = [createSeries(options.seriesType ?? 'line')];
  const chart = {
    title: () => 'Tips',
    container: () => '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    xScale: () => ({ getType: () => 'ordinal', inverted: () => options.xInverted === true }),
    yScale: () => ({ inverted: () => false }),
  } as unknown as AnyChartInstance;

  const maidr = anyChartToMaidr(chart, { id: 'ac', title: 'Tips' });
  const layer = maidr?.subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('expected one layer');
  }
  return layer;
}

/**
 * The categories one layer announces, in the order it announces them.
 * @param layer - The emitted layer
 * @returns The `x` of every point of the first series
 */
function categoriesOf(layer: MaidrLayer): (string | number)[] {
  return (layer.data as LinePoint[][])[0].map(point => point.x);
}

describe('an anychart line on an inverted scale', () => {
  it('reads a plain chart in the order it was written', () => {
    const layer = layerFor();

    expect(layer.type).toBe(TraceType.LINE);
    expect(categoriesOf(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads an inverted chart in the order it is drawn', () => {
    expect(categoriesOf(layerFor({ xInverted: true }))).toEqual(DRAWN);
  });

  it('tells the trace its marks run the other way', () => {
    // One prefix names every marker of the series, so there is no selector
    // list to permute -- the pairing moves in the trace instead.
    expect(layerFor({ xInverted: true }).domMapping?.pointOrder).toBe('reverse');
  });

  it('keeps every value with its own category', () => {
    const series = (layerFor({ xInverted: true }).data as LinePoint[][])[0];

    expect(series).toEqual([
      { x: 'Fri', y: 19 },
      { x: 'Thu', y: 62 },
      { x: 'Sun', y: 76 },
      { x: 'Sat', y: 87 },
    ]);
  });

  it('turns a band round too', () => {
    const layer = layerFor({ seriesType: 'area', xInverted: true });

    expect(layer.type).toBe(TraceType.AREA);
    expect(categoriesOf(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns a staircase round too', () => {
    const layer = layerFor({ seriesType: 'step-line', xInverted: true });

    expect(layer.type).toBe(TraceType.STEP);
    expect(categoriesOf(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns a spline round, being a line with a curve', () => {
    const layer = layerFor({ seriesType: 'spline', xInverted: true });

    expect(layer.type).toBe(TraceType.LINE);
    expect(categoriesOf(layer)).toEqual(DRAWN);
  });
});
