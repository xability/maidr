import type { CommandContext } from '@command/command';
import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { NotificationService } from '@service/notification';
import type { Keys } from '@type/event';
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import { CommandFactory } from '@command/factory';
import { GoToMaxValueCommand, GoToMinValueCommand } from '@command/goTo';
import { describe, expect, jest, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { GoToExtremaService as RealGoToExtremaService } from '@service/goToExtrema';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/** A single-series bar layer whose extreme bars sit away from the ends. */
function barLayer(values: number[]): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: values.map((y, index) => ({ x: `Q${index + 1}`, y })),
  };
}

/**
 * The real service over a stub context. `goToExtremeValue` reads only the
 * active plot and its state, so a fuller context would add nothing but the
 * fixtures needed to build one.
 */
function serviceFor(active: unknown): RealGoToExtremaService {
  const context = {
    get active() {
      return active;
    },
    get state() {
      return (active as { state?: unknown })?.state ?? { type: 'trace', empty: true };
    },
  } as unknown as Context;

  return new RealGoToExtremaService(context, { toggleFocus: (): void => {} } as never);
}

describe('jumping straight to a layer extreme', () => {
  test('min lands on the lowest bar and max on the highest', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Q4');

    expect(service.goToExtremeValue('max')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Q2');
  });

  test('picks the most extreme of several reported targets', () => {
    // A trace may report one min/max per tied point, per segment or per group
    // (line does, per intersecting series), so the winner has to be chosen by
    // value rather than by being first in the list.
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    const targets: ExtremaTarget[] = [
      { label: 'Min of series A', value: 30, pointIndex: 0, segment: 'bar', type: 'min', navigationType: 'point' },
      { label: 'Min of series B', value: 10, pointIndex: 3, segment: 'bar', type: 'min', navigationType: 'point' },
      { label: 'Max of series A', value: 90, pointIndex: 1, segment: 'bar', type: 'max', navigationType: 'point' },
      { label: 'Max of series B', value: 70, pointIndex: 4, segment: 'bar', type: 'max', navigationType: 'point' },
    ];
    jest.spyOn(trace, 'getExtremaTargets').mockReturnValue(targets);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Q4');

    expect(service.goToExtremeValue('max')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Q2');
  });

  test('ignores intersection targets, which are neither extreme', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    jest.spyOn(trace, 'getExtremaTargets').mockReturnValue([
      { label: 'Point intersection', value: -100, pointIndex: 2, segment: 'intersection', type: 'intersection', navigationType: 'point' },
      { label: 'Min bar', value: 10, pointIndex: 3, segment: 'bar', type: 'min', navigationType: 'point' },
    ]);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toBe(true);
    expect(trace.getCurrentXValue()).toBe('Q4');
  });

  test('reports failure when the layer offers no extrema at all', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    jest.spyOn(trace, 'getExtremaTargets').mockReturnValue([]);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toBe(false);
    expect(service.goToExtremeValue('max')).toBe(false);
  });

  test('reports failure when the active plot is not an extrema-navigable trace', () => {
    // The brackets are bound across the whole scope, so they fire on the
    // figure lobby and on trace types without extrema support too.
    const service = serviceFor({ state: { type: 'subplot', empty: false } });

    expect(service.goToExtremeValue('min')).toBe(false);
  });

  test('reports failure on an empty trace', () => {
    const service = serviceFor({ state: { type: 'trace', empty: true } });

    expect(service.goToExtremeValue('max')).toBe(false);
  });
});

describe('bracket key commands', () => {
  function commandFixture(navigated: boolean): {
    service: GoToExtremaService;
    notification: NotificationService;
  } {
    return {
      service: { goToExtremeValue: jest.fn(() => navigated) } as unknown as GoToExtremaService,
      notification: { notify: jest.fn() } as unknown as NotificationService,
    };
  }

  test('[ asks for the minimum and stays silent when it lands', () => {
    const { service, notification } = commandFixture(true);

    new GoToMinValueCommand(service, notification).execute();

    expect(service.goToExtremeValue).toHaveBeenCalledWith('min');
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('] asks for the maximum and stays silent when it lands', () => {
    const { service, notification } = commandFixture(true);

    new GoToMaxValueCommand(service, notification).execute();

    expect(service.goToExtremeValue).toHaveBeenCalledWith('max');
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('announces rather than doing nothing when there is nowhere to jump', () => {
    // A silent press reads as a broken shortcut to a screen reader user.
    const min = commandFixture(false);
    new GoToMinValueCommand(min.service, min.notification).execute();

    const max = commandFixture(false);
    new GoToMaxValueCommand(max.service, max.notification).execute();

    expect(min.notification.notify).toHaveBeenCalledWith('No minimum value to go to in this layer');
    expect(max.notification.notify).toHaveBeenCalledWith('No maximum value to go to in this layer');
  });
});

describe('bracket key wiring', () => {
  // A keymap name and its `CommandFactory` case are matched by string alone:
  // `create` throws `Invalid command name` on a mismatch, and it throws when
  // the key is pressed, not when anything is built. Nothing else in the suite
  // presses a key, so a rename on one side would ship green.
  const SCOPES = [Scope.TRACE, Scope.BRAILLE, Scope.CANDLESTICK_DELTA];

  test.each(SCOPES)('%s binds the brackets to the min and max commands', (scope) => {
    const keymap = getKeymapForScope(scope);

    expect(keymap.GO_TO_MIN_VALUE?.hotkey).toBe('[');
    expect(keymap.GO_TO_MAX_VALUE?.hotkey).toBe(']');
  });

  test('the factory resolves both keymap names to their commands', () => {
    const factory = new CommandFactory({} as unknown as CommandContext);

    // `Keys` is the intersection of every scope's keymap keys, and one of
    // those keymaps is empty, so it narrows to `never`. KeybindingService
    // casts at the same boundary when it walks SCOPED_KEYMAP; this mirrors it
    // rather than working around a quirk this test did not introduce.
    expect(factory.create('GO_TO_MIN_VALUE' as Keys)).toBeInstanceOf(GoToMinValueCommand);
    expect(factory.create('GO_TO_MAX_VALUE' as Keys)).toBeInstanceOf(GoToMaxValueCommand);
  });

  test('both carry a description so the generated help menu lists them', () => {
    const keymap = getKeymapForScope(Scope.TRACE);

    expect(keymap.GO_TO_MIN_VALUE.description).toBe('Go to Minimum Value');
    expect(keymap.GO_TO_MAX_VALUE.description).toBe('Go to Maximum Value');
    expect(keymap.GO_TO_MIN_VALUE.showInHelp).not.toBe(false);
    expect(keymap.GO_TO_MAX_VALUE.showInHelp).not.toBe(false);
  });
});
