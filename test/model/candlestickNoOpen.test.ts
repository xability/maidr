import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import {
  BEARISH_POINT_MODE,
  BULLISH_POINT_MODE,
  Candlestick,
  CANDLESTICK_SECTIONS,
  candlestickSectionsOf,
  NEUTRAL_POINT_MODE,
} from '@model/candlestick';
import { TraceType } from '@type/grammar';

/**
 * A price chart drawn without an opening price (#1188).
 *
 * Highcharts registers three price series and only two of them carry an
 * open: `candlestick` and `ohlc` do, and `hlc` draws the same high, low and
 * close without one. `CandlestickPoint.open` was required, so that chart
 * could not be expressed at all — the adapter declined it rather than emit a
 * layer of zero points.
 *
 * The absence removes more than a row. The **body** is what an open makes,
 * so a candle without one has no bullish/bearish/neutral trend, no shape,
 * and no pattern with its neighbours — every one of those is a statement
 * about the body. What this file pins is that all of them go together, and
 * that none of them is announced empty instead.
 */

/** A candle with no opening price, as an `hlc` series hands one over. */
function priced(value: string, high: number, low: number, close: number): CandlestickPoint {
  return { value, high, low, close, volume: 100, volatility: high - low };
}

/** The same candle with an open, for the side-by-side comparisons. */
function opened(value: string, open: number, close: number): CandlestickPoint {
  const high = Math.max(open, close) + 1;
  const low = Math.min(open, close) - 1;
  return { value, open, high, low, close, volume: 100, volatility: high - low };
}

/** The braille rows of a trace, through the public state as tests must. */
function brailleRows(trace: Candlestick): number[][] {
  const state = trace.state;
  if (state.empty || state.braille.empty) {
    throw new Error('expected a braille state');
  }
  return (state.braille as { values: number[][] }).values;
}

function layerOf(data: CandlestickPoint[]): MaidrLayer {
  return {
    id: 'price-layer',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Date' }, y: { label: 'Price' } },
    data,
  };
}

const WITHOUT_OPEN = [
  priced('2026-01-01', 5, 1, 3),
  priced('2026-01-02', 7, 2, 6),
  priced('2026-01-03', 6, 3, 4),
];

const WITH_OPEN = [
  opened('2026-01-01', 10, 14),
  opened('2026-01-02', 14, 12),
  opened('2026-01-03', 12, 12),
];

describe('a candlestick trace whose chart records no opening price', () => {
  test('drops the open row rather than announcing an empty one', () => {
    const trace = new Candlestick(layerOf(WITHOUT_OPEN));

    // Four rows, not five: the braille grid and the section walk are both
    // built from this, so a row that could say nothing would be a row the
    // reader can navigate into and get silence from.
    expect(brailleRows(trace)).toHaveLength(4);
    expect(brailleRows(trace)[0]).toHaveLength(WITHOUT_OPEN.length);
    expect(CANDLESTICK_SECTIONS).toContain('open');
  });

  test('keeps all five rows where the chart does record one', () => {
    expect(brailleRows(new Candlestick(layerOf(WITH_OPEN)))).toHaveLength(5);
  });

  test('offers no trend rotor unit, rather than one that cannot advance', () => {
    const labels = new Candlestick(layerOf(WITHOUT_OPEN))
      .getRotorFilterUnits()
      .map(unit => unit.label);

    // A rotor unit for a trend no candle has is a cycle the reader can enter
    // and never leave — the keyboard trap `extremaContract.test.ts` exists
    // for. With no body there is no trend at all, so none of the three is
    // offered.
    expect(labels).not.toContain(BULLISH_POINT_MODE);
    expect(labels).not.toContain(BEARISH_POINT_MODE);
    expect(labels).not.toContain(NEUTRAL_POINT_MODE);
  });

  test('still offers them where the chart has bodies', () => {
    const labels = new Candlestick(layerOf(WITH_OPEN))
      .getRotorFilterUnits()
      .map(unit => unit.label);

    expect(labels).toContain(BULLISH_POINT_MODE);
    expect(labels).toContain(BEARISH_POINT_MODE);
    expect(labels).toContain(NEUTRAL_POINT_MODE);
  });

  test('announces no trend and no body-derived aside', () => {
    const state = new Candlestick(layerOf(WITHOUT_OPEN)).state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    const text = state.text;

    // `z` carries the trend. Announcing it empty would put "trend" into
    // every reading with nothing after it; a doji, a hammer and an engulfing
    // are each a statement about a body, so they go with it.
    expect(text.z).toBeUndefined();
    expect(text.asides).toBeUndefined();
  });

  test('leaves the trend and the asides alone where there is a body', () => {
    const state = new Candlestick(layerOf(WITH_OPEN)).state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }
    const text = state.text;

    expect(text.z).toEqual({ label: 'trend', value: 'Bull' });
  });

  test('leaves the trend columns out of the data table', () => {
    const description = new Candlestick(layerOf(WITHOUT_OPEN)).description;

    expect(description.dataTable.headers).toEqual([
      'Date',
      'High',
      'Low',
      'Close',
      'Volume',
    ]);
    // "Bull count 0" says the chart rose on no day, which is a finding. The
    // truth is that it never said.
    expect(description.stats?.map(stat => stat.label)).not.toContain('Bull count');
  });

  test('reads every price it does have', () => {
    const rows = brailleRows(new Candlestick(layerOf(WITHOUT_OPEN)));

    // Rows are volatility, high, low, close — the four the chart draws.
    expect(rows).toEqual([
      [4, 5, 3],
      [5, 7, 6],
      [1, 2, 3],
      [3, 6, 4],
    ]);
  });
});

describe('what a chart without an open lets a reader reach', () => {
  /** The `section` announced at each stop of a full walk down the segments. */
  function walk(trace: Candlestick): string[] {
    const seen: string[] = [];
    for (let step = 0; step < 8; step++) {
      const state = trace.state;
      if (state.empty) {
        break;
      }
      seen.push(String(state.text.section));
      if (!trace.moveOnce('DOWNWARD')) {
        break;
      }
    }
    return seen;
  }

  test('never names a segment the chart does not draw', () => {
    // `precomputeSortedSegments` builds the navigation order separately from
    // `sections`, so the two can disagree. Left including `open`, the reader
    // arrives at a segment announced as the opening price whose value is the
    // close — a price under the wrong name, which is worse than one row
    // fewer.
    expect(walk(new Candlestick(layerOf(WITHOUT_OPEN)))).not.toContain('open');
  });

  test('still names it where the chart draws one', () => {
    expect(walk(new Candlestick(layerOf(WITH_OPEN)))).toContain('open');
  });

  test('shades the braille with no trend markers', () => {
    const state = new Candlestick(layerOf(WITHOUT_OPEN)).state;
    if (state.empty || state.braille.empty) {
      throw new Error('expected a braille state');
    }

    // `custom` carries one trend per candle for the braille shading. Left
    // alone it would be a row of `undefined` — the absence spelled out
    // rather than the row simply not being shaded.
    //
    // `toStrictEqual`, not `toEqual`: the latter ignores `undefined` array
    // items, so `[undefined, undefined, undefined]` passes as `[]` and the
    // difference this test exists for is invisible to it.
    expect(state.braille.custom).toStrictEqual([]);
  });

  test('shades it where the chart has bodies', () => {
    const state = new Candlestick(layerOf(WITH_OPEN)).state;
    if (state.empty || state.braille.empty) {
      throw new Error('expected a braille state');
    }

    expect(state.braille.custom).toEqual(['Bull', 'Bear', 'Neutral']);
  });
});

describe('the sections one chart has', () => {
  test('is the superset where every candle records an open', () => {
    expect(candlestickSectionsOf(WITH_OPEN)).toEqual([...CANDLESTICK_SECTIONS]);
  });

  test('drops the open row where none does', () => {
    expect(candlestickSectionsOf(WITHOUT_OPEN)).toEqual([
      'volatility',
      'high',
      'low',
      'close',
    ]);
  });

  test('drops it where only some candles record one', () => {
    // The rows are a property of the chart, since the values form a
    // rectangular grid — an open is a row only if every candle can fill it.
    // A series stating one for some periods and not others is read as the
    // high-low-close it can be read as throughout.
    expect(candlestickSectionsOf([...WITHOUT_OPEN, ...WITH_OPEN]))
      .not
      .toContain('open');
  });

  test('puts close on a different row depending on the chart', () => {
    // The reason this function exists rather than two rules. `LiveDataService`
    // resolves the row to announce a streamed candle on, and reading it off
    // the superset put `close` at 4 — past the last row a chart with no open
    // has (#1188).
    expect(candlestickSectionsOf(WITH_OPEN).indexOf('close')).toBe(4);
    expect(candlestickSectionsOf(WITHOUT_OPEN).indexOf('close')).toBe(3);
    expect(CANDLESTICK_SECTIONS.indexOf('close')).toBe(4);
  });

  test('has nothing to say about a chart with no candles', () => {
    // `every` is vacuously true on an empty list, so the emptiness is asked
    // outright: an open cannot be a row of a chart that has no rows.
    expect(candlestickSectionsOf([])).not.toContain('open');
  });
});
