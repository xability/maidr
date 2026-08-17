/**
 * The contract `MaidrLayer.orientation` carries, asserted by running it.
 *
 * The key does not mean the same thing to every trace. For the bar family it
 * selects which field of a point holds the magnitude; for everything else it
 * only decides which axis label a reading is announced against, and the
 * payload is written the same way at either value. A binding that puts a
 * layer in the wrong half emits a chart that loads, navigates and announces —
 * and reports no magnitude at all, because the trace found a category name
 * where it expected a number.
 *
 * That had already happened twice in one binding (r-maidr #184 and #186) at
 * the time this was written, and the schema said nothing either way, so the
 * table on `MaidrLayer.orientation` is where the rule now lives. Prose drifts
 * from code silently, so these cases execute the rule rather than restating
 * it: one representative per row of that table, asserting through the state a
 * trace actually publishes.
 */
import type { AudioState } from '@type/state';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

const APPLE = 30;

/**
 * The magnitude a trace sounds at its first point.
 *
 * `null` for a trace that published an empty state, which is one of the ways
 * a payload written for the wrong orientation shows up.
 * @param layer - The layer to build, as MAIDR JSON would declare it
 * @returns The `freq.raw` the trace publishes once moved onto a point
 */
function magnitudeOf(layer: object): AudioState['freq']['raw'] | null {
  const trace = TraceFactory.create(layer as never);
  trace.moveOnce('FORWARD' as never);
  const state = trace.state as { empty: boolean; audio: AudioState };
  return state.empty ? null : state.audio.freq.raw;
}

describe('the orientation contract the schema documents', () => {
  describe('the bar family reads the magnitude out of the swapped field', () => {
    // A plain bar declares one series as a flat array; the grouped types
    // declare one array per series. `grouped` says which shape to build so
    // both are exercised through the same two assertions.
    const BAR_FAMILY = [
      { name: 'bar', type: TraceType.BAR, grouped: false },
      { name: 'stacked', type: TraceType.STACKED, grouped: true },
      { name: 'dodged', type: TraceType.DODGED, grouped: true },
    ];

    /**
     * One series of two points, in the shape the given type declares.
     * @param grouped - Whether the type takes an array of series
     * @param points - The series to wrap
     * @returns The `data` payload for the layer
     */
    function seriesOf(grouped: boolean, points: object[]): object[] {
      return grouped ? [points] : points;
    }

    it.each(BAR_FAMILY)('$name takes it from x when horizontal', ({ type, grouped }) => {
      // The arrangement py-maidr emits for `ax.barh` and the one r-maidr now
      // emits: the magnitude in x, the category in y.
      const magnitude = magnitudeOf({
        id: 'l',
        type,
        orientation: Orientation.HORIZONTAL,
        data: seriesOf(grouped, [
          { x: APPLE, y: 'apple', z: 'u' },
          { x: 70, y: 'banana', z: 'u' },
        ]),
      });

      expect(magnitude).toBe(APPLE);
    });

    it.each(BAR_FAMILY)('$name takes it from y when vertical', ({ type, grouped }) => {
      const magnitude = magnitudeOf({
        id: 'l',
        type,
        orientation: Orientation.VERTICAL,
        data: seriesOf(grouped, [
          { x: 'apple', y: APPLE, z: 'u' },
          { x: 'banana', y: 70, z: 'u' },
        ]),
      });

      expect(magnitude).toBe(APPLE);
    });

    it('finds no magnitude when a horizontal layer is written the vertical way', () => {
      // The failure the table exists to prevent, stated as the symptom a
      // reader gets: the chart is navigable and every point is silent.
      const magnitude = magnitudeOf({
        id: 'l',
        type: TraceType.BAR,
        orientation: Orientation.HORIZONTAL,
        data: [{ x: 'apple', y: APPLE }, { x: 'banana', y: 70 }],
      });

      expect(magnitude).not.toBe(APPLE);
      expect(typeof magnitude === 'number' && Number.isFinite(magnitude)).toBe(false);
    });

    it('reads a histogram the same way, since its trace extends the bar', () => {
      const magnitude = magnitudeOf({
        id: 'l',
        type: TraceType.HISTOGRAM,
        orientation: Orientation.HORIZONTAL,
        data: [
          { x: APPLE, y: 1.5, yMin: 1, yMax: 2, xMin: 0, xMax: APPLE },
          { x: 70, y: 2.5, yMin: 2, yMax: 3, xMin: 0, xMax: 70 },
        ],
      });

      expect(magnitude).toBe(APPLE);
    });
  });

  describe('every other family leaves the payload alone', () => {
    it.each([Orientation.VERTICAL, Orientation.HORIZONTAL])(
      'an error bar keeps its magnitude in y at %s',
      (orientation) => {
        // `magnitudeOf` in errorBar.ts reads y/yMin/yMax unconditionally, and
        // its text reads point.x for both orientations. Only the axis labels
        // swap, so a binding must NOT exchange the pair here -- the opposite
        // of what the bar family needs, from the same key.
        const magnitude = magnitudeOf({
          id: 'l',
          type: TraceType.ERROR_BAR,
          orientation,
          data: [
            { x: 'apple', y: APPLE, yMin: 25, yMax: 35 },
            { x: 'banana', y: 70, yMin: 65, yMax: 75 },
          ],
        });

        expect(magnitude).toBe(APPLE);
      },
    );

    it('a box reads the same quantiles whichever way it is drawn', () => {
      // A box carries no x/y assignment to exchange, so the two orientations
      // have to sound identically. Comparing them is the assertion that the
      // key moved nothing -- stronger than checking either one alone, and it
      // does not depend on which section the cursor happens to start on.
      const boxAt = (orientation: Orientation): unknown => magnitudeOf({
        id: 'l',
        type: TraceType.BOX,
        orientation,
        data: [
          { min: 1, q1: 2, q2: 3, q3: 4, max: 5, lowerOutliers: [], upperOutliers: [] },
          { min: 2, q1: 3, q2: 4, q3: 5, max: 6, lowerOutliers: [], upperOutliers: [] },
        ],
      });

      expect(boxAt(Orientation.HORIZONTAL)).toEqual(boxAt(Orientation.VERTICAL));
    });
  });
});
