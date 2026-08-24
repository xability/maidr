import type { CommandContext } from '@command/command';
import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
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

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect(trace.getCurrentXValue()).toBe('Q4');

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
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

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect(trace.getCurrentXValue()).toBe('Q4');

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(trace.getCurrentXValue()).toBe('Q2');
  });

  test('ignores intersection targets, which are neither extreme', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    jest.spyOn(trace, 'getExtremaTargets').mockReturnValue([
      { label: 'Point intersection', value: -100, pointIndex: 2, segment: 'intersection', type: 'intersection', navigationType: 'point' },
      { label: 'Min bar', value: 10, pointIndex: 3, segment: 'bar', type: 'min', navigationType: 'point' },
    ]);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect(trace.getCurrentXValue()).toBe('Q4');
  });

  test('reports failure when the layer offers no extrema at all', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    jest.spyOn(trace, 'getExtremaTargets').mockReturnValue([]);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toBeNull();
    expect(service.goToExtremeValue('max')).toBeNull();
  });

  test('reports failure when the active plot is not an extrema-navigable trace', () => {
    // The brackets are bound across the whole scope, so they fire on the
    // figure lobby and on trace types without extrema support too.
    const service = serviceFor({ state: { type: 'subplot', empty: false } });

    expect(service.goToExtremeValue('min')).toBeNull();
  });

  test('reports failure on an empty trace', () => {
    const service = serviceFor({ state: { type: 'trace', empty: true } });

    expect(service.goToExtremeValue('max')).toBeNull();
  });
});

describe('walking values tied at an extreme', () => {
  /** A row whose maximum (90) is held by three bars and minimum (10) by two. */
  function tiedLayer(): MaidrLayer {
    return barLayer([90, 10, 90, 50, 90, 10]);
  }

  test('reports every tied bar rather than only the first', () => {
    // `indexOf` used to stop at the first match, which hid the other two from
    // the dialog as well as from the bracket keys.
    const trace = new BarTrace(tiedLayer());
    const targets = trace.getExtremaTargets();

    expect(targets.filter(target => target.type === 'max').map(target => target.pointIndex))
      .toEqual([0, 2, 4]);
    expect(targets.filter(target => target.type === 'min').map(target => target.pointIndex))
      .toEqual([1, 5]);
  });

  test('steps to the next tied bar on each press and wraps at the end', () => {
    const trace = new BarTrace(tiedLayer());
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q1');

    expect(service.goToExtremeValue('max')).toEqual({ position: 2, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q3');

    expect(service.goToExtremeValue('max')).toEqual({ position: 3, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q5');

    // Wraps rather than stopping at the last one.
    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q1');
  });

  test('walks the minimum ties independently of the maximum ones', () => {
    const trace = new BarTrace(tiedLayer());
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(trace.getCurrentXValue()).toBe('Q2');

    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
    expect(trace.getCurrentXValue()).toBe('Q6');

    // Switching direction starts that walk from its own first tie, not from
    // the position the other direction had reached.
    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q1');
  });

  test('restarts the walk when the reader has moved away by other means', () => {
    // The position is read back from the cursor rather than remembered, so a
    // move between presses is respected instead of resuming a stale index.
    const trace = new BarTrace(tiedLayer());
    const service = serviceFor(trace);

    service.goToExtremeValue('max');
    service.goToExtremeValue('max');
    expect(trace.getCurrentXValue()).toBe('Q3');

    trace.moveToIndex(0, 3);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 3 });
    expect(trace.getCurrentXValue()).toBe('Q1');
  });

  test('re-announces in place when a single point holds the value', () => {
    const trace = new BarTrace(barLayer([30, 90, 50, 10, 70]));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(trace.getCurrentXValue()).toBe('Q2');
  });
});

describe('bracket key commands', () => {
  function commandFixture(landed: { position: number; total: number } | null): {
    context: Context;
    service: GoToExtremaService;
    notification: NotificationService;
    textService: TextService;
  } {
    return {
      context: { state: { type: 'trace', empty: false } } as unknown as Context,
      service: { goToExtremeValue: jest.fn(() => landed) } as unknown as GoToExtremaService,
      notification: { notify: jest.fn() } as unknown as NotificationService,
      textService: {
        isOff: (): boolean => false,
        format: (): string => 'Fri, 19',
      } as unknown as TextService,
    };
  }

  test('[ asks for the minimum and stays silent when it lands', () => {
    const { context, service, notification, textService } = commandFixture({ position: 1, total: 1 });

    new GoToMinValueCommand(context, service, notification, textService).execute();

    expect(service.goToExtremeValue).toHaveBeenCalledWith('min');
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('] asks for the maximum and stays silent when it lands', () => {
    const { context, service, notification, textService } = commandFixture({ position: 1, total: 1 });

    new GoToMaxValueCommand(context, service, notification, textService).execute();

    expect(service.goToExtremeValue).toHaveBeenCalledWith('max');
    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('appends the position when the value is tied across points', () => {
    // The live region holds one message, so the position rides along with the
    // point text — announcing it alone would cost the reader the point.
    const { context, service, notification, textService } = commandFixture({ position: 2, total: 3 });

    new GoToMaxValueCommand(context, service, notification, textService).execute();

    expect(notification.notify).toHaveBeenCalledWith('Fri, 19, 2 of 3');
  });

  test('stays quiet about a position when only one point holds the value', () => {
    // "1 of 1" is noise, and the move already announced itself.
    const { context, service, notification, textService } = commandFixture({ position: 1, total: 1 });

    new GoToMinValueCommand(context, service, notification, textService).execute();

    expect(notification.notify).not.toHaveBeenCalled();
  });

  test('does not speak the position over a reader who turned text off', () => {
    const fixture = commandFixture({ position: 2, total: 3 });
    const textService = { isOff: (): boolean => true, format: (): string => 'Fri, 19' } as unknown as TextService;

    new GoToMaxValueCommand(fixture.context, fixture.service, fixture.notification, textService).execute();

    expect(fixture.notification.notify).not.toHaveBeenCalled();
  });

  test('announces rather than doing nothing when there is nowhere to jump', () => {
    // A silent press reads as a broken shortcut to a screen reader user.
    const min = commandFixture(null);
    new GoToMinValueCommand(min.context, min.service, min.notification, min.textService).execute();

    const max = commandFixture(null);
    new GoToMaxValueCommand(max.context, max.service, max.notification, max.textService).execute();

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
