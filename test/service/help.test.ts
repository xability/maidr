import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { HelpService } from '@service/help';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';
import { HELP_SECTIONS } from '@type/help';
import { setLocale, tIn } from '@util/i18n';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

/**
 * Scopes the user can open the help menu from, paired with the label scope
 * they can reach with `l` (if any). Kept as literal data rather than imported
 * from the service so the test cross-checks the generator instead of restating
 * it.
 */
const HELP_SCOPES: { scope: Scope; nested?: Scope }[] = [
  { scope: Scope.TRACE, nested: Scope.TRACE_LABEL },
  { scope: Scope.BRAILLE, nested: Scope.TRACE_LABEL },
  { scope: Scope.SUBPLOT, nested: Scope.FIGURE_LABEL },
  { scope: Scope.CANDLESTICK_DELTA },
];

function serviceFor(scope: Scope): HelpService {
  const context = { scope } as unknown as Context;
  const display = { toggleFocus: (): void => {} } as unknown as DisplayService;
  return new HelpService(context, display);
}

function menuFor(scope: Scope): HelpMenuItem[] {
  return serviceFor(scope).getMenuItems();
}

/**
 * The keyboard keys a menu lists, leaving out the keys on a tactile display.
 * @param items - The menu
 */
function keyboardKeys(items: HelpMenuItem[]): string[] {
  return items.filter(item => item.device === undefined).map(item => item.key);
}

/**
 * Every key a scope actually reaches: its own bindings, plus the label-scope
 * bindings behind the `l` chord.
 */
function reachableKeys(scope: Scope, nested?: Scope): Set<string> {
  const keys = new Set<string>();
  for (const entry of Object.values(getKeymapForScope(scope))) {
    keys.add(entry.helpKey ?? entry.hotkey);
  }
  if (nested) {
    for (const entry of Object.values(getKeymapForScope(nested))) {
      keys.add(`l ${entry.helpKey ?? entry.hotkey}`);
    }
  }
  return keys;
}

describe('help menu generation', () => {
  it.each(HELP_SCOPES)('$scope advertises no shortcut it cannot run', ({ scope, nested }) => {
    const reachable = reachableKeys(scope, nested);
    // The keys on a tactile display are the display's, not the keyboard's;
    // see "the tactile display group" below.
    const unreachable = menuFor(scope)
      .filter(item => item.device === undefined)
      .filter(item => !reachable.has(item.key))
      .map(item => `${item.key} (${item.description})`);

    expect(unreachable).toEqual([]);
  });

  it.each(HELP_SCOPES)('$scope lists every one of its visible bindings', ({ scope }) => {
    const listed = new Set(menuFor(scope).map(item => item.key));
    const missing = Object.values(getKeymapForScope(scope))
      .filter(entry => entry.showInHelp !== false)
      .map(entry => entry.helpKey ?? entry.hotkey)
      .filter(key => !listed.has(key));

    expect(missing).toEqual([]);
  });

  it.each(HELP_SCOPES)('$scope hides bindings marked showInHelp: false', ({ scope }) => {
    const listed = new Set(menuFor(scope).map(item => item.key));
    const visibleKeys = new Set(
      Object.values(getKeymapForScope(scope))
        .filter(entry => entry.showInHelp !== false)
        .map(entry => entry.helpKey ?? entry.hotkey),
    );

    // A hidden entry may share its key with a visible one (`esc` doubles as
    // both an exit and a navigation key in some scopes); only flag the keys
    // that no visible binding claims.
    const leaked = Object.values(getKeymapForScope(scope))
      .filter(entry => entry.showInHelp === false)
      .map(entry => entry.helpKey ?? entry.hotkey)
      .filter(key => !visibleKeys.has(key) && listed.has(key));

    expect(leaked).toEqual([]);
  });

  it.each(HELP_SCOPES)('$scope lists each key once', ({ scope }) => {
    // generateNestedScopeHelp drops a nested command by matching the keymap's
    // property name against the parent's, so a shared command renamed in one
    // keymap and not the other would start emitting a second row for the same
    // key instead of failing anywhere.
    const seen = new Set<string>();
    const duplicated = menuFor(scope)
      .map(item => item.key)
      .filter(key => !seen.add(key));

    expect(duplicated).toEqual([]);
  });

  it('gives braille mode a menu of its own, not the trace menu', () => {
    const braille = menuFor(Scope.BRAILLE).map(item => item.key);
    const trace = menuFor(Scope.TRACE).map(item => item.key);

    // Bound in TRACE only — braille must not offer them.
    expect(trace.some(key => key.endsWith('shift + p'))).toBe(true);
    expect(trace.some(key => key.endsWith('+ L'))).toBe(true);

    expect(braille.some(key => key.endsWith('shift + p'))).toBe(false);
    expect(braille.some(key => key.endsWith('+ L'))).toBe(false);

    // Shared bindings still show up, including the `l` label chord and the
    // extrema dialog, which braille mode reaches without leaving braille.
    expect(braille).toContain('b');
    expect(braille).toContain('g');
    expect(braille).toContain('l x');
    expect(trace).toContain('g');
  });

  it('shows the label chord under the scope it is reached from', () => {
    expect(menuFor(Scope.TRACE)).toContainEqual({ key: 'l t', description: 'Announce Plot Title', section: 'hear' });
    expect(menuFor(Scope.SUBPLOT)).toContainEqual({ key: 'l c', description: 'Announce Caption', section: 'hear' });
  });

  it('reuses the parent menu while a transient label scope is active', () => {
    expect(menuFor(Scope.TRACE_LABEL)).toEqual(menuFor(Scope.TRACE));
    expect(menuFor(Scope.FIGURE_LABEL)).toEqual(menuFor(Scope.SUBPLOT));
  });

  it('re-reads the shortcut list in the language chosen since it last opened', () => {
    // The one service instance is the point: a menu built once at construction
    // would keep the language it was built in for the life of the controller,
    // so a reader who switches language would still be shown English.
    const help = serviceFor(Scope.TRACE);
    const english = help.getMenuItems();

    expect(english).toContainEqual(expect.objectContaining({ key: 'b', description: 'Toggle Braille Mode' }));

    try {
      setLocale('ko');
      const korean = help.getMenuItems();

      // A keyboard key is the same in every language; a key on a tactile
      // display is named in the reader's.
      expect(keyboardKeys(korean)).toEqual(keyboardKeys(english));
      expect(korean).toContainEqual(expect.objectContaining({
        device: 'monarch',
        key: tIn('ko', 'keybinding.monarchPanKeys'),
      }));
      expect(korean).toContainEqual(expect.objectContaining({
        key: 'b',
        description: tIn('ko', 'keybinding.toggleBrailleMode'),
      }));
    } finally {
      setLocale('en');
    }

    expect(help.getMenuItems()).toEqual(english);
  });

  it.each(HELP_SCOPES)('$scope places every row in a named group', ({ scope }) => {
    // `other` is the fallback for a command the section table has not heard
    // of: a new binding lands there until someone decides where it belongs.
    const unplaced = menuFor(scope)
      .filter(item => item.section === 'other')
      .map(item => `${item.key} (${item.description})`);

    expect(unplaced).toEqual([]);
  });

  it.each(HELP_SCOPES)('$scope lists each group once, in the order of HELP_SECTIONS', ({ scope }) => {
    const order = menuFor(scope)
      .map(item => item.section)
      .filter((section, index, all) => index === 0 || all[index - 1] !== section);

    expect(new Set(order).size).toBe(order.length);
    expect(order).toEqual([...order].sort((a, b) => HELP_SECTIONS.indexOf(a) - HELP_SECTIONS.indexOf(b)));
  });

  it('starts with moving around and hearing the current point', () => {
    const trace = menuFor(Scope.TRACE);

    expect(trace.slice(0, 4).map(item => item.key)).toEqual(['left', 'right', 'up', 'down']);
    expect(trace.find(item => item.section === 'hear')?.key).toBe('space');
    expect(trace.map(item => item.section)).toEqual(expect.arrayContaining(['navigate', 'hear', 'modes', 'autoplay', 'jump', 'tools', 'candlestick', 'tactile']));

    // The lobby's Enter, which is how a reader gets into a subplot at all,
    // comes straight after the arrows rather than at the end of the group.
    expect(menuFor(Scope.SUBPLOT)[4].key).toBe(getKeymapForScope(Scope.SUBPLOT).MOVE_TO_TRACE_CONTEXT.helpKey);
  });

  it('returns an empty menu for scopes that cannot open help', () => {
    expect(menuFor(Scope.SETTINGS)).toEqual([]);
    expect(menuFor(Scope.COMMAND_PALETTE)).toEqual([]);
  });
});

describe('the tactile display group', () => {
  it.each(HELP_SCOPES)('$scope lists it last, after every other group', ({ scope }) => {
    // Only a reader with a DotPad or a Monarch needs it, and it is a long
    // group for everyone else to read past.
    const sections = menuFor(scope).map(item => item.section);
    const first = sections.indexOf('tactile');
    const after = first === -1 ? [] : sections.slice(first);

    expect(HELP_SECTIONS.at(-1)).toBe('tactile');
    expect(after.every(section => section === 'tactile')).toBe(true);
  });

  it('lists the keys on a DotPad and on a Monarch after the keyboard\'s tactile keys', () => {
    const tactile = menuFor(Scope.TRACE).filter(item => item.section === 'tactile');

    expect(tactile.map(item => item.device ?? 'keyboard')).toEqual([
      'keyboard',
      'keyboard',
      'keyboard',
      'dotPad',
      'dotPad',
      'dotPad',
      'monarch',
      'monarch',
      'monarch',
    ]);
    expect(tactile).toContainEqual({
      description: 'DotPad: Scroll Braille Line Back or Forward',
      key: 'Function 1, Function 4',
      section: 'tactile',
      device: 'dotPad',
    });
    expect(tactile).toContainEqual({
      description: 'Monarch: Scroll Braille Line Back or Forward',
      key: 'Right D-pad left or right, or Space + dot 1, Space + dot 4',
      section: 'tactile',
      device: 'monarch',
    });
  });

  it.each(HELP_SCOPES)('$scope lists the displays\' keys exactly where it lists the keyboard\'s tactile keys', ({ scope }) => {
    const menu = menuFor(scope);
    const keyboard = menu.filter(item => item.section === 'tactile' && item.device === undefined);
    const device = menu.filter(item => item.device !== undefined);

    expect(device.length > 0).toBe(keyboard.length > 0);
    expect(device.every(item => item.section === 'tactile')).toBe(true);
  });

  it('offers no key on a display for rebinding', () => {
    const help = serviceFor(Scope.TRACE);

    // Nothing is bound to a key on the display: the device reports it and the
    // tactile service answers.
    expect(menuFor(Scope.TRACE).filter(item => item.device !== undefined && item.commandKey !== undefined)).toEqual([]);
    expect(help.getRebindableItems({}).filter(item => item.device !== undefined)).toEqual([]);
  });
});
