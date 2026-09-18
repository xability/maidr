import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HelpService } from '@service/help';
import { Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';

/**
 * The help menu is where a reader changes a shortcut (#189): the row says
 * whether it can be changed, the change is written to the settings, a taken
 * key is refused with the other command named, and a default can be put
 * back one at a time or all at once.
 */

interface Harness {
  service: HelpService;
  saveSettings: jest.Mock<(settings: Settings) => void>;
  settings: () => Settings;
}

function createService(scope: Scope = Scope.TRACE): Harness {
  let current: Settings = structuredClone(DEFAULT_SETTINGS);
  const saveSettings = jest.fn<(settings: Settings) => void>((settings) => {
    current = settings;
  });
  const settingsService = {
    loadSettings: () => current,
    saveSettings,
  } as unknown as SettingsService;
  const context = { scope } as unknown as Context;
  const display = { toggleFocus: (): void => {} } as unknown as DisplayService;
  return {
    service: new HelpService(context, display, settingsService),
    saveSettings,
    settings: () => current,
  };
}

describe('help menu rows that can be changed', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createService();
  });

  it('carries the command on every row a reader may rebind', () => {
    const items = harness.service.getMenuItems();
    const braille = items.find(item => item.description === 'Toggle Braille Mode');

    expect(braille).toMatchObject({ key: 'b', commandKey: 'TOGGLE_BRAILLE' });
    expect(braille?.isCustom).toBeUndefined();
  });

  it('leaves the help chord and the chorded label rows unchangeable', () => {
    const items = harness.service.getMenuItems();
    const help = items.find(item => item.description === 'Open/Close Help');
    const label = items.find(item => item.key.startsWith('l '));

    expect(help?.commandKey).toBeUndefined();
    expect(label).toBeDefined();
    expect(label?.commandKey).toBeUndefined();
  });
});

describe('changing a shortcut', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createService();
  });

  it('saves the new shortcut and lists it, with the default it replaced', () => {
    const result = harness.service.rebind('TOGGLE_BRAILLE', 'shift+b');

    expect(result).toEqual({ changed: true, message: 'Toggle Braille Mode is now shift + b.' });
    expect(harness.saveSettings).toHaveBeenCalledTimes(1);
    expect(harness.settings().general.keybindings).toEqual({ TOGGLE_BRAILLE: 'shift+b' });

    const braille = harness.service.getMenuItems().find(item => item.commandKey === 'TOGGLE_BRAILLE');
    expect(braille).toMatchObject({ key: 'shift + b', isCustom: true, defaultKey: 'b' });
  });

  it('keeps the rest of the settings as they were', () => {
    harness.service.rebind('TOGGLE_BRAILLE', 'shift+b');

    expect(harness.settings().general.volume).toBe(DEFAULT_SETTINGS.general.volume);
    expect(harness.settings().llm).toEqual(DEFAULT_SETTINGS.llm);
  });

  it('refuses a shortcut another command already runs, and names it', () => {
    const result = harness.service.rebind('TOGGLE_TEXT', 'b');

    expect(result.changed).toBe(false);
    expect(result.message).toBe('b is already used by Toggle Braille Mode.');
    expect(harness.saveSettings).not.toHaveBeenCalled();
  });

  it('refuses the help chord and a command it does not know', () => {
    expect(harness.service.rebind('TOGGLE_HELP', 'x').changed).toBe(false);
    expect(harness.service.rebind('NO_SUCH_COMMAND', 'x').changed).toBe(false);
    expect(harness.service.rebind('TOGGLE_TEXT', '   ').changed).toBe(false);
    expect(harness.saveSettings).not.toHaveBeenCalled();
  });

  it('applies to every scope the command is bound in', () => {
    harness.service.rebind('MOVE_UP', 'shift+up');

    const inBraille = createService(Scope.BRAILLE);
    inBraille.saveSettings.mockImplementation(() => {});
    // Same settings object shape: build a braille-scope service over the
    // settings the trace-scope one saved.
    const braille = new HelpService(
      { scope: Scope.BRAILLE } as unknown as Context,
      { toggleFocus: (): void => {} } as unknown as DisplayService,
      { loadSettings: () => harness.settings(), saveSettings: jest.fn() } as unknown as SettingsService,
    );
    const up = braille.getMenuItems().find(item => item.commandKey === 'MOVE_UP');
    expect(up?.key).toBe('shift + up');
  });
});

describe('restoring defaults', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createService();
    harness.service.rebind('TOGGLE_BRAILLE', 'shift+b');
    harness.service.rebind('TOGGLE_TEXT', 'shift+t');
    harness.saveSettings.mockClear();
  });

  it('puts one default back and says which', () => {
    const result = harness.service.resetBinding('TOGGLE_BRAILLE');

    expect(result).toEqual({ changed: true, message: 'Toggle Braille Mode restored to b.' });
    expect(harness.settings().general.keybindings).toEqual({ TOGGLE_TEXT: 'shift+t' });
    expect(harness.service.getMenuItems().find(item => item.commandKey === 'TOGGLE_BRAILLE')?.isCustom).toBeUndefined();
  });

  it('does nothing for a command already at its default', () => {
    expect(harness.service.resetBinding('MOVE_UP').changed).toBe(false);
    expect(harness.saveSettings).not.toHaveBeenCalled();
  });

  it('puts every default back at once', () => {
    const result = harness.service.resetAllBindings();

    expect(result.changed).toBe(true);
    expect(harness.settings().general.keybindings).toEqual({});
    expect(harness.service.getMenuItems().some(item => item.isCustom)).toBe(false);
  });
});

describe('a help service built without settings', () => {
  it('lists the defaults and refuses to change them', () => {
    const service = new HelpService(
      { scope: Scope.TRACE } as unknown as Context,
      { toggleFocus: (): void => {} } as unknown as DisplayService,
    );

    expect(service.getMenuItems().length).toBeGreaterThan(0);
    expect(service.rebind('TOGGLE_BRAILLE', 'x').changed).toBe(false);
  });
});
