import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { PlotState } from '@type/state';
import {
  MoveToSubplotContextCommand,
  MoveToTraceContextCommand,
} from '@command/move';
import { ToggleBrailleCommand } from '@command/toggle';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

function createMockAudioService(): AudioService {
  return {
    playSubplotEnterTone: jest.fn(),
    playSubplotExitTone: jest.fn(),
    playWarningTone: jest.fn(),
  } as unknown as AudioService;
}

function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

function createMockDisplayService(): DisplayService {
  return {
    toggleFocus: jest.fn(),
    syncFocusStack: jest.fn(),
  } as unknown as DisplayService;
}

function createMockBrailleService(enabled: boolean): BrailleService {
  return {
    get isEnabled() {
      return enabled;
    },
    refreshDisplay: jest.fn(),
  } as unknown as BrailleService;
}

describe('MoveToTraceContextCommand entry cue', () => {
  test('plays the enter tone and announces the entered subplot from the lobby', () => {
    const figureState = {
      type: 'figure',
      empty: false,
      index: 2,
      size: 4,
    } as unknown as PlotState;
    const traceState = {
      type: 'trace',
      empty: false,
      plotType: 'bar',
    } as unknown as PlotState;
    const context = { state: figureState } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = traceState;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      audioService,
      notificationService,
    );

    command.execute();

    expect(context.enterSubplot).toHaveBeenCalled();
    expect(audioService.playSubplotEnterTone).toHaveBeenCalled();
    expect(notificationService.notify).toHaveBeenCalledWith(
      'Entered subplot 2 of 4, bar plot.',
    );
  });

  test('omits the plot type when the entered trace has none', () => {
    const figureState = {
      type: 'figure',
      empty: false,
      index: 1,
      size: 3,
    } as unknown as PlotState;
    const context = { state: figureState } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: true,
      } as unknown as PlotState;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createMockAudioService(),
      notificationService,
    );

    command.execute();

    expect(notificationService.notify).toHaveBeenCalledWith('Entered subplot 1 of 3.');
  });

  test('does not announce when the active element is not the figure lobby', () => {
    const context = {
      state: { type: 'trace', empty: false } as unknown as PlotState,
      enterSubplot: jest.fn(),
    } as unknown as Context;

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      audioService,
      notificationService,
    );

    command.execute();

    expect(audioService.playSubplotEnterTone).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });
});

describe('MoveToSubplotContextCommand exit cue', () => {
  test('plays the exit tone and announces the figure position on a real exit', () => {
    const figureState = {
      type: 'figure',
      empty: false,
      index: 2,
      size: 4,
    } as unknown as PlotState;
    const context = {
      scope: Scope.TRACE,
      state: figureState,
    } as unknown as Context;
    (context as { exitSubplot: () => void }).exitSubplot = jest.fn(() => {
      (context as { scope: Scope }).scope = Scope.SUBPLOT;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToSubplotContextCommand(
      context,
      createMockDisplayService(),
      audioService,
      notificationService,
    );

    command.execute();

    expect(audioService.playSubplotExitTone).toHaveBeenCalled();
    expect(notificationService.notify).toHaveBeenCalledWith(
      'Returned to figure overview, subplot 2 of 4.',
    );
  });

  test('stays silent when exitSubplot is a no-op (single-subplot chart)', () => {
    const context = {
      scope: Scope.TRACE,
      state: { type: 'trace', empty: false } as unknown as PlotState,
      exitSubplot: jest.fn(), // scope stays TRACE
    } as unknown as Context;

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToSubplotContextCommand(
      context,
      createMockDisplayService(),
      audioService,
      notificationService,
    );

    command.execute();

    expect(audioService.playSubplotExitTone).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });
});

describe('ToggleBrailleCommand at the figure lobby', () => {
  test('warns and plays a warning tone when no trace is active', () => {
    const context = {
      state: { type: 'figure', empty: false } as unknown as PlotState,
    } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn() } as unknown as BrailleViewModel;
    const notificationService = createMockNotificationService();
    const audioService = createMockAudioService();

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      notificationService,
      audioService,
    );

    command.execute();

    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
    expect(notificationService.notify).toHaveBeenCalledWith(
      'Braille is not available here. Press Enter to select a subplot first.',
    );
    expect(audioService.playWarningTone).toHaveBeenCalled();
  });

  test('toggles braille normally when a trace is active', () => {
    const traceState = { type: 'trace', empty: false } as unknown as PlotState;
    const context = { state: traceState } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn() } as unknown as BrailleViewModel;
    const notificationService = createMockNotificationService();
    const audioService = createMockAudioService();

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      notificationService,
      audioService,
    );

    command.execute();

    expect(brailleViewModel.toggle).toHaveBeenCalledWith(traceState);
    expect(notificationService.notify).not.toHaveBeenCalled();
    expect(audioService.playWarningTone).not.toHaveBeenCalled();
  });
});
