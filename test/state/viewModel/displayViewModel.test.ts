/**
 * Tests for DisplayViewModel's dialog audio cues — the shared open/close tick
 * every dialog gets by virtue of the focus scope it moves the app into.
 *
 * The cue is keyed off the focus transition rather than off each dialog, so
 * these cases stand in for every dismissal path a dialog has (Escape, the
 * close button, the backdrop, re-pressing the shortcut, choosing an entry):
 * all of them end in the same scope change.
 */
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { Focus } from '@type/event';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { DisplayViewModel } from '@state/viewModel/displayViewModel';
import { Emitter, Scope } from '@type/event';

function createAudioStub(): AudioService {
  return {
    playMenuOpenTone: jest.fn(),
    playMenuCloseTone: jest.fn(),
  } as unknown as AudioService;
}

/**
 * A DisplayService stub whose focus events the test drives directly, so a
 * transition can be asserted without standing up the model and the commands
 * that would produce it at runtime.
 */
function createDisplayStub(): { service: DisplayService; focus: (value: Focus) => void } {
  const emitter = new Emitter<{ value: Focus }>();
  const service = {
    onChange: emitter.event,
    getInstruction: jest.fn(() => 'instruction'),
  } as unknown as DisplayService;

  return { service, focus: value => emitter.fire({ value }) };
}

function setup(): {
  audio: AudioService;
  focus: (value: Focus) => void;
  viewModel: DisplayViewModel;
} {
  const { service, focus } = createDisplayStub();
  const audio = createAudioStub();
  const viewModel = new DisplayViewModel(createMaidrStore(), service, audio);

  return { audio, focus, viewModel };
}

/** Every scope that renders as a dialog and so earns the shared cue. */
const DIALOG_SCOPES: Focus[] = [
  Scope.CANDLESTICK_DELTA_SETTINGS,
  Scope.CHAT,
  Scope.COMMAND_PALETTE,
  Scope.DESCRIPTION,
  Scope.GO_TO_EXTREMA,
  Scope.HELP,
  Scope.SETTINGS,
];

describe('DisplayViewModel dialog audio cues', () => {
  test.each(DIALOG_SCOPES)('plays the open cue when %s becomes focused', (scope) => {
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(scope);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test.each(DIALOG_SCOPES)('plays the close cue when the focus leaves %s', (scope) => {
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(scope);
    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuCloseTone).toHaveBeenCalledTimes(1);
  });

  test('is silent for the plot navigation scopes', () => {
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(Scope.SUBPLOT);
    focus(Scope.CANDLESTICK_DELTA);
    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).not.toHaveBeenCalled();
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test('is silent for the inline braille and review panels', () => {
    // They are a text field beside the chart, not an overlay, so the dialog
    // cue would misdescribe them.
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(Scope.BRAILLE);
    focus(Scope.TRACE);
    focus(Scope.REVIEW);
    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).not.toHaveBeenCalled();
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test('does not play the close cue for the first focus event of a session', () => {
    // A controller is built on every focus-in, so the first event it sees is
    // the plot taking focus — nothing was open to close.
    const { audio, focus } = setup();

    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).not.toHaveBeenCalled();
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test('plays each cue once when a scope is re-reported', () => {
    // updateFocus can fire the same scope twice (a deferred emit racing a
    // synchronous one); the cue must not double up.
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(Scope.HELP);
    focus(Scope.HELP);
    focus(Scope.TRACE);
    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuCloseTone).toHaveBeenCalledTimes(1);
  });

  test('plays only the open cue when one dialog replaces another', () => {
    const { audio, focus } = setup();

    focus(Scope.TRACE);
    focus(Scope.HELP);
    focus(Scope.SETTINGS);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(2);
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test('stops playing cues once disposed', () => {
    // Focus-out disposes the controller, so a dialog still open at that point
    // must not sound a close cue.
    const { audio, focus, viewModel } = setup();

    focus(Scope.TRACE);
    focus(Scope.CHAT);
    viewModel.dispose();
    focus(Scope.TRACE);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });
});
