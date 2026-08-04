import type { MaidrLayer } from '@type/grammar';
import type { BarBrailleState, TraceState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { SegmentedTrace } from '@model/segmented';
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
function stateOf(trace: BarTrace | SegmentedTrace): Extract<TraceState, { empty: false }> {
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

  it('treats a blank cell as a gap, since Number("") is also 0', () => {
    const trace = new BarTrace(barLayer([120, '' as unknown as number, 40]));

    const { audio } = stateOf(trace);

    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
  });

  it('describes a chart of nothing but gaps as missing, not as an infinity', () => {
    // safeMin/safeMax answer an empty set with ±Infinity, which is not
    // something to read out as a chart's minimum.
    const trace = new BarTrace(barLayer([null, null]));

    const stats = trace.description.stats;

    expect(stats.find(stat => stat.label === 'Min value')?.value).toBe('missing');
    expect(stats.find(stat => stat.label === 'Max value')?.value).toBe('missing');
  });

  it('offers no extreme for a row that is entirely gaps', () => {
    // The range is empty, so safeMin/safeMax return ±Infinity, which indexOf
    // cannot find — the target would have carried pointIndex -1 and moved the
    // cursor off the row.
    const trace = new BarTrace(barLayer([null, null]));

    expect(trace.getExtremaTargets()).toEqual([]);
  });
});

/**
 * Builds a two-series stacked layer. `SegmentedTrace` appends a Total row
 * summing the series, which is where a gap has the furthest to spread.
 */
function stackedLayer(east: (number | null)[], west: (number | null)[]): MaidrLayer {
  const series = (values: (number | null)[], name: string): { x: string; y: number; z: string }[] =>
    values.map((y, index) => ({ x: `Q${index + 1}`, y: y as number, z: name }));

  return {
    id: 'stack',
    type: TraceType.STACKED,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: [series(east, 'East'), series(west, 'West')],
  };
}

describe('segmented bar gaps', () => {
  it('keeps a gapped segment from turning the whole chart\'s pitch range to NaN', () => {
    // The Total row sums each category. Adding a gap straight in makes that
    // sum NaN, which seeds MathUtil.minMax and then spreads through
    // safeMin/safeMax over every row — so a single missing segment handed the
    // oscillator a NaN frequency for every real bar on the chart.
    const trace = new SegmentedTrace(stackedLayer([null, 80], [90, 70]));

    const state = stateOf(trace);

    expect(Number.isFinite(state.audio.freq.min)).toBe(true);
    expect(Number.isFinite(state.audio.freq.max)).toBe(true);
  });

  it('totals the measured segments of a category with a gap', () => {
    const trace = new SegmentedTrace(stackedLayer([null, 80], [90, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    // Q1 has one real segment (90) and one gap; Q2 has both.
    expect(totals?.[0]).toBe(90);
    expect(totals?.[1]).toBe(150);
  });

  it('leaves a category with no measured segment as a gap in the total', () => {
    const trace = new SegmentedTrace(stackedLayer([null, 80], [null, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    expect(Number.isFinite(totals?.[0] as number)).toBe(false);
    expect(totals?.[1]).toBe(150);
  });

  it('leaves a stack with no gaps totalling exactly as before', () => {
    const trace = new SegmentedTrace(stackedLayer([120, 80], [90, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    expect(totals).toEqual([210, 150]);
  });
});
