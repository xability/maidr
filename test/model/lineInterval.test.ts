/**
 * A fitted curve can now carry its own confidence band (#919).
 *
 * A band is the reason a smooth is drawn rather than a plain line — both
 * `geom_smooth(se = TRUE)` and `sns.regplot` default to one — and until now
 * `LineTrace` read neither bound, so a producer had nowhere to put it on the
 * layer that owns the curve.
 *
 * Carried on the sample rather than in a layer of its own, so a reader hears
 * the value and its interval at the same x. The comparison a band exists for
 * is whether the trend is distinguishable from flat, and that cannot be made
 * by navigating two layers in turn.
 */
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat, TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Build a line layer over the given samples.
 * @param data - The samples, one array per series
 * @param type - The trace type, defaulting to a plain line
 * @returns A layer definition
 */
function layer(data: LinePoint[][], type: TraceType = TraceType.LINE): MaidrLayer {
  return {
    id: 'interval-layer',
    type,
    title: 'Fit',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  } as MaidrLayer;
}

/**
 * The text state at the cursor, which is what carries the interval.
 * @param trace - The trace to read
 * @returns The text state
 */
function textOf(trace: ReturnType<typeof TraceFactory.create>): TextState {
  const state = trace.state as { empty: false; text: TextState };
  return state.text;
}

describe('a sample carrying an uncertainty band', () => {
  test('announces the interval alongside the value', () => {
    const trace = TraceFactory.create(
      layer([[{ x: 1, y: 3, yMin: 2, yMax: 4 }]]),
    );

    expect(textOf(trace).interval).toEqual({ min: 2, max: 4 });
    // The value is still there: the band is a second fact about a real
    // reading, not a replacement for it.
    expect(textOf(trace).cross).toEqual({ label: 'Y', value: 3 });
  });

  test('a smooth inherits it unchanged', () => {
    // The point of putting it on `LineTrace`: `SmoothTrace` extends it and
    // overrides only `plotType`, so a fitted curve needs nothing of its own.
    const trace = TraceFactory.create(
      layer([[{ x: 1, y: 3, yMin: 2, yMax: 4 }]], TraceType.SMOOTH),
    );

    expect(textOf(trace).interval).toEqual({ min: 2, max: 4 });
  });
});

describe('a sample with no band', () => {
  test('carries no interval field at all', () => {
    // Absent rather than empty: the text service branches on the field being
    // present, so `{}` would announce a clause with nothing in it.
    const trace = TraceFactory.create(layer([[{ x: 1, y: 3 }]]));

    expect(textOf(trace)).not.toHaveProperty('interval');
  });

  test('a non-finite bound is treated as no bound', () => {
    // A producer fills the columns with NaN for samples outside its fit.
    // "interval NaN through NaN" would be worse than silence.
    const trace = TraceFactory.create(
      layer([[{ x: 1, y: 3, yMin: Number.NaN, yMax: Number.NaN }]]),
    );

    expect(textOf(trace)).not.toHaveProperty('interval');
  });
});

describe('a one-sided interval', () => {
  test('announces only the bound the chart drew', () => {
    const lower = TraceFactory.create(layer([[{ x: 1, y: 3, yMin: 2 }]]));
    expect(textOf(lower).interval).toEqual({ min: 2, max: undefined });

    const upper = TraceFactory.create(layer([[{ x: 1, y: 3, yMax: 4 }]]));
    expect(textOf(upper).interval).toEqual({ min: undefined, max: 4 });
  });
});

describe('the description', () => {
  test('reports how wide the band gets', () => {
    // `Min value` / `Max value` describe the curve, not the band around it,
    // so a reader would otherwise learn nothing about how well determined
    // the fit is.
    //
    // Constructed directly rather than through the factory, which types its
    // result as the navigable `Trace` and does not expose `description`.
    const trace = new LineTrace(
      layer([[
        { x: 1, y: 3, yMin: 2.5, yMax: 3.5 },
        { x: 2, y: 4, yMin: 2, yMax: 6 },
      ]]),
    );
    const labels = trace.description.stats.map((stat: DescriptionStat) => stat.label);

    expect(labels).toContain('Narrowest interval');
    expect(labels).toContain('Widest interval');

    const widths = trace.description.stats.filter(
      (stat: DescriptionStat) =>
        stat.label === 'Narrowest interval' || stat.label === 'Widest interval',
    );
    expect(widths.map((stat: DescriptionStat) => stat.value)).toEqual([1, 4]);
  });

  test('says nothing about a band on a chart that draws none', () => {
    const trace = new LineTrace(layer([[{ x: 1, y: 3 }, { x: 2, y: 4 }]]));
    const labels = trace.description.stats.map((stat: DescriptionStat) => stat.label);

    expect(labels).not.toContain('Narrowest interval');
    expect(labels).not.toContain('Widest interval');
  });
});
