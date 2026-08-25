import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A grid cell the chart drew no value at (#1191).
 *
 * `HeatmapData.points` was `number[][]`, so an adapter whose data did not fill
 * the rectangle had nowhere to say so and three of them filled the holes with
 * `0`. Measured on Highcharts 13.0.1, a 3x2 heatmap omitting one cell and the
 * same heatmap stating that cell as `0` produced byte-identical payloads,
 * while the first drew five cells and the second six.
 *
 * A zero is a reading. It sounds like a real low point, it can be reached as
 * the grid's minimum, and it pulls the range every other cell's pitch is
 * scaled against. What this file pins is that a hole does none of those, in
 * every channel that could otherwise state it.
 */

function layerOf(points: (number | null)[][]): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    title: 'test',
    axes: { x: { label: 'Day' }, y: { label: 'Half' }, z: { label: 'Count' } },
    data: {
      x: ['Mon', 'Tue', 'Wed'],
      // Top row first, which `Heatmap` turns over on construction.
      y: ['PM', 'AM'],
      points,
    } satisfies HeatmapData,
  };
}

/** `[[PM row], [AM row]]`, top-first, with Tuesday PM never recorded. */
const WITH_HOLE = [[2, null, 4], [5, 7, 9]];
/** The same chart stating that cell as a genuine zero. */
const WITH_ZERO = [[2, 0, 4], [5, 7, 9]];

/**
 * Move the cursor onto the cell under test.
 *
 * `Heatmap` turns the rows over on construction so that its own row 0 is the
 * bottom of the drawn grid, which puts `PM` — the top row of the payload — at
 * index 1.
 */
function atTuesdayPm(trace: Heatmap): Heatmap {
  trace.moveToIndex(1, 1);
  return trace;
}

describe('a heat cell the chart drew no value at', () => {
  test('is not announced as a zero', () => {
    const state = atTuesdayPm(new Heatmap(layerOf(WITH_HOLE))).state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }

    // `z` carries the cell's value. A finite number here is a reading, and
    // the chart made none.
    expect(Number.isFinite(state.text.z?.value as number)).toBe(false);
  });

  test('while a recorded zero still is', () => {
    const state = atTuesdayPm(new Heatmap(layerOf(WITH_ZERO))).state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }

    expect(state.text.z?.value).toBe(0);
  });

  test('hands the audio service a value it sounds as empty', () => {
    const state = atTuesdayPm(new Heatmap(layerOf(WITH_HOLE))).state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }

    // `AudioService` routes a non-finite `raw` to `playEmptyTone` — the same
    // sound a gap in a bar chart makes. A `0` would be pitched instead, at
    // the bottom of the range.
    expect(Number.isNaN(state.audio.freq.raw as number)).toBe(true);
  });

  test('does not pull the range the other cells are pitched against', () => {
    const holed = atTuesdayPm(new Heatmap(layerOf(WITH_HOLE))).state;
    const zeroed = atTuesdayPm(new Heatmap(layerOf(WITH_ZERO))).state;
    if (holed.empty || zeroed.empty) {
      throw new Error('expected populated states');
    }

    // 2 is the smallest thing this chart measured; the zero chart measures 0.
    expect(holed.audio.freq.min).toBe(2);
    expect(zeroed.audio.freq.min).toBe(0);
    expect(holed.audio.freq.max).toBe(9);
  });

  test('is blank in braille rather than the strongest band', () => {
    const state = atTuesdayPm(new Heatmap(layerOf(WITH_HOLE))).state;
    if (state.empty || state.braille.empty) {
      throw new Error('expected a braille state');
    }

    // The rows are bottom-first here, so `PM` is row 1. What the encoder does
    // with the `NaN` is `braille.test.ts`' half of this; what the model owes
    // it is a value that is not a number.
    expect((state.braille as { values: number[][] }).values[1][1]).toBeNaN();
  });

  test('is named rather than printed as NaN in the data table', () => {
    const rows = new Heatmap(layerOf(WITH_HOLE)).description.dataTable.rows;

    // The table is built from the flipped rows, so `AM` comes first.
    expect(rows[0]).toEqual(['AM', 5, 7, 9]);
    expect(rows[1]).toEqual(['PM', 2, 'missing', 4]);
  });

  test('is left out of the min and max the description reports', () => {
    const stats = new Heatmap(layerOf(WITH_HOLE)).description.stats;
    const valueOf = (label: string): unknown =>
      stats?.find(stat => stat.label === label)?.value;

    expect(valueOf('Min value')).toBe(2);
    expect(valueOf('Max value')).toBe(9);
  });

  test('is never offered as an extreme to navigate to', () => {
    const trace = atTuesdayPm(new Heatmap(layerOf(WITH_HOLE)));

    // A target whose value is not a number is a place the reader can be sent
    // and told nothing on arrival.
    for (const target of trace.getExtremaTargets()) {
      expect(Number.isFinite(target.value)).toBe(true);
    }
  });
});

describe('a grid whose first cell is the hole', () => {
  // Position matters, which is why this case is written out. `MathUtil.minMax`
  // seeds from the first element and every comparison against a `NaN` is
  // false, so a hole anywhere after the seed loses harmlessly while a hole at
  // it holds both bounds at `NaN` — and a `NaN` range silences the whole grid,
  // not one cell.
  //
  // The hole goes in the payload's LAST row, because `Heatmap` reverses the
  // rows: the bottom row is what ends up first in the flattened grid.
  const LEADING = [[5, 9], [null, 4]];

  test('still reports the range the measured cells give', () => {
    const stats = new Heatmap(layerOf(LEADING)).description.stats;
    const valueOf = (label: string): unknown =>
      stats?.find(stat => stat.label === label)?.value;

    expect(valueOf('Min value')).toBe(4);
    expect(valueOf('Max value')).toBe(9);
  });

  test('hands the audio service a range it can pitch against', () => {
    const trace = new Heatmap(layerOf(LEADING));
    trace.moveToIndex(0, 1);
    const state = trace.state;
    if (state.empty) {
      throw new Error('expected a populated state');
    }

    expect(Number.isFinite(state.audio.freq.min)).toBe(true);
    expect(Number.isFinite(state.audio.freq.max)).toBe(true);
  });
});

describe('a grid with nothing measured in it', () => {
  const NOTHING = [[null, null], [null, null]];

  test('reports no range rather than an infinite one', () => {
    const stats = new Heatmap(layerOf(NOTHING)).description.stats;
    const valueOf = (label: string): unknown =>
      stats?.find(stat => stat.label === label)?.value;

    // `MathUtil.minMax` answers `Infinity` / `-Infinity` for an empty list,
    // and "Min value Infinity" is a finding about a chart that made none.
    expect(valueOf('Min value')).toBe('missing');
    expect(valueOf('Max value')).toBe('missing');
  });

  test('offers no extrema at all', () => {
    expect(new Heatmap(layerOf(NOTHING)).getExtremaTargets()).toEqual([]);
  });
});
