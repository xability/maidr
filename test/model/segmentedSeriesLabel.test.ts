import type { SegmentedTrace } from '@model/segmented';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * One name for the series dimension of a stacked, dodged or 100% bar.
 *
 * Each move read the series under `this.z`, whose fallback is the generic
 * `Level`, while the dialog's table headed the same column `Series`: with no
 * z label, uPlot's stacked bar was read "Level is Errors" on every move and
 * listed under "Series" in the table. The layer's z label, when it has one,
 * names it everywhere; when it has none, the table's word does.
 */

/**
 * Two series over two categories.
 *
 * @param type The segmented trace type
 * @param axes The layer's axes
 * @returns The layer
 */
function layer(type: TraceType, axes: MaidrLayer['axes']): MaidrLayer {
  return {
    id: 'series-label',
    type,
    axes,
    data: [
      [{ x: 'Math', y: 30, z: 'A' }, { x: 'Art', y: 12, z: 'A' }],
      [{ x: 'Math', y: 20, z: 'B' }, { x: 'Art', y: 25, z: 'B' }],
    ] as SegmentedPoint[][],
  };
}

/**
 * A stacked, dodged, 100% or diverging trace built from a layer.
 *
 * @param source The layer
 * @returns The trace
 */
function build(source: MaidrLayer): SegmentedTrace {
  return TraceFactory.create(source) as SegmentedTrace;
}

/**
 * The trace's state at a cell, asserting it is populated.
 *
 * @param source The layer
 * @param row The series
 * @param col The category
 * @returns The state
 */
function stateAt(source: MaidrLayer, row: number, col: number): NonEmptyTraceState {
  const trace = build(source);
  trace.moveToIndex(row, col);
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a populated state');
  }
  return state;
}

const UNNAMED = { x: { label: 'Subject' }, y: { label: 'Count' } };
const NAMED = { ...UNNAMED, z: { label: 'Grade' } };

/**
 * The two-series layer with no z label and its second series replaced.
 *
 * @param type The segmented trace type
 * @param second The second series' points
 * @returns The layer
 */
function withSecond(type: TraceType, second: Partial<SegmentedPoint>[]): MaidrLayer {
  const source = layer(type, UNNAMED);
  const [first] = source.data as SegmentedPoint[][];
  return { ...source, data: [first, second] as SegmentedPoint[][] };
}

/**
 * What each move on a series announces it as, and what the Go To dialog
 * lists its extremes as.
 *
 * @param source The layer
 * @param row The series; the last row is the Sum row
 * @returns The announced series name and the dialog's names
 */
function namesAt(source: MaidrLayer, row: number): { announced: unknown; extremes: (string | undefined)[] } {
  const trace = build(source);
  trace.moveToIndex(row, 0);
  const state = trace.state;
  return {
    announced: state.empty ? undefined : state.text.z?.value,
    extremes: trace.getExtremaTargets().map(target => target.display?.name),
  };
}

describe.each([TraceType.STACKED, TraceType.DODGED, TraceType.NORMALIZED])('a %s bar', (type) => {
  test('with no z label names its series by the table\'s word on every move', () => {
    const state = stateAt(layer(type, UNNAMED), 1, 0);
    const headers = build(layer(type, UNNAMED)).description.dataTable.headers;

    expect(state.text.z).toEqual({ label: 'Series', value: 'B' });
    expect(headers.at(-1)).toBe('Series');
  });

  test('with a z label names its series by it, in the moves and the table', () => {
    const state = stateAt(layer(type, NAMED), 0, 1);
    const headers = build(layer(type, NAMED)).description.dataTable.headers;

    expect(state.text.z).toEqual({ label: 'Grade', value: 'A' });
    expect(headers.at(-1)).toBe('Grade');
  });

  test('takes a blank z label for none, in the moves and the table alike', () => {
    const blank = { ...UNNAMED, z: { label: '   ' } };
    const state = stateAt(layer(type, blank), 0, 0);
    const headers = build(layer(type, blank)).description.dataTable.headers;

    expect(state.text.z?.label).toBe('Series');
    expect(headers.at(-1)).toBe('Series');
  });

  test('names the series of an extreme by the same word', () => {
    const trace = build(layer(type, UNNAMED));
    trace.moveToIndex(1, 0);

    const names = trace.getExtremaTargets().map(target => target.display?.name);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toContain('Series: \'B\'');
    }
  });

  test.each([
    { what: 'no z', first: { x: 'Math', y: 20 } },
    { what: 'an empty z', first: { x: 'Math', y: 20, z: '' } },
    { what: 'a z of spaces', first: { x: 'Math', y: 20, z: '   ' } },
  ])('names a series whose first point has $what in the Go To dialog as each move does', ({ first }) => {
    // The series names itself on its second point only. The dialog read the
    // first point alone, so it listed `Group 1`, counted from zero, or quoted
    // the spaces, where each move announced the series as `B`.
    const source = withSecond(type, [first, { x: 'Art', y: 25, z: 'B' }]);

    const names = namesAt(source, 1);

    expect(names).toEqual({ announced: 'B', extremes: ['Max Series: \'B\'', 'Min Series: \'B\''] });
  });

  test('numbers a series named nowhere in the Go To dialog as each move does', () => {
    // A Victory bar given `name=""` leaves every point of its series unnamed.
    const source = withSecond(type, [{ x: 'Math', y: 20, z: '' }, { x: 'Art', y: 25, z: '' }]);

    const names = namesAt(source, 1);

    expect(names).toEqual({
      announced: 'Series 2',
      extremes: ['Max Series: \'Series 2\'', 'Min Series: \'Series 2\''],
    });
  });

  test('keeps calling the Sum row Total in the Go To dialog', () => {
    const { extremes } = namesAt(layer(type, UNNAMED), 2);

    expect(extremes).toEqual(['Max Total', 'Min Total']);
  });
});

describe('a diverging bar', () => {
  test('with no z label names its sides by the table\'s word', () => {
    const pyramid: MaidrLayer = {
      id: 'pyramid',
      type: TraceType.DIVERGING,
      axes: { x: { label: 'Age band' }, y: { label: 'People' } },
      data: [
        [{ x: '0-14', y: -1240, z: 'Men' }, { x: '15-64', y: -2260, z: 'Men' }],
        [{ x: '0-14', y: 1180, z: 'Women' }, { x: '15-64', y: 2300, z: 'Women' }],
      ] as SegmentedPoint[][],
    };

    expect(stateAt(pyramid, 1, 0).text.z).toEqual({ label: 'Series', value: 'Women' });
  });
});
