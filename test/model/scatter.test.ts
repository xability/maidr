import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Build a minimal scatter layer for model-only tests.
 */
function createScatterLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'test-scatter-layer',
    type: TraceType.SCATTER,
    title: 'Scatter intersection test',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

describe('ScatterTrace intersection mode', () => {
  test('supportsIntersectionMode reports true when any axis has a stack', () => {
    // Capability gate: either dimension stacking is enough, because either
    // base mode (COL / ROW) can enter intersection and cycle through its
    // corresponding stack.
    const colStack = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 3 },
    ]));
    const rowStack = new ScatterTrace(createScatterLayer([
      // No x is shared, but y=5 has two xs — only ROW mode finds the stack.
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 9 },
    ]));
    const flat = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]));

    expect(colStack.supportsIntersectionMode()).toBe(true);
    expect(rowStack.supportsIntersectionMode()).toBe(true);
    expect(flat.supportsIntersectionMode()).toBe(false);
  });

  test('entering intersection mode from ROW mode walks the x-stack at the current y', () => {
    // Regression: an earlier version force-switched to COL mode on entry,
    // silently re-anchoring the user on a different point set. Pressing
    // up/down in default nav puts the user in ROW mode; intersection mode
    // must use that y's x values, not a column's y values.
    const trace = new ScatterTrace(createScatterLayer([
      // y=5 has three xs stacked. yPoints is sorted by y asc, so y=5 is index 0.
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 9, y: 9 },
    ]));
    // First UPWARD consumes the initial-entry handshake (mode stays COL);
    // the second toggles into ROW mode. Mirrors how arrow keys behave in
    // the live UI.
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    trace.setIntersectionMode(true);
    expect(trace.moveToNextIntersection()).toBe(true);
    expect(trace.moveToNextIntersection()).toBe(true);
    // Three xs in the stack; next press should bound.
    expect(trace.moveToNextIntersection()).toBe(false);
  });

  test('setIntersectionMode does not toggle the underlying NavMode', () => {
    // Direct guard against re-introducing the force-switch.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]));
    trace.moveOnce('UPWARD'); // Initial-entry handshake
    trace.moveOnce('UPWARD'); // Actual toggle to ROW mode
    const stackBefore = (trace as unknown as { mode: string }).mode;

    trace.setIntersectionMode(true);
    const stackAfter = (trace as unknown as { mode: string }).mode;

    expect(stackAfter).toBe(stackBefore);
  });

  test('moveToNextIntersection walks the current x-stack and bounds at the top', () => {
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 1, y: 9 },
    ]));
    trace.col = 0;
    trace.setIntersectionMode(true);

    expect(trace.moveToNextIntersection()).toBe(true);
    expect(trace.moveToNextIntersection()).toBe(true);
    // Stack has 3 ys; after two forward steps from index 0 we're at index 2.
    expect(trace.moveToNextIntersection()).toBe(false);
  });

  test('moveToPrevIntersection walks the current x-stack and bounds at the bottom', () => {
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ]));
    trace.col = 0;
    trace.setIntersectionMode(true);
    trace.moveToNextIntersection();
    trace.moveToNextIntersection();

    expect(trace.moveToPrevIntersection()).toBe(true);
    expect(trace.moveToPrevIntersection()).toBe(true);
    // Back at index 0 — next prev should bound.
    expect(trace.moveToPrevIntersection()).toBe(false);
  });

  test('setIntersectionMode(true) seeds the stack index at zero', () => {
    // Re-entering the mode after walking around must always restart from
    // the bottom; mirrors how setPointMode reseeds pointModeIndex.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ]));
    trace.col = 0;
    trace.setIntersectionMode(true);
    trace.moveToNextIntersection();
    trace.moveToNextIntersection();
    trace.setIntersectionMode(false);
    trace.setIntersectionMode(true);

    // Index reset means the first prev call should bound, not move.
    expect(trace.moveToPrevIntersection()).toBe(false);
  });

  test('moveToNextIntersection returns false on a single-point x-column', () => {
    // The user can land on a single-point column while the rotor mode is
    // available (the capability is global to the trace). Left/right should
    // bound out cleanly rather than crash.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]));
    trace.col = 0; // Single point at x=0
    trace.setIntersectionMode(true);

    expect(trace.moveToNextIntersection()).toBe(false);
    expect(trace.moveToPrevIntersection()).toBe(false);
  });

  test('navigation is a no-op when intersection mode is not enabled', () => {
    // Defensive: the rotor service only calls moveToNext/PrevIntersection
    // while INTERSECTION_MODE is active, but the trace shouldn't trust that.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
    ]));
    trace.col = 0;

    expect(trace.moveToNextIntersection()).toBe(false);
    expect(trace.moveToPrevIntersection()).toBe(false);
  });
});
