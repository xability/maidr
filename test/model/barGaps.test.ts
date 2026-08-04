import type { MaidrLayer } from '@type/grammar';
import type { BarBrailleState, TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TraceType } from '@type/grammar';

/**
 * Builds a single-series bar layer. A gap is passed as `null`, which is how a
 * chart library reports a missing bar and what the plotly adapter carries
 * through; the grammar types the field as `number | string`, hence the cast.
 */
function barLayer(values: (number | null)[]): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: values.map((y, index) => ({ x: `Q${index + 1}`, y: y as number })),
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: BarTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state;
}

describe('bar plot gaps', () => {
  it('keeps a gap out of the row range so it cannot drag the minimum down', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    const { audio } = stateOf(trace);

    // Without this, Number(null) puts a 0 in the row and the range becomes
    // 0..120 — every other bar's pitch is scaled against a bar that is not
    // on the chart.
    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
  });

  it('reports a gap as having no magnitude rather than as a zero', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    trace.moveToIndex(0, 1);
    const { audio, text } = stateOf(trace);

    // A non-finite raw is what tells AudioService to sound the empty tone
    // instead of interpolating a frequency.
    expect(Number.isFinite(audio.freq.raw as number)).toBe(false);
    // The text layer keeps saying "missing", which it derives from the raw
    // point rather than from barValues.
    expect(text.cross?.value).toBeNull();
  });

  it('still treats a bar genuinely measured at zero as a real value', () => {
    const trace = new BarTrace(barLayer([0, 80, 40]));

    const { audio } = stateOf(trace);

    expect(audio.freq.min).toBe(0);
    expect(Number.isFinite(audio.freq.raw as number)).toBe(true);
  });

  it('leaves a row of real values completely unchanged', () => {
    const trace = new BarTrace(barLayer([120, 80, 40]));

    const { audio, braille } = stateOf(trace);

    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
    expect((braille as BarBrailleState).values).toEqual([[120, 80, 40]]);
  });

  it('reaches the true extreme rather than the gap when navigating to the minimum', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    const targets = trace.getExtremaTargets();

    const min = targets.find(target => target.label.toLowerCase().includes('min'));
    expect(min?.value).toBe(40);
  });
});
