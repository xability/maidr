import type { CandlestickDeltaCandle } from '@model/candlestickDelta';
import type {
  CandlestickPoint,
  GaugePoint,
  HistogramPoint,
  LinePoint,
  MaidrLayer,
} from '@type/grammar';
import type { DescriptionState, NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { CandlestickDeltaTrace } from '@model/candlestickDelta';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Range stats read `constant x` where the axis never moves (#1136).
 *
 * `${min} to ${max}` is true and uninformative when the two are the same
 * number: the reader is told a range and handed a point. #1134 fixed the
 * scatter trace, where a rug plot printed `Y range: 0 to 0`; the same
 * expression stood in five more description stats, and two of them reach the
 * degenerate case on ordinary data rather than contrived data.
 *
 * `MathUtil.spanned` is the one place that decides it now, so a sixth site
 * added tomorrow gets the answer by calling it. What these cases hold is that
 * each trace actually routes through it -- the helper being right is not the
 * same as the trace using it, and that gap is what the direct
 * `${min} to ${max}` was.
 */

/**
 * The value of one named stat in a trace's description.
 *
 * @param layer - The layer to build a trace from
 * @param label - The stat to read
 * @returns The stat's value, or undefined when the description has no such stat
 */
function statOf(layer: MaidrLayer, label: string): string | number | undefined {
  const trace = TraceFactory.create(layer) as unknown as { description: DescriptionState };
  return trace.description.stats?.find(stat => stat.label === label)?.value;
}

describe('a stat for an axis that never moves', () => {
  test('names a parallel coordinates column that does not vary', () => {
    // The most ordinary of the set, and the one where the reading is a
    // finding rather than a curiosity: a constant column on a parallel plot
    // is exactly what a reader wants to be told, because every line crosses
    // it at the same height and the axis separates nothing.
    const data: LinePoint[][] = [
      [{ x: 'mpg', y: 33, z: 'A' }, { x: 'cyl', y: 4, z: 'A' }],
      [{ x: 'mpg', y: 21, z: 'B' }, { x: 'cyl', y: 4, z: 'B' }],
      [{ x: 'mpg', y: 15, z: 'C' }, { x: 'cyl', y: 4, z: 'C' }],
    ];
    const layer: MaidrLayer = {
      id: 'parallel',
      type: TraceType.PARALLEL,
      title: 'Cars',
      axes: { x: { label: 'Variable' }, y: { label: 'Value' } },
      data,
    };

    expect(statOf(layer, 'cyl')).toBe('constant 4');
    // The varying column on the same chart is untouched, so this is a fact
    // about the axis rather than about the trace type.
    expect(statOf(layer, 'mpg')).toBe('15 to 33');
  });

  test('names a histogram whose observations all fall in one bin', () => {
    const layer = {
      id: 'histogram',
      type: TraceType.HISTOGRAM,
      title: 'One bin',
      axes: { x: { label: 'Value' }, y: { label: 'Count' } },
      data: [
        { x: 5, y: 12, xMin: 5, xMax: 5, yMin: 0, yMax: 12 },
      ] as HistogramPoint[],
    } as unknown as MaidrLayer;

    expect(statOf(layer, 'Bin range')).toBe('constant 5');
  });

  test('names a flat gauge scale on every move, not only in the description', () => {
    // A gauge carries its dial's ends in the text state's `z`, which is read
    // out on every move -- so this is the more consequential of the trace's
    // two `Range` readings, and the one a description-only test misses. A
    // mutation aimed at the description stat matched this line first and
    // survived, which is how the gap showed up.
    const data: GaugePoint = {
      label: 'Conversion',
      value: 40,
      min: 40,
      max: 40,
      target: 40,
      bands: [{ to: 40, label: 'flat' }],
    };
    const layer: MaidrLayer = {
      id: 'gauge',
      type: TraceType.GAUGE,
      title: 'Conversion rate',
      axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
      data,
    };

    const trace = TraceFactory.create(layer);
    const state = trace.state as NonEmptyTraceState;
    expect(state.text.z).toEqual({ label: 'Range', value: 'constant 40' });
  });

  test('names a gauge whose scale has no width', () => {
    const data: GaugePoint = {
      label: 'Conversion',
      value: 40,
      min: 40,
      max: 40,
      target: 40,
      bands: [{ to: 40, label: 'flat' }],
    };
    const layer: MaidrLayer = {
      id: 'gauge',
      type: TraceType.GAUGE,
      title: 'Conversion rate',
      axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
      data,
    };

    expect(statOf(layer, 'Range')).toBe('constant 40');
  });

  test('names a series that never left its reference line', () => {
    // Every delta is zero, so the delta range genuinely has no width -- and
    // unlike the candlestick's own price range, this one is reachable on
    // ordinary data: a series tracking its moving average exactly.
    const flat: CandlestickDeltaCandle[] = [
      { x: 'mon', reference: 10, open: 10, high: 10, low: 10, close: 10 },
      { x: 'tue', reference: 10, open: 10, high: 10, low: 10, close: 10 },
    ];
    const layer: MaidrLayer = {
      id: 'delta',
      type: TraceType.CANDLESTICK_DELTA,
      title: 'Price vs MA',
      axes: { x: { label: 'Date' }, y: { label: 'Price delta' } },
      data: [],
    };
    const trace = new CandlestickDeltaTrace(layer, {
      candles: flat,
      referenceLabel: 'Moving Average',
      initialField: 'close',
    });

    expect(
      trace.description.stats?.find(s => s.label === 'Delta range')?.value,
    ).toBe('constant 0');
  });

  test('leaves a candlestick range that really is a range alone', () => {
    // The guard on the whole change: it fires only where the current text was
    // uninformative, so nothing that reads correctly today reads differently.
    //
    // `CandlestickTrace` is deliberately NOT routed through the helper, and
    // this case records why rather than leaving the omission to look like an
    // oversight. `this.min`/`this.max` span the `volatility` section as well
    // as the four prices, and volatility is a difference -- so the only chart
    // where all five agree is one whose every price is zero. A change there
    // could not alter any reading, and a mutation reverting it survived every
    // test, which is the same fact from the other side.
    //
    // Separately, and noted on #1136: the stat is labelled `Price range`
    // while ranging over a quantity that is not a price.
    const moving: CandlestickPoint[] = [
      {
        value: 'mon',
        open: 10,
        high: 14,
        low: 9,
        close: 13,
        trend: 'Bull',
        volatility: 5,
      },
      {
        value: 'tue',
        open: 13,
        high: 18,
        low: 12,
        close: 17,
        trend: 'Bull',
        volatility: 6,
      },
    ];
    const layer: MaidrLayer = {
      id: 'candles',
      type: TraceType.CANDLESTICK,
      title: 'A busy week',
      axes: { x: { label: 'Day' }, y: { label: 'Price' } },
      data: moving,
    };

    expect(statOf(layer, 'Price range')).toContain(' to ');
  });

  test('leaves a gauge scale with width alone', () => {
    const data: GaugePoint = {
      label: 'Conversion',
      value: 73,
      min: 0,
      max: 100,
      target: 80,
      bands: [{ to: 100, label: 'all' }],
    };
    const layer: MaidrLayer = {
      id: 'gauge',
      type: TraceType.GAUGE,
      title: 'Conversion rate',
      axes: { x: { label: 'Measure' }, y: { label: 'Percent' } },
      data,
    };

    expect(statOf(layer, 'Range')).toBe('0 to 100');
  });
});
