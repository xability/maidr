import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { HelpService } from '@service/help';
import { Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';

/**
 * A reader changes a shortcut in the settings dialog (#189). The help
 * service works out what a change comes to -- the new overrides, or the
 * command that already has the key -- and saves nothing: the dialog keeps
 * the result with its other unsaved edits. The help menu itself only lists
 * the keys, with a changed one beside its default.
 */

function createService(settings: Settings = structuredClone(DEFAULT_SETTINGS), scope: Scope = Scope.TRACE): HelpService {
  const settingsService = { loadSettings: () => settings } as unknown as SettingsService;
  const context = { scope } as unknown as Context;
  const display = { toggleFocus: (): void => {} } as unknown as DisplayService;
  return new HelpService(context, display, settingsService);
}

function settingsWith(keybindings: Record<string, string>): Settings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.general.keybindings = keybindings;
  return settings;
}

describe('the help menu', () => {
  it('carries the command on every row a reader may rebind', () => {
    const braille = createService().getMenuItems().find(item => item.description === 'Toggle Braille Mode');

    expect(braille).toMatchObject({ key: 'b', commandKey: 'TOGGLE_BRAILLE' });
    expect(braille?.isCustom).toBeUndefined();
  });

  it('leaves the help chord and the chorded label rows unchangeable', () => {
    const items = createService().getMenuItems();
    const help = items.find(item => item.description === 'Open/Close Help');
    const label = items.find(item => item.key.startsWith('l '));

    expect(help?.commandKey).toBeUndefined();
    expect(label).toBeDefined();
    expect(label?.commandKey).toBeUndefined();
  });

  it('lists a saved shortcut with the default it replaced', () => {
    const service = createService(settingsWith({ TOGGLE_BRAILLE: 'shift+b' }));
    const braille = service.getMenuItems().find(item => item.commandKey === 'TOGGLE_BRAILLE');

    expect(braille).toMatchObject({ key: 'shift + b', isCustom: true, defaultKey: 'b' });
  });

  it('shows a saved shortcut in every scope the command is bound in', () => {
    const settings = settingsWith({ MOVE_UP: 'shift+up' });
    const up = createService(settings, Scope.BRAILLE).getMenuItems().find(item => item.commandKey === 'MOVE_UP');

    expect(up?.key).toBe('shift + up');
  });
});

describe('the shortcuts the settings dialog lists', () => {
  it('lists each rebindable command once, and only those', () => {
    const items = createService().getRebindableItems({});
    const commands = items.map(item => item.commandKey);

    expect(commands.every(command => command !== undefined)).toBe(true);
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands).not.toContain('TOGGLE_HELP');
    expect(items.some(item => item.key.startsWith('l '))).toBe(false);
  });

  it('gathers commands from every scope that can open help', () => {
    const commands = createService().getRebindableItems({}).map(item => item.commandKey);

    // Trace, lobby and comparison-layer commands, whichever scope is active.
    expect(commands).toEqual(expect.arrayContaining([
      'MOVE_LEFT',
      'MOVE_TO_TRACE_CONTEXT',
      'EXIT_CANDLESTICK_DELTA',
      'TOGGLE_COMMAND_PALETTE',
    ]));
  });

  it('shows the keys the unsaved edits give, not the saved ones', () => {
    const service = createService(settingsWith({ TOGGLE_BRAILLE: 'shift+b' }));
    const braille = service.getRebindableItems({ TOGGLE_BRAILLE: 'x' }).find(item => item.commandKey === 'TOGGLE_BRAILLE');

    expect(braille).toMatchObject({ key: 'x', isCustom: true, defaultKey: 'b' });
  });

  it('starts with the arrows, as the help menu does', () => {
    const keys = createService().getRebindableItems({}).slice(0, 4).map(item => item.key);

    expect(keys).toEqual(['left', 'right', 'up', 'down']);
  });
});

describe('changing a shortcut', () => {
  let service: HelpService;

  beforeEach(() => {
    service = createService();
  });

  it('returns the new overrides and what to say, and saves nothing', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    service = createService(settings);

    const result = service.rebind('TOGGLE_BRAILLE', 'shift+b', { TOGGLE_TEXT: 'shift+t' });

    expect(result).toEqual({
      changed: true,
      message: 'Toggle Braille Mode is now shift + b.',
      overrides: { TOGGLE_TEXT: 'shift+t', TOGGLE_BRAILLE: 'shift+b' },
    });
    expect(settings.general.keybindings).toEqual({});
  });

  it('refuses a shortcut another command already runs, and names it', () => {
    const result = service.rebind('TOGGLE_TEXT', 'b', {});

    expect(result).toEqual({ changed: false, message: 'b is already used by Toggle Braille Mode.', overrides: {} });
  });

  it('checks a conflict against the unsaved edits', () => {
    // `x` is free by default, but taken once the edits give it to braille.
    const result = service.rebind('TOGGLE_TEXT', 'x', { TOGGLE_BRAILLE: 'x' });

    expect(result.changed).toBe(false);
    expect(result.message).toBe('x is already used by Toggle Braille Mode.');
  });

  it('refuses the help chord, a command it does not know, and a blank shortcut', () => {
    expect(service.rebind('TOGGLE_HELP', 'x', {}).changed).toBe(false);
    expect(service.rebind('NO_SUCH_COMMAND', 'x', {}).changed).toBe(false);
    expect(service.rebind('TOGGLE_TEXT', '   ', {}).changed).toBe(false);
  });
});

describe('restoring defaults', () => {
  const edits = { TOGGLE_BRAILLE: 'shift+b', TOGGLE_TEXT: 'shift+t' };
  let service: HelpService;

  beforeEach(() => {
    service = createService();
  });

  it('puts one default back and says which', () => {
    expect(service.resetBinding('TOGGLE_BRAILLE', edits)).toEqual({
      changed: true,
      message: 'Toggle Braille Mode restored to b.',
      overrides: { TOGGLE_TEXT: 'shift+t' },
    });
  });

  it('says nothing moved for a command already at its default', () => {
    // Backspace during a recording lands here on any row, so the answer
    // must be that the shortcut is unchanged, not that Backspace is invalid.
    expect(service.resetBinding('MOVE_UP', edits)).toEqual({
      changed: false,
      message: 'Shortcut unchanged.',
      overrides: edits,
    });
  });

  it('puts every default back at once', () => {
    expect(service.resetAllBindings(edits)).toEqual({
      changed: true,
      message: 'All shortcuts restored to their defaults.',
      overrides: {},
    });
    expect(service.resetAllBindings({}).changed).toBe(false);
  });
});

describe('a help service built without settings', () => {
  it('lists the defaults', () => {
    const service = new HelpService(
      { scope: Scope.TRACE } as unknown as Context,
      { toggleFocus: (): void => {} } as unknown as DisplayService,
    );

    expect(service.getMenuItems().length).toBeGreaterThan(0);
    expect(service.getMenuItems().some(item => item.isCustom)).toBe(false);
  });
});
