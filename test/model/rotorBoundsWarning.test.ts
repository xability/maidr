import type { MaidrLayer } from '@type/grammar';
import { describe, expect, it, jest } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TraceType } from '@type/grammar';

/**
 * `notifyRotorBounds` raises the warning flag around one notification. The
 * flag is transient: it exists so the audio service plays the boundary cue
 * once, not so the trace stays in the warning state.
 *
 * `CommandExecutor` swallows an exception thrown by a command, so an observer
 * that throws during that one notification leaves the page running. If the
 * flag is not restored on that path, every later `state` read answers with
 * the warning variant and navigation goes silent for the rest of the session.
 */
function barLayer(): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }],
  };
}

describe('rotor bounds warning', () => {
  it('flags the state as a warning for the notification only', () => {
    const trace = new BarTrace(barLayer());
    const seen: boolean[] = [];
    trace.addObserver({ update: state => seen.push(state.empty && state.warning === true) });

    trace.notifyRotorBounds();

    expect(seen).toEqual([true]);
    expect(trace.state.empty).toBe(false);
  });

  it('clears the warning flag when an observer throws', () => {
    const trace = new BarTrace(barLayer());
    trace.addObserver({
      update: jest.fn(() => {
        throw new Error('observer failed');
      }),
    });

    expect(() => trace.notifyRotorBounds()).toThrow('observer failed');

    expect(trace.state.empty).toBe(false);
  });
});
