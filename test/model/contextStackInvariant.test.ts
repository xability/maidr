import type { Maidr } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * Pins the "no bare Subplot on the context stack" invariant that several
 * commands depend on. `Context.enterSubplot()` always pushes a Subplot *and*
 * its active Trace together, and `exitSubplot()` pops both together, so
 * `context.state` is only ever a `figure` (at the lobby) or a `trace` (inside a
 * subplot) — never a bare `subplot`.
 *
 * `AnnounceCommand.resolveActiveTraceState()` and `AnnounceTitleCommand` keep a
 * `state.type === 'subplot'` branch documented as defensively unreachable; this
 * test makes that invariant fail loudly if a future refactor of
 * enterSubplot/exitSubplot ever leaves a Subplot exposed on top of the stack.
 */
function createMultiPanelMaidr(): Maidr {
  return {
    id: 'stack-invariant',
    // Two subplots -> a genuine multi-panel figure that starts at the lobby.
    subplots: [
      [{ layers: [{ id: '0', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] }] }],
      [{ layers: [{ id: '1', type: TraceType.BAR, data: [{ x: 'A', y: 2 }] }] }],
    ],
  };
}

describe('Context stack invariant (no bare Subplot on top)', () => {
  test('state is figure at the lobby, trace inside a subplot, never subplot', () => {
    const context = new Context(new Figure(createMultiPanelMaidr()));

    // At the multi-panel lobby the active element is the figure.
    expect(context.state.type).toBe('figure');

    // Entering a subplot pushes Subplot + Trace, so the exposed state is the
    // trace — the bare-subplot state is never observable.
    context.enterSubplot();
    expect(context.state.type).toBe('trace');
    expect(context.state.type).not.toBe('subplot');

    // Exiting pops Trace + Subplot together, back to the figure lobby.
    context.exitSubplot();
    expect(context.state.type).toBe('figure');
  });

  test('repeated enter/exit cycles never expose a bare subplot state', () => {
    const context = new Context(new Figure(createMultiPanelMaidr()));

    for (let i = 0; i < 3; i++) {
      expect(context.state.type).toBe('figure');
      context.enterSubplot();
      expect(context.state.type).not.toBe('subplot');
      expect(context.state.type).toBe('trace');
      context.exitSubplot();
    }

    expect(context.state.type).toBe('figure');
  });
});
