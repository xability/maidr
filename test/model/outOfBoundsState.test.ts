import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * Contract tests for `AbstractTrace.outOfBoundsState` (issue #754).
 *
 * The accessor is declared to return `TraceEmptyState`, not the whole
 * `TraceState` union, because the empty variant is the only thing it ever
 * returns — it exists so `notifyOutOfBounds()` has something to push. That
 * narrowing is what lets the braille and highlight callers hand the value
 * straight to consumers typed as `BrailleState` / `HighlightState`; those
 * accept the empty trace shape but not a populated one, so a wider declaration
 * forced a cast at each site, and the cast is what stopped the compiler from
 * noticing if an override ever returned a populated state.
 *
 * The narrowed type already makes that a build error, so these tests are the
 * runtime half: they pin the invariant so it survives even if the declaration
 * is ever widened back. `ScatterTrace` is covered specifically because it is
 * the one class that overrides the accessor.
 */

/** A bar layer with no selectors, so the trace resolves no highlight elements. */
function barLayer(): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }],
  };
}

/** A scatter layer with no selectors, for the same reason. */
function scatterLayer(): MaidrLayer {
  return {
    id: 'points',
    type: TraceType.SCATTER,
    axes: { x: { label: 'Weight' }, y: { label: 'Height' } },
    data: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: BarTrace | ScatterTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

describe('trace out-of-bounds state', () => {
  it('pushes an empty trace state to observers when navigation leaves the data', () => {
    const trace = new ScatterTrace(scatterLayer());
    const update = jest.fn();
    trace.addObserver({ update });

    trace.notifyOutOfBounds();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ empty: true, type: 'trace' });
  });

  it('carries the cursor position so the empty tone still pans correctly', () => {
    const trace = new ScatterTrace(scatterLayer());
    const update = jest.fn();
    trace.addObserver({ update });

    trace.notifyOutOfBounds();

    // AudioService reads these to place the boundary tone; an empty state that
    // dropped them would play the edge cue dead centre.
    const state = update.mock.calls[0][0] as { audio: unknown };
    expect(state.audio).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        rows: expect.any(Number),
        cols: expect.any(Number),
      }),
    );
  });

  it('is a valid highlight state when a trace resolved no elements', () => {
    // The `as HighlightState` cast this replaces was asserting exactly this.
    const trace = new BarTrace(barLayer());

    expect(stateOf(trace).highlight.empty).toBe(true);
  });

  it('is a valid braille state where scatter has no braille to offer', () => {
    // Scatter supports braille only in grid mode; row/col mode falls back to
    // the same empty state, which used to need an `as BrailleState` cast.
    const trace = new ScatterTrace(scatterLayer());

    expect(stateOf(trace).braille.empty).toBe(true);
  });
});
