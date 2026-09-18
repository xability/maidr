/**
 * @jest-environment jsdom
 */
import type { CommandContext } from '@command/command';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Settings } from '@type/settings';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  findBindingConflict,
  getKeymapForScope,
  isRebindable,
  KeybindingService,
  resolveOverrides,
} from '@service/keybinding';
import { Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';

/**
 * A reader's own shortcuts (#189): saved in the settings by command, applied
 * to every scope that binds the command, taken up the moment the settings
 * change, and refused where they would shadow another shortcut.
 */

const KEY_CODE = {
  b: 66,
  t: 84,
  x: 88,
} as const;

interface Harness {
  service: KeybindingService;
  notify: jest.Mock<(message: string) => void>;
  toggleText: jest.Mock<() => void>;
  toggleBraille: jest.Mock<() => void>;
}

function createService(): Harness {
  const notify = jest.fn<(message: string) => void>();
  const toggleText = jest.fn<() => void>();
  const toggleBraille = jest.fn<() => void>();

  const commandContext = {
    notificationService: { notify },
    audioService: { playWarningToneIfEnabled: jest.fn() },
    textViewModel: { toggle: toggleText } as unknown as TextViewModel,
    brailleViewModel: { toggle: toggleBraille } as unknown as BrailleViewModel,
  } as unknown as CommandContext;

  return { service: new KeybindingService(commandContext), notify, toggleText, toggleBraille };
}

/** Dispatches a keydown and lets the deferred unassigned-key check run. */
async function press(keyCode: number, init: KeyboardEventInit = {}): Promise<void> {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, keyCode, ...init }),
  );
  await Promise.resolve();
}

/** Settings carrying only the given overrides. */
function settingsWith(keybindings: Record<string, string>): Settings {
  return { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, keybindings } };
}

describe('keybinding overrides', () => {
  let harness: Harness | null = null;

  afterEach(() => {
    harness?.service.unregister();
    harness = null;
  });

  it('binds the reader\'s shortcut instead of the default', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE, { TOGGLE_TEXT: 'x' });

    await press(KEY_CODE.x);
    await press(KEY_CODE.t);

    expect(harness.toggleText).toHaveBeenCalledTimes(1);
    // The default no longer runs anything, so it warns like any other free key.
    expect(harness.notify).toHaveBeenCalledTimes(1);
  });

  it('takes up a changed shortcut when the settings change, in the scope in force', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE);

    harness.service.update(settingsWith({ TOGGLE_TEXT: 'x' }));
    await press(KEY_CODE.x);
    expect(harness.toggleText).toHaveBeenCalledTimes(1);

    harness.service.update(settingsWith({}));
    await press(KEY_CODE.t);
    expect(harness.toggleText).toHaveBeenCalledTimes(2);
  });

  it('leaves the bindings alone for a settings change that does not touch them', async () => {
    harness = createService();
    harness.service.register(Scope.TRACE, { TOGGLE_TEXT: 'x' });

    harness.service.update({ ...settingsWith({ TOGGLE_TEXT: 'x' }), general: { ...settingsWith({ TOGGLE_TEXT: 'x' }).general, volume: 10 } });
    await press(KEY_CODE.x);

    expect(harness.toggleText).toHaveBeenCalledTimes(1);
  });

  it('keeps the scope in force after rebinding', async () => {
    harness = createService();
    harness.service.register(Scope.SETTINGS);

    harness.service.update(settingsWith({ TOGGLE_TEXT: 'x' }));
    await press(KEY_CODE.x);

    // The settings dialog binds nothing; a rebind must not drop into TRACE.
    expect(harness.toggleText).not.toHaveBeenCalled();
  });
});

describe('resolveOverrides', () => {
  it('keeps only string shortcuts for commands a reader may rebind', () => {
    expect(resolveOverrides({
      TOGGLE_TEXT: 'Shift+X',
      TOGGLE_HELP: 'x',
      NO_SUCH_COMMAND: 'y',
      TOGGLE_BRAILLE: 7,
      MOVE_UP: '',
    })).toEqual({ TOGGLE_TEXT: 'shift+x' });
  });

  it('answers nothing for anything that is not an object', () => {
    expect(resolveOverrides(undefined)).toEqual({});
    expect(resolveOverrides('x')).toEqual({});
    expect(resolveOverrides(null)).toEqual({});
  });
});

describe('getKeymapForScope with overrides', () => {
  it('replaces the shortcut and spells it for the help menu', () => {
    const keymap = getKeymapForScope(Scope.TRACE, { TOGGLE_COMMAND_PALETTE: 'alt+shift+k' });

    expect(keymap.TOGGLE_COMMAND_PALETTE.hotkey).toBe('alt+shift+k');
    expect(keymap.TOGGLE_COMMAND_PALETTE.helpKey).toMatch(/shift \+ k$/);
    expect(keymap.TOGGLE_COMMAND_PALETTE.description).toBe('keybinding.openCommandPalette');
    // Untouched entries are the originals.
    expect(keymap.TOGGLE_TEXT.hotkey).toBe('t');
  });

  it('never moves the help chord', () => {
    expect(isRebindable('TOGGLE_HELP')).toBe(false);
    expect(getKeymapForScope(Scope.TRACE, { TOGGLE_HELP: 'x' }).TOGGLE_HELP.hotkey).not.toBe('x');
  });
});

describe('findBindingConflict', () => {
  it('names the command a shortcut already runs, in any scope the command shares', () => {
    // `b` toggles braille in TRACE, which also binds TOGGLE_TEXT.
    const conflict = findBindingConflict('TOGGLE_TEXT', 'b', {});

    expect(conflict).toMatchObject({ commandName: 'TOGGLE_BRAILLE' });
  });

  it('sees through the reader\'s other overrides', () => {
    expect(findBindingConflict('TOGGLE_TEXT', 'x', { TOGGLE_BRAILLE: 'x' })).toMatchObject({
      commandName: 'TOGGLE_BRAILLE',
    });
    // Once braille has moved away, its old key is free.
    expect(findBindingConflict('TOGGLE_TEXT', 'b', { TOGGLE_BRAILLE: 'x' })).toBeNull();
  });

  it('counts a hidden binding and every alternative of a multi-key one', () => {
    // Escape is bound and unlisted in TRACE; `shift+=` is one of the tactile
    // zoom's three spellings.
    expect(findBindingConflict('TOGGLE_TEXT', 'esc', {})).not.toBeNull();
    expect(findBindingConflict('TOGGLE_TEXT', 'shift+=', {})).toMatchObject({ commandName: 'TACTILE_ZOOM_IN' });
  });

  it('compares spellings, not strings', () => {
    expect(findBindingConflict('TOGGLE_TEXT', 'B', {})).not.toBeNull();
    expect(findBindingConflict('TOGGLE_BRAILLE', 'shift+ctrl+p', {})).toMatchObject({
      commandName: 'TOGGLE_COMMAND_PALETTE',
    });
  });

  it('answers null for a free shortcut', () => {
    expect(findBindingConflict('TOGGLE_TEXT', 'shift+x', {})).toBeNull();
  });
});
