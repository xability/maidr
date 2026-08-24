import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A sunflower plot's marks are not its observations (#1160).
 *
 * `graphics::sunflowerplot()` is a scatter for data with ties: where several
 * observations land on one coordinate it draws a single mark with that many
 * petals. Measured on sixty observations of two rounded normals, it returns
 * **twenty-one** rows plus a count each, and the counts sum back to sixty.
 *
 * Read as a plain `point` layer, that is a scatter of twenty-one points and
 * the count is gone -- the one thing the chart is drawn to show. Read as a
 * `hexbin`, the count survives and the reader is told the coordinates are bin
 * centres, which is the one thing that did not happen: there is no binning,
 * and `HexbinTrace` wants a lattice (`HexbinPoint[][]`) that a set of
 * observed positions does not form.
 *
 * So: a scatter, whose `z` is the count, under a name of its own. `z` is not
 * decoration on `ScatterTrace` -- it is announced with its axis label and
 * drives the intensity -- so the multiplicity is spoken and audible both.
 * The name is what carries the rest: a reader told "scatter" has been told
 * the marks are the data.
 */
function layerOf(data: ScatterPoint[], type: TraceType): MaidrLayer {
  return {
    id: 'test-sunflower',
    type,
    title: 'Ties',
    axes: { x: { label: 'x' }, y: { label: 'y' }, z: { label: 'Observations' } },
    data,
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: ScatterTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

/** Four marks carrying eight observations between them. */
function marks(): ScatterPoint[] {
  return [
    { x: 4, y: 9, z: 5 },
    { x: 5, y: 7, z: 1 },
    { x: 6, y: 7, z: 1 },
    { x: 6, y: 8, z: 1 },
  ];
}

function sunflower(): ScatterTrace {
  return new ScatterTrace(layerOf(marks(), TraceType.SUNFLOWER));
}

describe('sunflower trace', () => {
  test('announces itself as a sunflower plot, not a scatter', () => {
    const trace = sunflower();

    expect(trace.description.chartType).toBe('Sunflower Plot');
  });

  test('a plain scatter of the same points still announces as a scatter', () => {
    // The name is the whole change; nothing about the data decides it.
    const trace = new ScatterTrace(layerOf(marks(), TraceType.SCATTER));

    expect(trace.description.chartType).toBe('Scatter Plot');
  });

  test('the factory builds one from the type alone', () => {
    const trace = TraceFactory.create(layerOf(marks(), TraceType.SUNFLOWER));

    expect(trace).toBeInstanceOf(ScatterTrace);
  });

  test('the count is announced with the name the axis gives it', () => {
    // Not "z is 5". `ScatterTrace` reads the label off `axes.z`, which is
    // what makes the multiplicity something a reader can act on.
    const trace = sunflower();

    const { text } = stateOf(trace);

    expect(text.z).toEqual({ label: 'Observations', value: 5 });
  });

  test('the count reaches the audio as an intensity', () => {
    // A mark with five observations and one with a single observation must
    // not sound alike, which is what `z` does here beyond being spoken.
    // Compared across two traces rather than by moving within one, so the
    // assertion is about the count and not about where the cursor starts.
    const crowded = new ScatterTrace(
      layerOf([{ x: 4, y: 9, z: 5 }, { x: 5, y: 7, z: 1 }], TraceType.SUNFLOWER),
    );
    const lone = new ScatterTrace(
      layerOf([{ x: 4, y: 9, z: 1 }, { x: 5, y: 7, z: 5 }], TraceType.SUNFLOWER),
    );

    expect(stateOf(crowded).audio.zIntensity)
      .not
      .toEqual(stateOf(lone).audio.zIntensity);
  });

  test('a mark with no count is not silently read as none', () => {
    // A producer that omitted `z` has said nothing about multiplicity, which
    // is different from saying there is one observation.
    const trace = new ScatterTrace(
      layerOf([{ x: 1, y: 1 }, { x: 2, y: 2 }], TraceType.SUNFLOWER),
    );

    expect(stateOf(trace).text.z).toBeUndefined();
  });
});
