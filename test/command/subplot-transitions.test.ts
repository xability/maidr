import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { PlotState } from '@type/state';
import {
  MoveToSubplotContextCommand,
  MoveToTraceContextCommand,
} from '@command/move';
import { SubplotCue } from '@command/subplotCue';
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

/**
 * Mock TextService. Defaults to verbose; pass a mode to exercise terse/off.
 */
function createMockTextService(mode: 'verbose' | 'terse' | 'off' = 'verbose'): TextService {
  return {
    isOff: () => mode === 'off',
    isTerse: () => mode === 'terse',
    isVerbose: () => mode === 'verbose',
  } as unknown as TextService;
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

/**
 * Wraps the audio/notification/text mock trio in a real (thin) SubplotCue so
 * the command's cue calls pass straight through to the same mock instances the
 * tests assert on.
 */
function createSubplotCue(
  audio: AudioService,
  notification: NotificationService,
  text: TextService,
): SubplotCue {
  return new SubplotCue(audio, notification, text);
}

/**
 * Null-safe stand-in for Context.isAuthoredTitle: rejects the model's
 * placeholder defaults and blank/undefined titles, so a trace mock without a
 * `title` yields no authored title (matching a subplot that has none).
 */
function isAuthoredTitle(title?: string): boolean {
  return !!title && title.trim() !== '' && title !== 'unavailable' && title !== 'MAIDR Plot';
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
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = traceState;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createMockTextService()),
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
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
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
      createSubplotCue(createMockAudioService(), notificationService, createMockTextService()),
    );

    command.execute();

    expect(notificationService.notify).toHaveBeenCalledWith('Entered subplot 1 of 3.');
  });

  test('plays the enter tone but skips the spoken alert when braille is enabled', () => {
    const figureState = {
      type: 'figure',
      empty: false,
      index: 2,
      size: 4,
    } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(true), // braille enabled -> focus moves to braille
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createMockTextService()),
    );

    command.execute();

    // Tone still plays, but the alert is suppressed to avoid clashing with the
    // braille focus change.
    expect(audioService.playSubplotEnterTone).toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  test('announces a terse entry message (no title) in terse mode', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createMockTextService('terse')),
    );

    command.execute();

    // Terse drops the "of N" framing; with no authored subplot title the panel
    // is named on its own.
    expect(notificationService.notify).toHaveBeenCalledWith('Subplot 2');
  });

  test('announces the subplot title in terse mode when the subplot has one', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
        title: 'Sales in North',
      } as unknown as PlotState;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createMockTextService('terse')),
    );

    command.execute();

    // Terse names the panel and its authored title, without "of N".
    expect(notificationService.notify).toHaveBeenCalledWith('Subplot 2, Sales in North');
  });

  test('plays the tone but announces nothing in OFF text mode', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => void }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createMockTextService('off')),
    );

    command.execute();

    expect(audioService.playSubplotEnterTone).toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
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
      createSubplotCue(audioService, notificationService, createMockTextService()),
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
      createSubplotCue(audioService, notificationService, createMockTextService()),
    );

    command.execute();

    expect(audioService.playSubplotExitTone).toHaveBeenCalled();
    expect(notificationService.notify).toHaveBeenCalledWith(
      'Returned to figure overview, subplot 2 of 4.',
    );
  });

  test('announces a terse exit message (no title) in terse mode', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { scope: Scope.TRACE, state: figureState } as unknown as Context;
    (context as { exitSubplot: () => void }).exitSubplot = jest.fn(() => {
      (context as { scope: Scope }).scope = Scope.SUBPLOT;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToSubplotContextCommand(
      context,
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createMockTextService('terse')),
    );

    command.execute();

    // Terse drops the "of N" framing; with no authored subplot title only the
    // panel position is named.
    expect(notificationService.notify).toHaveBeenCalledWith('Figure, subplot 2');
  });

  test('announces the subplot title in the terse exit message when the subplot has one', () => {
    // After exiting, context.state is the figure lobby state whose focused
    // subplot carries the title.
    const figureState = {
      type: 'figure',
      empty: false,
      index: 2,
      size: 4,
      subplot: {
        empty: false,
        type: 'subplot',
        trace: { empty: false, type: 'trace', title: 'Sales in North' },
      },
    } as unknown as PlotState;
    const context = {
      scope: Scope.TRACE,
      state: figureState,
      isAuthoredTitle,
    } as unknown as Context;
    (context as { exitSubplot: () => void }).exitSubplot = jest.fn(() => {
      (context as { scope: Scope }).scope = Scope.SUBPLOT;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToSubplotContextCommand(
      context,
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createMockTextService('terse')),
    );

    command.execute();

    expect(notificationService.notify).toHaveBeenCalledWith('Figure, subplot 2, Sales in North');
  });

  test('plays the exit tone but announces nothing in OFF text mode', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { scope: Scope.TRACE, state: figureState } as unknown as Context;
    (context as { exitSubplot: () => void }).exitSubplot = jest.fn(() => {
      (context as { scope: Scope }).scope = Scope.SUBPLOT;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToSubplotContextCommand(
      context,
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createMockTextService('off')),
    );

    command.execute();

    expect(audioService.playSubplotExitTone).toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
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
      createSubplotCue(audioService, notificationService, createMockTextService()),
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
