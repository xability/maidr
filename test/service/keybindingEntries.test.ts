import type { KeybindingEntry } from '@type/event';
import { describe, expect, it } from '@jest/globals';
import { getKeymapForScope, SCOPED_KEYMAP } from '@service/keybinding';
import { Scope } from '@type/event';

/**
 * KeybindingService.register() reads `entry.hotkey` off every keymap value and
 * hands it to hotkeys-js. A value that is a bare string instead of a
 * `KeybindingEntry` therefore registers `hotkeys(undefined, …)`, which hotkeys-js
 * silently ignores — the scope ends up with zero live handlers and locks up the
 * moment it is entered, with no error anywhere.
 *
 * That is exactly what happened to MARK_SET / MARK_PLAY / MARK_JUMP: they were
 * authored as `COMMAND: 'escape'` plain strings while every other keymap used
 * the `key(...)` helper. These tests pin the shape `register()` depends on so a
 * future keymap cannot regress the same way undetected.
 */
describe('keymap entry shape', () => {
  const scopes = Object.keys(SCOPED_KEYMAP) as Scope[];

  it.each(scopes)('%s binds every command to an entry with a string hotkey', (scope) => {
    const malformed = Object.entries(getKeymapForScope(scope))
      .filter(([, entry]) => typeof (entry as KeybindingEntry)?.hotkey !== 'string'
        || (entry as KeybindingEntry).hotkey.length === 0)
      .map(([command]) => command);

    expect(malformed).toEqual([]);
  });

  it.each(scopes)('%s gives every command a description for the help menu', (scope) => {
    const undescribed = Object.entries(getKeymapForScope(scope))
      .filter(([, entry]) => typeof (entry as KeybindingEntry)?.description !== 'string')
      .map(([command]) => command);

    expect(undescribed).toEqual([]);
  });

  // Regression: the three mark scopes shipped as raw-string keymaps after a
  // long-lived branch was merged, so hotkeys-js registered nothing for them and
  // Shift+M / m / j each dropped the user into a scope where not even Escape
  // responded. Assert they are non-empty and well-formed like the rest.
  it.each([Scope.MARK_SET, Scope.MARK_PLAY, Scope.MARK_JUMP])(
    '%s registers well-formed entries (raw-string keymaps registered nothing)',
    (scope) => {
      const entries = Object.values(getKeymapForScope(scope));

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(typeof entry.hotkey).toBe('string');
        expect(entry.hotkey.length).toBeGreaterThan(0);
      }
    },
  );
});
