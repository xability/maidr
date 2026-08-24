import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
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

/** Narrows the trace state union to the populated case. */
function stateOf(trace: ScatterTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

/**
 * Three points whose reading order (y desc, x asc) crosses both x-columns:
 * (0,2) -> (1,2) -> (0,1). Seeded from col 0, the entry point is (0,2), the
 * first in that order, so the walk covers the whole layer.
 */
function readingOrderPoints(): ScatterPoint[] {
  return [
    { x: 0, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 1 },
  ];
}

describe('ScatterTrace point mode', () => {
  test('supportsPointMode reports true for a scatter trace with points', () => {
    // The rotor offers POINT_MODE per trace; a single datapoint is enough,
    // because reading one point individually is still what the mode is for.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    const single = new ScatterTrace(createScatterLayer([{ x: 0, y: 1 }]));

    expect(trace.supportsPointMode()).toBe(true);
    expect(single.supportsPointMode()).toBe(true);
  });

  test('movePointRight walks reading order across x-columns and bounds at the end', () => {
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.setPointMode(true);

    // (0,2) -> (1,2): same y, next x. Crossing an x-column is the whole
    // point of reading order — a per-column walk would bound here instead.
    expect(trace.movePointRight()).toBe(true);
    expect(stateOf(trace).text.main.value).toBe(1);
    expect(stateOf(trace).text.cross?.value).toBe(2);

    // (1,2) -> (0,1): y drops, x wraps back to the leftmost column.
    expect(trace.movePointRight()).toBe(true);
    expect(stateOf(trace).text.main.value).toBe(0);
    expect(stateOf(trace).text.cross?.value).toBe(1);

    // Three points, so the third press has nowhere to go. No wrap.
    expect(trace.movePointRight()).toBe(false);
  });

  test('movePointDown and movePointUp walk column-major order within an x-column', () => {
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 1, y: 9 },
    ]));
    trace.setPointMode(true);

    // Seeded at the top of column x=0 (highest y), so up bounds immediately.
    expect(trace.movePointUp()).toBe(false);

    expect(trace.movePointDown()).toBe(true);
    expect(stateOf(trace).text.main.value).toBe(0);
    expect(stateOf(trace).text.cross?.value).toBe(2);

    expect(trace.movePointDown()).toBe(true);
    expect(stateOf(trace).text.cross?.value).toBe(1);

    // Back up the same column, in the same order.
    expect(trace.movePointUp()).toBe(true);
    expect(stateOf(trace).text.cross?.value).toBe(2);
    expect(trace.movePointUp()).toBe(true);
    expect(stateOf(trace).text.cross?.value).toBe(3);
    expect(trace.movePointUp()).toBe(false);
  });

  test('setPointMode(true) seeds the entry point from the current COL selection', () => {
    // COL mode highlights a whole x-column; entry lands on the first of that
    // group in reading order, which at fixed x is the highest y.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1 },
      { x: 5, y: 2 },
      { x: 5, y: 8 },
    ]));
    trace.col = 1; // The x=5 column, not the default x=0.

    trace.setPointMode(true);

    expect(stateOf(trace).text.main.value).toBe(5);
    expect(stateOf(trace).text.cross?.value).toBe(8);
  });

  test('setPointMode(true) seeds from the current ROW selection after a nav-mode toggle', () => {
    // Same regression the intersection tests guard: entry must respect the
    // mode the user is actually in. In ROW mode the group is a y-row, and
    // the first of it in reading order is the lowest x.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 1, y: 5 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 7, y: 9 },
    ]));
    trace.moveOnce('UPWARD'); // Initial-entry handshake; mode stays COL.
    trace.moveOnce('UPWARD'); // Toggle to ROW mode at y=5.
    trace.moveOnce('UPWARD'); // Step up to the y=9 row.

    trace.setPointMode(true);

    // A COL-seeded entry would still be sitting at (1,5).
    expect(stateOf(trace).text.main.value).toBe(7);
    expect(stateOf(trace).text.cross?.value).toBe(9);
  });

  test('point navigation is a no-op when point mode is not enabled', () => {
    // Defensive, mirroring the intersection-mode guard: the rotor only calls
    // these while POINT_MODE is active, but the trace shouldn't trust that.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));

    expect(trace.movePointLeft()).toBe(false);
    expect(trace.movePointRight()).toBe(false);
    expect(trace.movePointUp()).toBe(false);
    expect(trace.movePointDown()).toBe(false);
  });

  test('setPointMode(true) re-seeds rather than resuming after an exit', () => {
    // Re-entering the mode after walking around must restart from the
    // seeded corner; mirrors how setIntersectionMode resets its stack index.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.setPointMode(true);
    trace.movePointRight();
    trace.movePointRight();

    trace.setPointMode(false);
    trace.setPointMode(true);

    expect(stateOf(trace).text.main.value).toBe(0);
    expect(stateOf(trace).text.cross?.value).toBe(2);
    // Re-seeded to reading position 0, so the first left press should bound.
    expect(trace.movePointLeft()).toBe(false);
  });
});

describe('ScatterTrace 3D announcements', () => {
  test('point mode carries z in the text state', () => {
    // Regression: POINT_MODE sonified z as an echo train but never announced
    // the number, leaving it unreachable in the one mode built to read a
    // single 3D point.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 2, z: 10 },
      { x: 1, y: 2, z: 20 },
      { x: 0, y: 1, z: 30 },
    ]));
    trace.setPointMode(true);

    expect(stateOf(trace).text.z?.value).toBe(10);

    trace.movePointRight();

    expect(stateOf(trace).text.z?.value).toBe(20);
  });

  test('intersection mode carries both the z announcement and the z audio cue', () => {
    // Regression: a user steps into intersection mode to pull one point out
    // of a stack, so dropping z there made the isolated point the only one
    // whose third dimension was neither spoken nor heard.
    const trace = new ScatterTrace(createScatterLayer([
      { x: 0, y: 1, z: 2 },
      { x: 0, y: 2, z: 6 },
      { x: 0, y: 3, z: 10 },
    ]));
    trace.col = 0;
    trace.setIntersectionMode(true);
    trace.moveToNextIntersection(); // Onto (0,2), z=6 — mid-range of z.

    const state = stateOf(trace);

    expect(state.text.z?.value).toBe(6);
    // z spans 2..10, so 6 normalises to the midpoint intensity.
    expect(state.audio.zIntensity).toBe(0.5);
  });

  test('moveOnce advances the point cursor without flipping the nav mode', () => {
    // Regression: autoplay issues raw moveOnce calls. Falling through to the
    // row/col stepper repeated one tone while silently toggling COL <-> ROW
    // underneath the user.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.moveOnce('UPWARD'); // Initial-entry handshake.
    trace.setPointMode(true);
    const modeBefore = (trace as unknown as { mode: string }).mode;

    expect(trace.moveOnce('FORWARD')).toBe(true);

    expect(stateOf(trace).text.main.value).toBe(1);
    expect(stateOf(trace).text.cross?.value).toBe(2);
    expect((trace as unknown as { mode: string }).mode).toBe(modeBefore);
  });

  test('isMovable bounds at each end of the point ordering and clears in the middle', () => {
    // Autoplay gates on isMovable, so it has to agree with the steppers at
    // both ends of both orders or autoplay runs past the data.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.setPointMode(true);

    // Seeded at (0,2): first in reading order, and top of column x=0.
    expect(trace.isMovable('BACKWARD')).toBe(false);
    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.isMovable('FORWARD')).toBe(true);
    expect(trace.isMovable('DOWNWARD')).toBe(true);

    trace.movePointRight(); // (1,2) — interior of the reading order.

    expect(trace.isMovable('BACKWARD')).toBe(true);
    expect(trace.isMovable('FORWARD')).toBe(true);

    trace.movePointRight(); // (0,1) — last in reading order.

    expect(trace.isMovable('FORWARD')).toBe(false);
    expect(trace.isMovable('BACKWARD')).toBe(true);
  });

  test('a trace with no z emits no z intensity in any mode', () => {
    // The 2D guarantee: the entire 3D feature has to be invisible to a
    // plain scatter, and this one field is what the audio service branches
    // on to decide whether to play an echo train at all.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.col = 0;

    const colState = stateOf(trace);

    expect(colState.audio.zIntensity).toBeUndefined();
    expect(colState.text.z).toBeUndefined();

    trace.setPointMode(true);
    const pointState = stateOf(trace);

    expect(pointState.audio.zIntensity).toBeUndefined();
    expect(pointState.text.z).toBeUndefined();
  });

  test('dispose releases the point-navigation arrays', () => {
    // flatPoints pairs each datapoint with its rendered SVG element, so a
    // retained array keeps a detached DOM tree alive for as long as the
    // disposed trace is reachable.
    const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
    trace.setPointMode(true);

    trace.dispose();

    const internals = trace as unknown as {
      flatPoints: unknown[];
      readingOrder: number[];
      columnOrder: number[];
    };
    expect(internals.flatPoints).toHaveLength(0);
    expect(internals.readingOrder).toHaveLength(0);
    expect(internals.columnOrder).toHaveLength(0);
    // The observable consequence: the rotor stops offering the mode.
    expect(trace.supportsPointMode()).toBe(false);
  });
});

describe('ScatterTrace rotor cursor reporting', () => {
  /** Reads the audio panning a mode emits for its current cursor. */
  function panningOf(trace: ScatterTrace): { x: number; y: number; rows: number; cols: number } {
    const { x, y, rows, cols } = stateOf(trace).audio.panning;
    return { x, y, rows, cols };
  }

  describe('point mode', () => {
    test('entering the mode consumes the initial-entry handshake', () => {
      // Regression: moveOnce checks isInitialEntry before the mode branches,
      // so an armed flag made autoplay's first tick notify without moving —
      // replaying the point the user was already standing on and losing a
      // step. This trace is deliberately NOT pre-cleared.
      const trace = new ScatterTrace(createScatterLayer(readingOrderPoints()));
      expect(trace.isInitialEntry).toBe(true);

      trace.setPointMode(true);
      expect(trace.isInitialEntry).toBe(false);

      const before = panningOf(trace);
      expect(trace.moveOnce('FORWARD')).toBe(true);
      expect(panningOf(trace)).not.toEqual(before);
    });

    test('position reports the point within its own x-column, not a flat row 1 of 1', () => {
      // Two points share x=0. Announce Position reads panning y/rows, so a
      // fixed {y: 0, rows: 1} describes both identically — in the one mode
      // whose whole purpose is telling individual points apart.
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 1, y: 3 },
      ]));
      trace.setPointMode(true);

      // Entry seeds the top of the current x-column, i.e. (0,2); reading
      // order is y desc, x asc, so one step right lands on (0,1).
      const upper = panningOf(trace);
      expect(trace.movePointRight()).toBe(true);
      const lower = panningOf(trace);

      expect(upper.x).toBe(lower.x); // same x-column
      expect(upper.rows).toBe(2); // that column stacks two points
      expect([lower.y, upper.y]).toEqual([0, 1]); // and they are told apart
    });

    test('the boundary chime describes the same geometry as the tone before it', () => {
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 3 },
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ]));
      trace.setPointMode(true);
      const update = jest.fn();
      trace.addObserver({ update });

      while (trace.isMovable('FORWARD')) {
        trace.movePointRight();
      }
      const lastInBounds = panningOf(trace);

      update.mockClear();
      expect(trace.movePointRight()).toBe(false);

      const bounds = update.mock.calls[0][0] as { empty: boolean; audio: { x: number; y: number; rows: number } };
      expect(bounds.empty).toBe(true);
      expect(bounds.audio.x).toBe(lastInBounds.x);
      expect(bounds.audio.y).toBe(lastInBounds.y);
      expect(bounds.audio.rows).toBe(lastInBounds.rows);
    });
  });

  describe('intersection mode', () => {
    test('COL position advances through the stack instead of freezing at row 1', () => {
      // panning.y is what Announce Position reports; pinning it to 0 said
      // "row 1 of 3" at every step of a three-point stack.
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 0, y: 3 },
        { x: 1, y: 9 },
      ]));
      trace.isInitialEntry = false;
      trace.col = 0;
      trace.setIntersectionMode(true);

      const seen = [panningOf(trace).y];
      while (trace.moveToNextIntersection()) {
        seen.push(panningOf(trace).y);
      }

      expect(seen).toEqual([0, 1, 2]);
      expect(panningOf(trace).rows).toBe(3);
    });

    test('entering the mode consumes the initial-entry handshake', () => {
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ]));
      expect(trace.isInitialEntry).toBe(true);

      trace.setIntersectionMode(true);

      expect(trace.isInitialEntry).toBe(false);
      // handleInitialEntry() would have reset row/col/mode and re-anchored
      // the stack this mode walks; only the flag may change.
      expect(trace.col).toBe(0);
      expect(trace.moveOnce('FORWARD')).toBe(true);
    });
  });
});
