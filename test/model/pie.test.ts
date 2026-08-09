import type { MaidrLayer } from '@type/grammar';
import type { BarBrailleState, DescriptionStat, TraceState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { PieTrace } from '@model/pie';
import { TraceType } from '@type/grammar';

/** Fixture slice labels, in slice order. */
const SLICE_LABELS = ['Apples', 'Bananas', 'Cherries', 'Dates'];

/**
 * Builds a pie layer. A gap is passed as `null`, which is what a producer with
 * no measurement for a slice emits; `PiePoint.y` is declared numeric but is
 * parsed from JSON, so `null` really does arrive there — hence the cast.
 */
function pieLayer(values: (number | null)[]): MaidrLayer {
  return {
    id: 'slices',
    type: TraceType.PIE,
    title: 'Fruit sales',
    axes: { x: { label: 'Fruit' }, y: { label: 'Units' } },
    data: values.map((y, index) => ({ x: SLICE_LABELS[index], y: y as number })),
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: PieTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

/** The state the trace reports with the cursor parked on one slice. */
function stateAtSlice(trace: PieTrace, col: number): Extract<TraceState, { empty: false }> {
  trace.moveToIndex(0, col);
  return stateOf(trace);
}

/** The share of the whole the trace announces for one slice. */
function shareAtSlice(trace: PieTrace, col: number): string {
  return stateAtSlice(trace, col).text.z?.value as string;
}

/** Reads one description stat by its label. */
function statValue(stats: DescriptionStat[], label: string): string | number | undefined {
  return stats.find(stat => stat.label === label)?.value;
}

describe('pie trace audio', () => {
  it('scales every slice against the range of the slice values', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { audio } = stateAtSlice(trace, 0);

    expect(audio.freq.min).toBe(20);
    expect(audio.freq.max).toBe(50);
    expect(audio.freq.raw).toBe(30);
  });

  it('sonifies the raw magnitude rather than the share of the whole', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { audio } = stateAtSlice(trace, 2);

    // The two are a monotone rescale of each other, so this cannot be caught
    // by pitch ordering — but a percentage here would leave audio disagreeing
    // with the braille row and the reported total, which are both raw.
    expect(audio.freq.raw).toBe(20);
  });

  it('pans across the slices as a single row', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { audio } = stateAtSlice(trace, 1);

    expect(audio.panning).toEqual({ x: 1, y: 0, rows: 1, cols: 3 });
  });

  it('keeps a gap out of the range so it cannot drag an endpoint', () => {
    const trace = new PieTrace(pieLayer([30, null, 20]));

    const { audio } = stateAtSlice(trace, 0);

    // Number(null) is 0, which would put a slice that is not on the chart at
    // the bottom of the range every other slice's pitch is scaled against.
    expect(audio.freq.min).toBe(20);
    expect(audio.freq.max).toBe(30);
  });

  it('reports a gap as having no magnitude, so the empty tone sounds', () => {
    const trace = new PieTrace(pieLayer([30, null, 20]));

    const { audio } = stateAtSlice(trace, 1);

    // A non-finite raw is what tells AudioService to sound the empty tone
    // instead of interpolating a frequency.
    expect(Number.isFinite(audio.freq.raw as number)).toBe(false);
  });

  it('still treats a slice genuinely measured at zero as a real value', () => {
    const trace = new PieTrace(pieLayer([30, 0, 20]));

    const { audio } = stateAtSlice(trace, 1);

    expect(audio.freq.min).toBe(0);
    expect(Number.isFinite(audio.freq.raw as number)).toBe(true);
  });
});

describe('pie trace text', () => {
  it('announces the slice label, its value and its share', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { text } = stateAtSlice(trace, 0);

    expect(text.main).toEqual({ label: 'Fruit', value: 'Apples' });
    expect(text.cross).toEqual({ label: 'Units', value: 30 });
    expect(text.z).toEqual({ label: 'Percentage', value: '30.0%' });
  });

  it('keeps the label on x and the value on y at every slice', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const first = stateAtSlice(trace, 0).text;
    const last = stateAtSlice(trace, 2).text;

    // A pie has no orientation to swap the axes by, so these never move — and
    // the formatter picks the per-axis format off them.
    expect([first.mainAxis, last.mainAxis]).toEqual(['x', 'x']);
    expect([first.crossAxis, last.crossAxis]).toEqual(['y', 'y']);
  });

  it('announces the share of the slice the cursor is actually on', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    expect(shareAtSlice(trace, 1)).toBe('50.0%');
    expect(shareAtSlice(trace, 2)).toBe('20.0%');
  });
});

describe('pie slice percentages', () => {
  it('adds up to a hundred within the rounding of one decimal place', () => {
    const trace = new PieTrace(pieLayer([1, 1, 1]));

    const shares = [0, 1, 2].map(col => shareAtSlice(trace, col));

    expect(shares).toEqual(['33.3%', '33.3%', '33.3%']);
    // Each share is rounded to within 0.05 of its exact value, so the sum can
    // miss 100 by at most 0.05 per slice — and by nothing more.
    const total = shares.reduce((sum, share) => sum + Number.parseFloat(share), 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(shares.length * 0.05);
  });

  it('reports a zero total as zero percent rather than NaN percent', () => {
    const trace = new PieTrace(pieLayer([0, 0]));

    const shares = [0, 1].map(col => shareAtSlice(trace, col));

    // 0 / 0 is NaN, and "NaN percent" is the one thing this must never say.
    // The exact form, not '0.0%': nothing was rounded to get there.
    expect(shares).toEqual(['0%', '0%']);
  });

  it('reads a gap as missing rather than as a zero-percent slice', () => {
    const trace = new PieTrace(pieLayer([30, null, 10]));

    expect(shareAtSlice(trace, 1)).toBe('missing');
  });

  it('still gives a slice measured at zero a real zero-percent share', () => {
    const trace = new PieTrace(pieLayer([30, 0, 10]));

    // The discriminator between a gap and a zero: both have no share to speak
    // of, but only one of them was measured.
    expect(shareAtSlice(trace, 1)).toBe('0.0%');
  });

  it('divides the measured slices by a total the gap took no part in', () => {
    const trace = new PieTrace(pieLayer([30, null, 10]));

    expect(shareAtSlice(trace, 0)).toBe('75.0%');
    expect(shareAtSlice(trace, 2)).toBe('25.0%');
  });
});

/**
 * `PiePoint.y` documents that a negative value is not meaningful in a pie, and
 * nothing upstream is obliged to reject one. Left in, it subtracts from the
 * total every other slice's share is divided by, so the renderer reads it as
 * the gap it effectively is.
 */
describe('pie slices with a negative value', () => {
  it('divides the measured slices by a total the negative took no part in', () => {
    const trace = new PieTrace(pieLayer([60, -40, 30]));

    // Counting the -40 leaves a total of 50, which announces the first slice
    // as 120% — a share of the whole that cannot exist.
    expect(shareAtSlice(trace, 0)).toBe('66.7%');
    expect(shareAtSlice(trace, 2)).toBe('33.3%');
  });

  it('reads the negative slice itself as missing', () => {
    const trace = new PieTrace(pieLayer([60, -40, 30]));

    const { text } = stateAtSlice(trace, 1);

    expect(shareAtSlice(trace, 1)).toBe('missing');
    expect(Number.isFinite(text.cross.value as number)).toBe(false);
  });

  it('keeps the negative out of the range the other slices are scaled against', () => {
    const trace = new PieTrace(pieLayer([60, -40, 30]));

    const { audio } = stateAtSlice(trace, 0);

    expect(audio.freq.min).toBe(30);
    expect(audio.freq.max).toBe(60);
  });

  it('leaves it out of the described range and total as well', () => {
    const trace = new PieTrace(pieLayer([60, -40, 30]));

    const { stats } = trace.description;

    expect(statValue(stats, 'Number of slices')).toBe(3);
    expect(statValue(stats, 'Min value')).toBe(30);
    expect(statValue(stats, 'Max value')).toBe(60);
    expect(statValue(stats, 'Total')).toBe(90);
  });
});

describe('pie trace braille', () => {
  it('encodes the slices as a single row of raw magnitudes', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const braille = stateAtSlice(trace, 0).braille as BarBrailleState;

    // One row, scaled against its own range — the bar encoder's input exactly.
    expect(braille.values).toEqual([[30, 50, 20]]);
    expect(braille.min).toEqual([20]);
    expect(braille.max).toEqual([50]);
  });

  it('tracks the cursor along that one row', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const braille = stateAtSlice(trace, 2).braille as BarBrailleState;

    expect(braille.row).toBe(0);
    expect(braille.col).toBe(2);
  });

  it('carries a gap through as a gap so it encodes blank, not tallest', () => {
    const trace = new PieTrace(pieLayer([30, null, 20]));

    const braille = stateAtSlice(trace, 0).braille as BarBrailleState;

    // NaN loses every comparison in BarBrailleEncoder, which is what routes it
    // to the blank cell; a 0 there would be blank too, but it would also have
    // pulled `min` down to 0 and shifted every other cell's band.
    expect(Number.isFinite(braille.values[0][1])).toBe(false);
    expect(braille.min).toEqual([20]);
  });
});

describe('pie navigation', () => {
  it('moves right and left across the slices', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    // The first key press lands on the first slice rather than stepping off it.
    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.col).toBe(0);

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.col).toBe(1);

    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(trace.col).toBe(0);
  });

  it('stops at the last slice rather than wrapping round the circle', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));
    trace.moveToIndex(0, 2);

    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect(trace.col).toBe(2);
  });

  it('treats up and down as out of bounds, since a pie is one row', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));
    trace.moveToIndex(0, 1);
    const update = jest.fn();
    trace.addObserver({ update });

    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);

    expect(trace.row).toBe(0);
    expect(trace.col).toBe(1);
    // A rejected move still has to say something, or the key press is silent.
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0]).toMatchObject({ empty: true, type: 'trace' });
  });

  it('rejects a jump to a second row', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    expect(trace.moveToIndex(1, 0)).toBe(false);
    expect(trace.moveToIndex(0, 3)).toBe(false);
    expect(trace.moveToIndex(0, 2)).toBe(true);
  });

  it('runs to the far slice on an extreme move', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(trace.col).toBe(2);

    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(trace.col).toBe(0);
  });
});

describe('pie description', () => {
  it('reports the slice count and the total alongside the range', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { stats } = trace.description;

    expect(stats).toEqual([
      { label: 'Number of slices', value: 3 },
      { label: 'Min value', value: 20 },
      { label: 'Max value', value: 50 },
      { label: 'Total', value: 100 },
    ]);
  });

  it('counts a gap as a slice but leaves it out of the total', () => {
    const trace = new PieTrace(pieLayer([30, null, 20]));

    const { stats } = trace.description;

    // The slice is on the chart, so it is one of the slices; it was never
    // measured, so it contributes nothing to the sum.
    expect(statValue(stats, 'Number of slices')).toBe(3);
    expect(statValue(stats, 'Total')).toBe(50);
  });

  it('names the chart and tabulates label, value and share', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const { chartType, title, axes, dataTable } = trace.description;

    expect(chartType).toBe('Pie Chart');
    expect(title).toBe('Fruit sales');
    expect(axes).toEqual({ x: 'Fruit', y: 'Units' });
    expect(dataTable.headers).toEqual(['Fruit', 'Units', 'Percentage']);
    expect(dataTable.rows).toEqual([
      ['Apples', 30, '30.0%'],
      ['Bananas', 50, '50.0%'],
      ['Cherries', 20, '20.0%'],
    ]);
  });

  it('spells a gap out in the table rather than leaving the cell blank', () => {
    const trace = new PieTrace(pieLayer([30, null, 20]));

    const { rows } = trace.description.dataTable;

    // A blank cell and a cell nobody filled in read the same way to a screen
    // reader walking the table.
    expect(rows[1]).toEqual(['Bananas', 'missing', 'missing']);
  });

  it('describes a pie of nothing but gaps as missing, not as an infinity', () => {
    // safeMin/safeMax answer an empty set with ±Infinity, and the total of a
    // pie nobody measured is not zero — nothing was measured to add up.
    const trace = new PieTrace(pieLayer([null, null]));

    const { stats } = trace.description;

    expect(statValue(stats, 'Number of slices')).toBe(2);
    expect(statValue(stats, 'Min value')).toBe('missing');
    expect(statValue(stats, 'Max value')).toBe('missing');
    expect(statValue(stats, 'Total')).toBe('missing');
  });
});

describe('pie trace registration', () => {
  it('builds a PieTrace for a layer typed pie', () => {
    // TraceFactory throws on an unregistered type, and the throw propagates
    // out of figure construction — an unregistered pie takes the whole figure
    // down, not just its own layer.
    const trace = TraceFactory.create(pieLayer([30, 50, 20]));

    expect(trace).toBeInstanceOf(PieTrace);
  });

  it('announces itself as a pie, with no orientation to prefix', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));

    const state = stateAtSlice(trace, 0);

    expect(state.traceType).toBe(TraceType.PIE);
    // Slices are arranged around a circle, not along an axis: "vertical pie"
    // is not a thing to announce.
    expect(state.orientation).toBeUndefined();
  });
});

describe('pie trace disposal', () => {
  it('can still answer with an out-of-bounds state after disposal', () => {
    const trace = new PieTrace(pieLayer([30, 50, 20]));
    trace.moveToIndex(0, 1);

    trace.dispose();

    // `dimension` reads the slice values, which disposal deliberately leaves
    // alone: a disposed trace is still asked for an out-of-bounds state.
    expect(() => trace.notifyOutOfBounds()).not.toThrow();
  });
});
