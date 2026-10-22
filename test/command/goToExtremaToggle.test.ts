import type { CommandContext } from '@command/command';
import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { NotificationService } from '@service/notification';
import type { Keys } from '@type/event';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceState } from '@type/state';
import { CommandFactory } from '@command/factory';
import { GoToExtremaToggleCommand } from '@command/goTo';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import { t } from '@util/i18n';

/**
 * `g` is bound on every trace and listed in the help menu. On a layer with no
 * extrema it used to do nothing at all -- no text, no tone, no dialog -- so a
 * reader could not tell the key had been received.
 */

const TRACE_STATE = {
  empty: false,
  type: 'trace',
  traceType: 'bar',
  layerId: 'layer-1',
  text: { main: { label: 'x', value: 'a' }, cross: { label: 'y', value: 1 } },
} as unknown as TraceState;

const EMPTY_STATE = { empty: true, type: 'trace', traceType: 'bar' } as unknown as TraceState;

function setUp(options: {
  navigable: boolean;
  targets?: ExtremaTarget[];
  state?: TraceState;
}): {
  command: GoToExtremaToggleCommand;
  vm: GoToExtremaViewModel;
  service: { toggle: jest.Mock; returnToTraceScope: jest.Mock };
  notify: jest.Mock;
  tone: jest.Mock;
} {
  const store = createMaidrStore();
  const trace = {
    getExtremaTargets: () => options.targets ?? [],
    getAvailableXValues: () => [],
  };
  const context = {
    active: trace,
    state: options.state ?? TRACE_STATE,
  } as unknown as Context;
  const service = {
    isExtremaNavigable: () => options.navigable,
    toggle: jest.fn(),
    returnToTraceScope: jest.fn(),
  };
  const vm = new GoToExtremaViewModel(store, service as unknown as GoToExtremaService, context);
  const notify = jest.fn();
  const tone = jest.fn();
  const command = new GoToExtremaToggleCommand(
    context,
    vm,
    { notify } as unknown as NotificationService,
    { playWarningToneIfEnabled: tone } as unknown as AudioService,
  );
  return { command, vm, service, notify, tone };
}

const ONE_TARGET = [{
  label: 'Max',
  value: 3,
  pointIndex: 0,
  segment: 'bar',
  type: 'max',
  navigationType: 'point',
}] as ExtremaTarget[];

describe('go to extrema on a layer that has none', () => {
  test('says so, with the warning tone, rather than staying silent', () => {
    const { command, vm, notify, tone } = setUp({ navigable: false });

    command.execute();

    expect(notify).toHaveBeenCalledWith(t('text.noExtrema'));
    expect(tone).toHaveBeenCalledTimes(1);
    expect(vm.state.visible).toBe(false);
  });

  test('says so when the trace claims extrema but has none to list', () => {
    const { command, vm, service, notify, tone } = setUp({ navigable: true, targets: [] });

    command.execute();

    expect(notify).toHaveBeenCalledWith(t('text.noExtrema'));
    expect(tone).toHaveBeenCalledTimes(1);
    expect(service.toggle).not.toHaveBeenCalled();
    expect(vm.state.visible).toBe(false);
  });

  test('says so on an empty state', () => {
    const { command, notify } = setUp({ navigable: true, targets: ONE_TARGET, state: EMPTY_STATE });

    command.execute();

    expect(notify).toHaveBeenCalledWith(t('text.noExtrema'));
  });

  test('the message is plain English in the default locale', () => {
    expect(t('text.noExtrema')).toBe('No extrema to go to in this layer');
  });
});

describe('go to extrema on a layer that has them', () => {
  test('opens the dialog and announces nothing of its own', () => {
    const { command, vm, service, notify, tone } = setUp({ navigable: true, targets: ONE_TARGET });

    command.execute();

    expect(vm.state.visible).toBe(true);
    expect(service.toggle).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    expect(tone).not.toHaveBeenCalled();
  });

  test('closes an open dialog without announcing', () => {
    const { command, vm, service, notify } = setUp({ navigable: true, targets: ONE_TARGET });
    command.execute();

    command.execute();

    expect(vm.state.visible).toBe(false);
    expect(service.returnToTraceScope).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });
});

test('the factory builds the toggle with what it needs to speak', () => {
  const factory = new CommandFactory({} as unknown as CommandContext);

  // `Keys` narrows to `never` (see goToExtremeValue.test.ts), so cast at the
  // same boundary KeybindingService does.
  expect(factory.create('GO_TO_EXTREMA_TOGGLE' as Keys)).toBeInstanceOf(GoToExtremaToggleCommand);
});
