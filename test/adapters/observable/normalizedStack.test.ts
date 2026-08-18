/**
 * A 100% stacked chart has to say it is one (#1080).
 *
 * `Plot.stackY({ offset: 'normalize' })` divides before it draws, so the values
 * the adapter recovers out of the pixels are already shares. Read as an
 * ordinary stack, two things are lost: the reader is never told the columns are
 * parts of a whole, and the numbers announced are fractions of one where every
 * other 100% chart MAIDR reads announces percentages. This is the fifth chart
 * in that family, after Recharts (#963), Vega-Lite (#965), amCharts (#967) and
 * Frappe (#1065).
 *
 * The test is on the values rather than on the y scale. A domain of exactly
 * `[0, 1]` is the obvious signal and is the wrong one: an author who widens it
 * for headroom draws a 100% chart the domain test misses. Summing the columns
 * catches that chart, and it needs no second signal.
 */

import type { LinePoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layerOf(key: Parameters<typeof mountFixture>[0]): MaidrLayer {
  const { element } = mountFixture(key);
  const maidr = observablePlotToMaidr(element);
  if (!maidr)
    throw new Error(`fixture "${String(key)}" produced no schema`);
  return maidr.subplots[0][0].layers[0];
}

describe('a 100% stacked bar', () => {
  it('is read as normalized rather than as an ordinary stack', () => {
    expect(layerOf('normalizedBar').type).toBe(TraceType.NORMALIZED);
  });

  it('announces the shares as percentages, not as fractions of one', () => {
    // Drawn from Mon a=3 b=1 and Tue a=2 b=6, so the columns are 75/25 and
    // 25/75. Plot has already divided; what is added here is the hundred.
    const rows = layerOf('normalizedBar').data as SegmentedPoint[][];

    expect(rows.map(row => row.map(point => point.y))).toEqual([[75, 25], [25, 75]]);
    expect(rows.map(row => row.map(point => point.x))).toEqual([['Mon', 'Tue'], ['Mon', 'Tue']]);
  });

  it('names the bands so a reader knows which share is which', () => {
    const rows = layerOf('normalizedBar').data as SegmentedPoint[][];

    expect(rows.map(row => row[0].z)).toEqual(['a', 'b']);
  });

  it('reads a chart whose author widened the axis for headroom', () => {
    // `y: {domain: [0, 1.2]}`. The columns still add to one, but the domain is
    // not [0, 1] and no column spans the frame — so a scale-based test would
    // call this an ordinary stack and announce 0.75.
    const layer = layerOf('normalizedBarHeadroom');

    expect(layer.type).toBe(TraceType.NORMALIZED);
    expect((layer.data as SegmentedPoint[][]).map(row => row.map(point => point.y)))
      .toEqual([[75, 25], [25, 75]]);
  });

  it('reads a horizontal 100% bar off the axis its shares run along', () => {
    // `Plot.barX` + `stackX`, so the magnitude is on x and the category on y.
    // Summing the wrong field would add up category names.
    const layer = layerOf('horizontalNormalizedBar');

    expect(layer.type).toBe(TraceType.NORMALIZED);
    expect((layer.data as SegmentedPoint[][]).map(row => row.map(point => point.x)))
      .toEqual([[75, 25], [25, 75]]);
  });

  it('leaves an ordinary stack alone', () => {
    // The same shape drawn without the transform: columns of 4 and 8, which
    // are counts and stay counts.
    const layer = layerOf('stacked');

    expect(layer.type).toBe(TraceType.STACKED);
  });
});

describe('a 100% stacked area', () => {
  it('is read as normalized, with its bands as percentages', () => {
    const layer = layerOf('normalizedArea');

    expect(layer.type).toBe(TraceType.NORMALIZED_AREA);
    // Two bands over two samples: a is 3 of 4 then 2 of 8, b is the rest.
    expect((layer.data as LinePoint[][]).map(band => band.map(point => point.y)))
      .toEqual([[75, 25], [25, 75]]);
  });
});
