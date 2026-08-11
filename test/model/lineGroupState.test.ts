import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Create a line layer for group-state tests.
 * @param data Line data points for the trace
 * @param zLabel Optional authored z-axis label
 * @returns Line layer definition for LineTrace
 */
function createLineLayer(data: MaidrLayer['data'], zLabel?: string): MaidrLayer {
  return {
    id: 'test-line-layer',
    type: TraceType.LINE,
    title: 'Group state test layer',
    axes: {
      x: { label: 'X' },
      y: { label: 'Y' },
      ...(zLabel ? { z: { label: zLabel } } : {}),
    },
    data,
  };
}

const NAMED_MULTILINE: MaidrLayer['data'] = [
  [
    { x: 1, y: 1, z: 'Series 1' },
    { x: 2, y: 3, z: 'Series 1' },
  ],
  [
    { x: 1, y: 9, z: 'Series 2' },
    { x: 2, y: 7, z: 'Series 2' },
  ],
];

describe('LineTrace group state', () => {
  test('names the line the cursor sits on', () => {
    const trace = new LineTrace(createLineLayer(NAMED_MULTILINE));

    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.groupCount).toBe(2);
      expect(state.group).toEqual({ label: 'Group', value: 'Series 1' });
    }
  });

  test('follows the cursor to the next line', () => {
    const trace = new LineTrace(createLineLayer(NAMED_MULTILINE));

    trace.moveOnce('FORWARD'); // consumed by initial entry
    trace.moveOnce('UPWARD');
    const state = trace.state;

    if (!state.empty) {
      expect(state.group).toEqual({ label: 'Group', value: 'Series 2' });
    }
  });

  test('honors an authored z label over the "Group" default', () => {
    const trace = new LineTrace(createLineLayer(NAMED_MULTILINE, 'series'));

    const state = trace.state;

    if (!state.empty) {
      expect(state.group).toEqual({ label: 'series', value: 'Series 1' });
    }
  });

  test('reports the current line at an intersection, not the intersection summary', () => {
    // Both lines pass through (2, 5), so `text.z` becomes the intersection
    // summary while `group` must stay the line actually being navigated.
    const trace = new LineTrace(createLineLayer([
      [
        { x: 1, y: 1, z: 'Series 1' },
        { x: 2, y: 5, z: 'Series 1' },
      ],
      [
        { x: 1, y: 9, z: 'Series 2' },
        { x: 2, y: 5, z: 'Series 2' },
      ],
    ]));

    trace.moveOnce('FORWARD'); // consumed by initial entry
    trace.moveOnce('FORWARD');
    const state = trace.state;

    if (!state.empty) {
      expect(state.text.z?.value).toContain('intersection at');
      expect(state.group).toEqual({ label: 'Group', value: 'Series 1' });
    }
  });

  test('omits the group when the data authors no line names', () => {
    const trace = new LineTrace(createLineLayer([
      [{ x: 1, y: 1 }, { x: 2, y: 3 }],
      [{ x: 1, y: 9 }, { x: 2, y: 7 }],
    ]));

    const state = trace.state;

    if (!state.empty) {
      expect(state.groupCount).toBe(2);
      expect(state.group).toBeUndefined();
    }
  });

  test('omits the group for a single-line trace', () => {
    const trace = new LineTrace(createLineLayer([
      [{ x: 1, y: 1, z: 'Series 1' }, { x: 2, y: 3, z: 'Series 1' }],
    ]));

    const state = trace.state;

    if (!state.empty) {
      expect(state.groupCount).toBeUndefined();
      expect(state.group).toBeUndefined();
    }
  });
});
