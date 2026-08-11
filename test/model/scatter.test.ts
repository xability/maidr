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

describe('ScatterTrace autoplay-driven movement (moveOnce / isMovable)', () => {
  // Autoplay drives movement through context.moveOnce / isMovable rather than
  // the rotor service, so both must honor the active rotor sub-mode. These
  // tests exercise that path directly (the same path AutoplayService walks).

  describe('point mode', () => {
    // Reading order sorts (y desc, x asc); entry seeds at the top of the
    // current x-column, which for this data is reading position 0.
    const makeTrace = (): ScatterTrace => {
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 0, y: 1 },
      ]));
      // Consume the initial-entry handshake so moveOnce steps immediately —
      // mirrors a user who has navigated before opening the rotor.
      trace.isInitialEntry = false;
      return trace;
    };

    test('moveOnce walks the full reading order then bounds', () => {
      const trace = makeTrace();
      trace.setPointMode(true);

      expect(trace.isMovable('BACKWARD')).toBe(false); // at reading position 0
      expect(trace.isMovable('FORWARD')).toBe(true);

      let steps = 0;
      while (trace.isMovable('FORWARD')) {
        expect(trace.moveOnce('FORWARD')).toBe(true);
        steps++;
      }
      // Three points, starting at position 0 → two forward steps to the end.
      expect(steps).toBe(2);
      expect(trace.moveOnce('FORWARD')).toBe(false);
    });

    test('autoplay step counts cover every datapoint', () => {
      const trace = makeTrace();
      trace.setPointMode(true);
      const autoplay = (trace.state as { autoplay: Record<string, number> }).autoplay;
      expect(autoplay.FORWARD).toBe(3);
      expect(autoplay.BACKWARD).toBe(3);
      expect(autoplay.UPWARD).toBe(3);
      expect(autoplay.DOWNWARD).toBe(3);
    });
  });

  describe('intersection mode', () => {
    const makeTrace = (): ScatterTrace => {
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 1 },
        { x: 0, y: 2 },
        { x: 0, y: 3 },
        { x: 1, y: 9 },
      ]));
      trace.isInitialEntry = false; // skip the initial-entry handshake
      trace.col = 0; // x=0 column holds a 3-point stack
      trace.setIntersectionMode(true);
      return trace;
    };

    test('moveOnce walks the stack left/right and bounds at the top', () => {
      const trace = makeTrace();

      expect(trace.isMovable('BACKWARD')).toBe(false); // at stack index 0
      expect(trace.isMovable('FORWARD')).toBe(true);

      expect(trace.moveOnce('FORWARD')).toBe(true);
      expect(trace.moveOnce('FORWARD')).toBe(true);
      expect(trace.isMovable('FORWARD')).toBe(false);
      expect(trace.moveOnce('FORWARD')).toBe(false);
    });

    test('vertical movement is never allowed', () => {
      const trace = makeTrace();
      expect(trace.isMovable('UPWARD')).toBe(false);
      expect(trace.isMovable('DOWNWARD')).toBe(false);
      expect(trace.moveOnce('UPWARD')).toBe(false);
      expect(trace.moveOnce('DOWNWARD')).toBe(false);
    });

    test('autoplay step counts match the current stack length', () => {
      const trace = makeTrace();
      const autoplay = (trace.state as { autoplay: Record<string, number> }).autoplay;
      expect(autoplay.FORWARD).toBe(3);
      expect(autoplay.BACKWARD).toBe(3);
    });
  });
});

describe('ScatterTrace rotor cursor reporting', () => {
  /** Reads the audio panning a mode emits for its current cursor. */
  function panningOf(trace: ScatterTrace): { x: number; y: number; rows: number; cols: number } {
    const state = trace.state;
    if (state.empty || state.type !== 'trace') {
      throw new Error('expected a populated trace state');
    }
    const { x, y, rows, cols } = state.audio.panning;
    return { x: x as number, y, rows, cols };
  }

  describe('point mode', () => {
    test('entering the mode consumes the initial-entry handshake', () => {
      // Regression: moveOnce checks isInitialEntry before the mode branches,
      // so an armed flag made autoplay's first tick notify without moving —
      // replaying the point the user was already standing on and losing a
      // step. Note this trace is deliberately NOT pre-cleared.
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
        { x: 0, y: 1 },
      ]));
      expect(trace.isInitialEntry).toBe(true);

      trace.setPointMode(true);
      expect(trace.isInitialEntry).toBe(false);

      const before = panningOf(trace);
      expect(trace.moveOnce('FORWARD')).toBe(true);
      expect(panningOf(trace)).not.toEqual(before);
    });

    test('position reports the point within its own x-column, not a flat row 1 of 1', () => {
      // Two points share x=0. Announce Position reads panning y/rows, so a
      // fixed {y: 0, rows: 1} would describe both identically — in the one
      // mode whose whole purpose is telling individual points apart.
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
      expect(upper.y).not.toBe(lower.y); // and they are told apart
      expect([lower.y, upper.y]).toEqual([0, 1]);
    });

    test('the boundary chime pans where the cursor is, not at a stale column', () => {
      // The base out-of-bounds state reads row/col, which point mode never
      // touches: walking to the right-hand edge used to chime hard left.
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 3 },
        { x: 1, y: 2 },
        { x: 2, y: 1 },
      ]));
      trace.setPointMode(true);
      const update = jest.fn();
      trace.addObserver({ update });

      while (trace.isMovable('FORWARD')) {
        trace.movePointRight();
      }
      const lastInBounds = panningOf(trace);
      expect(lastInBounds.x).toBe(2); // right-most column

      update.mockClear();
      expect(trace.movePointRight()).toBe(false);

      const bounds = update.mock.calls[0][0] as { empty: boolean; audio: { x: number; cols: number } };
      expect(bounds.empty).toBe(true);
      expect(bounds.audio.x).toBe(lastInBounds.x);
      expect(bounds.audio.cols).toBe(lastInBounds.cols);
    });

    test('up and down walk the column order independently of left and right', () => {
      // columnOrder is (x asc, y desc), so within one x-column "up" is a
      // step backward through it. Only the reading axis had coverage.
      const trace = new ScatterTrace(createScatterLayer([
        { x: 0, y: 1 },
        { x: 0, y: 5 },
        { x: 1, y: 3 },
      ]));
      trace.setPointMode(true);

      // Entry seeds the top of column x=0, i.e. (0,5).
      expect(panningOf(trace)).toMatchObject({ x: 0, y: 1, rows: 2 });
      expect(trace.movePointUp()).toBe(false); // already the top of the order
      expect(trace.movePointDown()).toBe(true);
      expect(panningOf(trace)).toMatchObject({ x: 0, y: 0, rows: 2 }); // (0,1)
      expect(trace.movePointDown()).toBe(true);
      expect(panningOf(trace)).toMatchObject({ x: 1, rows: 1 }); // (1,3)
      expect(trace.movePointDown()).toBe(false);
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
