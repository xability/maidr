/**
 * Asking where the cursor is must not cost an announcement.
 *
 * `Context.state.type` answers the same question, but only after the active
 * trace has built its audio, braille, text and highlight snapshot -- and, from
 * the multi-panel lobby, after recursing through the subplot to do it.
 * `AutoplayService` asks once per tick, which at the fastest rate is a hundred
 * times a second, so the answer has to be free.
 */

import type { Maidr } from '@type/grammar';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * A figure of `panels` single-layer bar subplots.
 * @param panels How many subplots the figure holds
 * @returns The MAIDR payload
 */
function createMaidr(panels: number): Maidr {
  return {
    id: 'level-test',
    subplots: Array.from({ length: panels }, (_, index) => [{
      layers: [{
        id: String(index),
        type: TraceType.BAR,
        data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
      }],
    }]),
  };
}

describe('context reports the active level without building a state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers for a single-panel figure without computing a trace state', () => {
    const context = new Context(new Figure(createMaidr(1)));
    const traceState = jest.spyOn(AbstractTrace.prototype, 'state', 'get');

    const level = context.activeLevel;

    expect(level).toBe('trace');
    expect(traceState).not.toHaveBeenCalled();
  });

  it('answers from the multi-panel lobby without computing a trace state', () => {
    const context = new Context(new Figure(createMaidr(2)));
    const traceState = jest.spyOn(AbstractTrace.prototype, 'state', 'get');

    const level = context.activeLevel;

    expect(level).toBe('figure');
    expect(traceState).not.toHaveBeenCalled();
  });

  it('agrees with the level the state reports, at every depth', () => {
    const context = new Context(new Figure(createMaidr(2)));

    const lobby = { level: context.activeLevel, type: context.state.type };
    context.enterSubplot();
    const entered = { level: context.activeLevel, type: context.state.type };
    context.exitSubplot();
    const left = { level: context.activeLevel, type: context.state.type };

    expect(lobby).toEqual({ level: 'figure', type: 'figure' });
    expect(entered).toEqual({ level: 'trace', type: 'trace' });
    expect(left).toEqual({ level: 'figure', type: 'figure' });
  });

  it('still refuses to enter a subplot from below the lobby', () => {
    const context = new Context(new Figure(createMaidr(2)));
    context.enterSubplot();

    const again = context.enterSubplot();

    expect(again).toBe(false);
    expect(context.activeLevel).toBe('trace');
  });
});
