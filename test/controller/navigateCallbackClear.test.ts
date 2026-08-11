/**
 * @jest-environment jsdom
 */

import type { Maidr, NavigateCallback } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { TraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * Leaving a subplot has to reach a canvas adapter, or its highlight is stranded.
 *
 * `onNavigate` used to be observable only from traces, so the figure lobby --
 * where no trace is active -- said nothing at all. An adapter drawing an
 * overlay had no way to learn the selection had ended: it kept the last
 * point's box on screen and carried it to whichever panel the user moved to
 * next, outlining a chart the box does not belong to (#776).
 *
 * This exercises the wiring rather than the `Controller`, which needs a live
 * DOM, a Redux store and every service to construct. What is under test is the
 * contract between the model's observers and the callback, so the observers
 * are registered the same way `Controller.registerNavigateCallback` registers
 * them and the moves are driven through `Context` exactly as a keypress does.
 */

function twoPanels(): Maidr {
  return {
    id: 'two-panels',
    subplots: [
      [
        {
          layers: [{
            id: '0',
            type: TraceType.BAR,
            data: [{ x: 'Apples', y: 30 }, { x: 'Bananas', y: 50 }],
          }],
        },
        {
          layers: [{
            id: '1',
            type: TraceType.BAR,
            data: [{ x: 'Carrots', y: 40 }, { x: 'Peas', y: 60 }],
          }],
        },
      ],
    ],
  } as Maidr;
}

const FORWARD: MovableDirection = 'FORWARD';

describe('the navigate callback reports the selection ending', () => {
  let figure: Figure;
  let context: Context;
  let seen: Array<{ layerId: string; row: number; col: number } | null>;

  /** Mirrors `Controller.registerNavigateCallback`. */
  function register(callback: NavigateCallback): void {
    const observer = {
      update: (state: TraceState): void => {
        if (!state.empty && !state.braille.empty) {
          callback({
            layerId: state.layerId,
            row: state.braille.row,
            col: state.braille.col,
          });
        }
      },
    };
    figure.subplots.forEach(row => row.forEach((subplot) => {
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(observer as never);
      }));
    }));
    figure.addObserver({ update: () => callback(null) } as never);
  }

  beforeEach(() => {
    figure = new Figure(twoPanels());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    context = new Context(figure);
    seen = [];
    register(event => void seen.push(event));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports a position while a point is selected', () => {
    context.enterSubplot();
    seen.length = 0;

    // The cursor sits before the first point on entry, so the first move
    // lands on column 0 rather than stepping past it.
    context.moveOnce(FORWARD);
    expect(seen.at(-1)).toEqual({ layerId: '0', row: 0, col: 0 });

    context.moveOnce(FORWARD);
    expect(seen.at(-1)).toEqual({ layerId: '0', row: 0, col: 1 });
  });

  it('reports null on leaving the subplot for the figure lobby', () => {
    context.enterSubplot();
    context.moveOnce(FORWARD);
    seen.length = 0;

    context.exitSubplot();

    // Without the figure observer this array stays empty, and an adapter goes
    // on outlining the point the user has already left.
    expect(seen).toContain(null);
  });

  it('reports null again while moving between panels at the lobby', () => {
    context.enterSubplot();
    context.moveOnce(FORWARD);
    context.exitSubplot();
    seen.length = 0;

    context.moveOnce(FORWARD);

    // Every lobby move must keep saying "nothing selected". A single clear on
    // exit would be undone by nothing, but the box must not reappear either.
    expect(seen.every(event => event === null)).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('reports a position again on entering the second panel', () => {
    context.enterSubplot();
    context.exitSubplot();
    // The lobby cursor starts before the first panel too, so the first move
    // lands on panel 1 and the second is what reaches panel 2.
    context.moveOnce(FORWARD);
    context.moveOnce(FORWARD);
    seen.length = 0;

    context.enterSubplot();
    context.moveOnce(FORWARD);

    // The second panel's own layer, so the highlight lands on this chart.
    expect(seen.at(-1)).toEqual({ layerId: '1', row: 0, col: 0 });
  });
});
