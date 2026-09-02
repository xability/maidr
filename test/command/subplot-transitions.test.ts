import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TactileService } from '@service/tactile';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { PlotState } from '@type/state';
import {
  MoveToSubplotContextCommand,
  MoveToTraceContextCommand,
} from '@command/move';
import { SubplotCue } from '@command/subplotCue';
import { ToggleBrailleCommand } from '@command/toggle';
import { describe, expect, jest, test } from '@jest/globals';
import { TextService } from '@service/text';
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
 * A real TextService (defaults to verbose) so SubplotCue exercises the actual
 * mode-aware transition wording. Its own NotificationService is a throwaway
 * stub, separate from the one the assertions target; the mode is set by
 * toggling from the VERBOSE default (VERBOSE -> TERSE -> OFF).
 */
function createTextService(mode: 'verbose' | 'terse' | 'off' = 'verbose'): TextService {
  const service = new TextService({ notify: jest.fn() } as unknown as NotificationService);
  if (mode === 'terse') {
    service.toggle(); // VERBOSE -> TERSE
  } else if (mode === 'off') {
    service.toggle(); // VERBOSE -> TERSE
    service.toggle(); // TERSE -> OFF
  }
  return service;
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
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = traceState;
      return true;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createTextService()),
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
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: true,
      } as unknown as PlotState;
      return true;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createTextService()),
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
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
      return true;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(true), // braille enabled -> focus moves to braille
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createTextService()),
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
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
      return true;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createTextService('terse')),
    );

    command.execute();

    // Terse drops the "of N" framing; with no authored subplot title the panel
    // is named on its own.
    expect(notificationService.notify).toHaveBeenCalledWith('Subplot 2');
  });

  test('announces the subplot title in terse mode when the subplot has one', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
        title: 'Sales in North',
      } as unknown as PlotState;
      return true;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createTextService('terse')),
    );

    command.execute();

    // Terse names the panel by its authored title alone (no "Subplot N").
    expect(notificationService.notify).toHaveBeenCalledWith('Sales in North');
  });

  test('announces the full title in verbose mode when the subplot has one', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
        title: 'Sales in North',
      } as unknown as PlotState;
      return true;
    });

    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(createMockAudioService(), notificationService, createTextService('verbose')),
    );

    command.execute();

    // Verbose keeps the full framing and now includes the title.
    expect(notificationService.notify).toHaveBeenCalledWith('Entered subplot 2 of 4, Sales in North, bar plot.');
  });

  test('plays the tone but announces nothing in OFF text mode', () => {
    const figureState = { type: 'figure', empty: false, index: 2, size: 4 } as unknown as PlotState;
    const context = { state: figureState, isAuthoredTitle } as unknown as Context;
    (context as { enterSubplot: () => boolean }).enterSubplot = jest.fn(() => {
      (context as { state: PlotState }).state = {
        type: 'trace',
        empty: false,
        plotType: 'bar',
      } as unknown as PlotState;
      return true;
    });

    const audioService = createMockAudioService();
    const notificationService = createMockNotificationService();
    const command = new MoveToTraceContextCommand(
      context,
      createMockBrailleService(false),
      createMockDisplayService(),
      createSubplotCue(audioService, notificationService, createTextService('off')),
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
      createSubplotCue(audioService, notificationService, createTextService()),
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
      createSubplotCue(audioService, notificationService, createTextService()),
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
      createSubplotCue(createMockAudioService(), notificationService, createTextService('terse')),
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
      createSubplotCue(createMockAudioService(), notificationService, createTextService('terse')),
    );

    command.execute();

    // Terse names the panel by its title alone after the "Figure," marker.
    expect(notificationService.notify).toHaveBeenCalledWith('Figure, Sales in North');
  });

  test('announces the full title in the verbose exit message when the subplot has one', () => {
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
      createSubplotCue(createMockAudioService(), notificationService, createTextService('verbose')),
    );

    command.execute();

    expect(notificationService.notify).toHaveBeenCalledWith(
      'Returned to figure overview, subplot 2 of 4, Sales in North.',
    );
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
      createSubplotCue(audioService, notificationService, createTextService('off')),
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
      createSubplotCue(audioService, notificationService, createTextService()),
    );

    command.execute();

    expect(audioService.playSubplotExitTone).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
  });
});

describe('ToggleBrailleCommand at the figure lobby', () => {
  /**
   * A tactile display, in the two states that decide who takes the key.
   * @param connected - Whether a display is connected
   */
  function createTactile(connected: boolean, showing: boolean = false): {
    canShow: boolean;
    isActive: boolean;
    toggle: jest.Mock;
  } {
    return { canShow: connected, isActive: showing, toggle: jest.fn() };
  }

  /**
   * Braille, in the only state this command reads: whether it is already on.
   * @param enabled - Whether the braille panel is open
   */
  function createBraille(enabled: boolean): BrailleService {
    return { isEnabled: enabled } as unknown as BrailleService;
  }

  const lobby = { type: 'figure', empty: false } as unknown as PlotState;
  const trace = {
    type: 'trace',
    empty: false,
    braille: { empty: false },
  } as unknown as PlotState;

  test('warns and plays a warning tone when no trace is active and no display is connected', () => {
    const context = { state: lobby } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const notificationService = createMockNotificationService();
    const audioService = createMockAudioService();
    const tactile = createTactile(false);

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      notificationService,
      audioService,
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
    expect(tactile.toggle).not.toHaveBeenCalled();
    expect(notificationService.notify).toHaveBeenCalledWith(
      'Braille is not available here. Press Enter to select a subplot first.',
    );
    expect(audioService.playWarningTone).toHaveBeenCalled();
  });

  test('shows the chart on a connected display instead of refusing at the lobby', () => {
    // The lobby has no series selected, so braille has nothing to encode. A
    // tactile display needs no encoding — it draws the panel's own geometry —
    // and refusing on braille's behalf is what made the pins unreachable in
    // exactly the place they are most useful: feeling the shape of each panel
    // before choosing which to enter.
    const context = { state: lobby } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const notificationService = createMockNotificationService();
    const audioService = createMockAudioService();
    const tactile = createTactile(true);

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      notificationService,
      audioService,
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(tactile.toggle).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).not.toHaveBeenCalled();
    expect(audioService.playWarningTone).not.toHaveBeenCalled();
  });

  test('shows a plot type braille cannot encode, rather than nothing at all', () => {
    // Scatter, manhattan and volcano have no braille table. A pin grid draws a
    // cloud of points better than it draws anything else, so this is the case
    // where gating the display on braille cost the most.
    const noBraille = {
      type: 'trace',
      empty: false,
      braille: { empty: true, traceType: 'point' },
    } as unknown as PlotState;
    const context = { state: noBraille } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(true);

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(tactile.toggle).toHaveBeenCalledTimes(1);
    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
  });

  test('lets braille explain itself when no display is connected to offer instead', () => {
    // Braille's own refusal names the plot type, which is more use to the
    // reader than a second-hand version of it from here.
    const noBraille = {
      type: 'trace',
      empty: false,
      braille: { empty: true, traceType: 'point' },
    } as unknown as PlotState;
    const context = { state: noBraille } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(false);

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(brailleViewModel.toggle).toHaveBeenCalledWith(noBraille);
    expect(tactile.toggle).not.toHaveBeenCalled();
  });

  test('turns the pins off after a layer change, rather than opening braille', () => {
    // A subplot whose layers differ in braille capability — a scatter layer
    // beside a bar one — is exactly what Page Up is built to move between.
    // The reader turns the pins on from the scatter layer, where braille has
    // no table, moves to the bar layer, and presses the key again to turn them
    // off. Deciding by the layer they are standing on *now* sent that press to
    // braille instead, which opened the panel and shifted focus — the opposite
    // of what they asked for, and a third press needed to undo it.
    const barLayer = { state: trace } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(true, true);

    const command = new ToggleBrailleCommand(
      barLayer,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(tactile.toggle).toHaveBeenCalledTimes(1);
    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
  });

  test('closes the braille panel after a layer change onto a layer it cannot encode', () => {
    // The mirror of the case above. The reader opened braille on a bar layer,
    // paged to a scatter layer in the same subplot, and pressed the key to
    // close it. Braille's own toggle refuses on a layer it cannot encode —
    // right for a press that means "open this", wrong for one that means
    // "close it" — so every press answered "not supported" while the panel
    // stayed open and the pins stayed up.
    const noBraille = {
      type: 'trace',
      empty: false,
      braille: { empty: true, traceType: 'point' },
    } as unknown as PlotState;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(true, true);

    const command = new ToggleBrailleCommand(
      { state: noBraille } as unknown as Context,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(true),
    );

    command.execute();

    expect(brailleViewModel.close).toHaveBeenCalledWith(noBraille);
    // Not the tactile service's toggle: braille carries the pins with it, and
    // lowering them separately would leave the two saying different things.
    expect(tactile.toggle).not.toHaveBeenCalled();
    expect(brailleViewModel.toggle).not.toHaveBeenCalled();
  });

  test('closes braille normally when the layer can still encode it', () => {
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(true, true);

    const command = new ToggleBrailleCommand(
      { state: trace } as unknown as Context,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(true),
    );

    command.execute();

    expect(brailleViewModel.toggle).toHaveBeenCalledWith(trace);
    expect(brailleViewModel.close).not.toHaveBeenCalled();
  });

  test('leaves a trace with no data to braille, which can say why', () => {
    // "No info for braille" says more than pins that cannot change.
    const nothing = { type: 'trace', empty: true } as unknown as PlotState;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const tactile = createTactile(true);

    const command = new ToggleBrailleCommand(
      { state: nothing } as unknown as Context,
      brailleViewModel,
      createMockNotificationService(),
      createMockAudioService(),
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(tactile.toggle).not.toHaveBeenCalled();
    expect(brailleViewModel.toggle).toHaveBeenCalledWith(nothing);
  });

  test('toggles braille normally when a trace is active', () => {
    const context = { state: trace } as unknown as Context;
    const brailleViewModel = { toggle: jest.fn(), close: jest.fn() } as unknown as BrailleViewModel;
    const notificationService = createMockNotificationService();
    const audioService = createMockAudioService();
    const tactile = createTactile(true);

    const command = new ToggleBrailleCommand(
      context,
      brailleViewModel,
      notificationService,
      audioService,
      tactile as unknown as TactileService,
      createBraille(false),
    );

    command.execute();

    expect(brailleViewModel.toggle).toHaveBeenCalledWith(trace);
    // Braille carries the display with it through its own toggle event, so
    // taking the key here as well would turn the pins straight back off.
    expect(tactile.toggle).not.toHaveBeenCalled();
    expect(notificationService.notify).not.toHaveBeenCalled();
    expect(audioService.playWarningTone).not.toHaveBeenCalled();
  });
});
