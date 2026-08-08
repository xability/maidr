import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { HelpService } from '@service/help';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';

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

function menuFor(scope: Scope): HelpMenuItem[] {
  const context = { scope } as unknown as Context;
  const display = { toggleFocus: (): void => {} } as unknown as DisplayService;
  return new HelpService(context, display).getMenuItems();
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
    const unreachable = menuFor(scope)
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

  it('gives braille mode a menu of its own, not the trace menu', () => {
    const braille = menuFor(Scope.BRAILLE).map(item => item.key);
    const trace = menuFor(Scope.TRACE).map(item => item.key);

    // Bound in TRACE only — braille must not offer them.
    expect(trace).toContain('g');
    expect(trace.some(key => key.endsWith('shift + p'))).toBe(true);
    expect(trace.some(key => key.endsWith('+ L'))).toBe(true);

    expect(braille).not.toContain('g');
    expect(braille.some(key => key.endsWith('shift + p'))).toBe(false);
    expect(braille.some(key => key.endsWith('+ L'))).toBe(false);

    // Shared bindings still show up, including the `l` label chord.
    expect(braille).toContain('b');
    expect(braille).toContain('l x');
  });

  it('shows the label chord under the scope it is reached from', () => {
    expect(menuFor(Scope.TRACE)).toContainEqual({ key: 'l t', description: 'Announce Plot Title' });
    expect(menuFor(Scope.SUBPLOT)).toContainEqual({ key: 'l c', description: 'Announce Caption' });
  });

  it('reuses the parent menu while a transient label scope is active', () => {
    expect(menuFor(Scope.TRACE_LABEL)).toEqual(menuFor(Scope.TRACE));
    expect(menuFor(Scope.FIGURE_LABEL)).toEqual(menuFor(Scope.SUBPLOT));
  });

  it('returns an empty menu for scopes that cannot open help', () => {
    expect(menuFor(Scope.SETTINGS)).toEqual([]);
    expect(menuFor(Scope.COMMAND_PALETTE)).toEqual([]);
  });
});
