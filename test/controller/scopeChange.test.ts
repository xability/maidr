/**
 * @jest-environment jsdom
 */

import type { CommandContext } from '@command/command';
import type { BarPoint, Maidr } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { KeybindingService } from '@service/keybinding';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

const setScope = jest.fn<(scope: string) => void>();

jest.mock('hotkeys-js', () => ({
  __esModule: true,
  default: { setScope: (scope: string) => setScope(scope) },
}));

/**
 * A scope change has to reach the keyboard, or the next keypress runs the
 * wrong command — or none at all.
 *
 * `Context` owns the scope stack and used to call `hotkeys.setScope` itself,
 * which made the model a second writer to a global `KeybindingService` is
 * supposed to own. It now fires `onScopeChange` and `Controller` hands the
 * scope to the service. That handover is a wire like any other: nothing else
 * would notice if it were dropped, and every keypress past the first mode
 * switch would land in the wrong scope.
 *
 * This exercises the wiring rather than the `Controller`, which needs a live
 * DOM, a Redux store and every service to construct — the same approach the
 * navigate-callback tests here take. The subscription is registered exactly as
 * `Controller`'s constructor registers it.
 */

/**
 * Builds a single-subplot bar figure config with the given number of points.
 * @param size - Number of bar points in the layer
 * @returns A Maidr config
 */
function barMaidr(size: number): Maidr {
  const data: BarPoint[] = Array.from({ length: size }, (_, i) => ({
    x: `cat-${i}`,
    y: i + 1,
  }));
  return {
    id: 'scope-test',
    subplots: [[{ layers: [{ id: 'bars', type: TraceType.BAR, data }] }]],
  };
}

/**
 * Builds a two-panel config, whose shape differs from {@link barMaidr}'s.
 * @returns A Maidr config with two subplots
 */
function twoPanelMaidr(): Maidr {
  return {
    id: 'scope-test',
    subplots: [[
      { layers: [{ id: 'left', type: TraceType.BAR, data: [{ x: 'a', y: 1 }] }] },
      { layers: [{ id: 'right', type: TraceType.BAR, data: [{ x: 'b', y: 2 }] }] },
    ]],
  };
}

/**
 * Builds a laid-out figure, as `Controller` does before handing it to `Context`.
 * @param maidr - The config to build from
 * @returns The figure
 */
function figureOf(maidr: Maidr): Figure {
  const figure = new Figure(maidr);
  figure.applyLayout(resolveSubplotLayout(figure.subplots));
  return figure;
}

/**
 * A Context joined to a KeybindingService the way `Controller` joins them.
 * @returns The context, the service, and the subscription between them
 */
function wired(): {
  context: Context;
  subscription: { dispose: () => void };
} {
  const context = new Context(figureOf(barMaidr(3)));
  const keybinding = new KeybindingService({} as unknown as CommandContext);
  const subscription = context.onScopeChange(scope => keybinding.setScope(scope));

  return { context, subscription };
}

describe('carrying a scope change to the keyboard', () => {
  beforeEach(() => {
    setScope.mockClear();
  });

  it('activates the scope the context switched to', () => {
    const { context } = wired();

    context.toggleScope(Scope.BRAILLE);

    expect(setScope).toHaveBeenCalledWith(Scope.BRAILLE);
  });

  it('realigns the keyboard when a live update rebuilds the navigation stack', () => {
    // A replacement of a different shape starts the scope stack again from
    // scratch, so the keyboard has to follow it out of braille.
    const { context } = wired();
    context.toggleScope(Scope.BRAILLE);
    setScope.mockClear();

    context.replaceFigure(() => figureOf(twoPanelMaidr()));

    expect(setScope).toHaveBeenCalledWith(Scope.SUBPLOT);
    expect(context.scope).toBe(Scope.SUBPLOT);
  });

  it('leaves the keyboard alone when a live update keeps the same shape', () => {
    // Braille mode survives a data update: the scope stack is restored rather
    // than rebuilt, so nothing should touch the keyboard scope.
    const { context } = wired();
    context.toggleScope(Scope.BRAILLE);
    setScope.mockClear();

    context.replaceFigure(() => figureOf(barMaidr(4)));

    expect(setScope).not.toHaveBeenCalled();
    expect(context.scope).toBe(Scope.BRAILLE);
  });

  it('stops carrying changes once the subscription is disposed', () => {
    const { context, subscription } = wired();

    subscription.dispose();
    context.toggleScope(Scope.BRAILLE);

    expect(setScope).not.toHaveBeenCalled();
  });
});
