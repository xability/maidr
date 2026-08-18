/**
 * @jest-environment jsdom
 */
/**
 * A Recharts line or area on a reversed category axis (#1031).
 *
 * #1023 fixed the bar half of #1017 and left this one, because a line's
 * pairing was #1007's open question. #1026 answered it: `domMapping.
 * pointOrder` is how a layer says its marks run opposite to its payload, and
 * `LineTrace` reverses the elements it resolved to pair the two back up.
 *
 * Measured under `npm run dev:recharts` in Chromium, with `reversed` added to
 * the line example's `<XAxis>` and nothing else changed. Twelve months, read
 * off the live DOM:
 *
 *   .recharts-line-dot in DOM order, x:  847, 799, 751, …, 365, 317
 *
 * The dots descend in x, so the DOM is in data order and the drawing runs
 * right to left -- the same relationship #1017 measured for the bars. After
 * the reversal the pairing comes out
 *
 *   317, 365, 413, …, 847     ASCENDING
 *
 * so `data[0]`, the point a reader lands on, is the leftmost mark.
 *
 * A line names its marks with one class for the whole series, so there is no
 * per-point selector to permute the way #1023 permutes a bar's -- which is
 * why this half needed the grammar affordance and the bar half did not.
 */
import type { LinePoint } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';

/** The categories in the order they are written. */
const LISTED = ['Q1', 'Q2', 'Q3', 'Q4'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['Q4', 'Q3', 'Q2', 'Q1'];

const DATA = LISTED.map((quarter, i) => ({
  quarter,
  revenue: (i + 1) * 100,
  cost: (i + 1) * 10,
}));

/** A layer as the adapter emits it, in the shape these cases read. */
interface EmittedLayer {
  type: string;
  selectors?: string | string[];
  domMapping?: { pointOrder?: string };
  data: unknown;
}

/**
 * The single layer a chart config converts to.
 *
 * @param options - What the chart declares
 * @param options.chartType - The Recharts chart type
 * @param options.reversed - Whether the category axis is reversed
 * @param options.yKeys - The series to draw, defaulting to one
 * @param options.selectorOverride - A caller's own selector
 * @returns The emitted layer
 */
function layerFor(options: {
  chartType: 'line' | 'area' | 'stacked_area' | 'bump' | 'radar' | 'bar';
  reversed?: boolean;
  yKeys?: string[];
  selectorOverride?: string;
}): EmittedLayer {
  const maidr = convertRechartsToMaidr({
    id: 'rc',
    title: 'Revenue',
    data: DATA,
    chartType: options.chartType,
    xKey: 'quarter',
    yKeys: options.yKeys ?? ['revenue'],
    ...(options.reversed ? { categoryAxisReversed: true } : {}),
    ...(options.selectorOverride ? { selectorOverride: options.selectorOverride } : {}),
  });
  return maidr.subplots[0][0].layers[0] as unknown as EmittedLayer;
}

/**
 * The categories one series announces, in the order it announces them.
 *
 * @param layer - The emitted layer
 * @param row - Which series
 * @returns The `x` of every point
 */
function categoriesOf(layer: EmittedLayer, row = 0): (string | number)[] {
  return (layer.data as LinePoint[][])[row].map(point => point.x);
}

describe('a recharts line on a reversed category axis', () => {
  it('reads a plain chart in the order it was written', () => {
    const layer = layerFor({ chartType: 'line' });

    expect(categoriesOf(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('reads a reversed chart in the order it is drawn', () => {
    expect(categoriesOf(layerFor({ chartType: 'line', reversed: true }))).toEqual(DRAWN);
  });

  it('tells the trace its marks run the other way', () => {
    // Without this the reversed payload would outline the far end of the
    // series -- a worse defect than the direction it fixes (#988, #1024).
    expect(layerFor({ chartType: 'line', reversed: true }).domMapping?.pointOrder)
      .toBe('reverse');
  });

  it('keeps every value with its own category', () => {
    const series = (layerFor({ chartType: 'line', reversed: true }).data as LinePoint[][])[0];

    expect(series).toEqual([
      { x: 'Q4', y: 400 },
      { x: 'Q3', y: 300 },
      { x: 'Q2', y: 200 },
      { x: 'Q1', y: 100 },
    ]);
  });

  it('leaves the one selector a line carries alone', () => {
    // One class names every dot of the series, so there is nothing to
    // permute -- the pairing moves in the trace instead.
    const plain = layerFor({ chartType: 'line' });
    const reversed = layerFor({ chartType: 'line', reversed: true });

    expect(reversed.selectors).toEqual(plain.selectors);
  });
});

describe('the rest of the family', () => {
  it('turns a band round with its line', () => {
    const layer = layerFor({ chartType: 'area', reversed: true });

    expect(categoriesOf(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns a stacked band round', () => {
    const layer = layerFor({ chartType: 'stacked_area', reversed: true });

    expect(categoriesOf(layer)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });

  it('turns a bump chart round', () => {
    const layer = layerFor({ chartType: 'bump', reversed: true });

    expect(categoriesOf(layer)).toEqual(DRAWN);
  });

  it('turns every series of a multi-line layer round together', () => {
    const layer = layerFor({
      chartType: 'line',
      reversed: true,
      yKeys: ['revenue', 'cost'],
    });

    expect(categoriesOf(layer, 0)).toEqual(DRAWN);
    expect(categoriesOf(layer, 1)).toEqual(DRAWN);
    expect(layer.domMapping?.pointOrder).toBe('reverse');
  });
});

describe('what the reversal leaves alone', () => {
  it('leaves a radar alone, which has no category axis to reverse', () => {
    // A radar's spokes are laid out around a circle. There is no far end for
    // a reversed Cartesian axis to draw from.
    const layer = layerFor({ chartType: 'radar', reversed: true });

    expect(categoriesOf(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('leaves a caller\'s own selector unreversed', () => {
    // The order an override resolves in is not this adapter's to promise, so
    // declaring `reverse` over it could invert a pairing that was right.
    const layer = layerFor({
      chartType: 'line',
      reversed: true,
      selectorOverride: '.mine circle',
    });

    expect(categoriesOf(layer)).toEqual(LISTED);
    expect(layer.domMapping?.pointOrder).toBeUndefined();
  });

  it('still turns a bar chart round by its selectors', () => {
    // The bar half is #1023's and works differently: it permutes the
    // selectors rather than declaring an order. This says the line change
    // did not take it over.
    const layer = layerFor({ chartType: 'bar', reversed: true });

    expect(layer.domMapping?.pointOrder).toBeUndefined();
    expect(Array.isArray(layer.selectors)).toBe(true);
    expect((layer.selectors as string[])).toHaveLength(4);
  });
});
