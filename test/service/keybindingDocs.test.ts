import type { ScopeKeymap } from '@service/keybinding';
import type { MessageKey } from '@util/i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { t } from '@util/i18n';

/**
 * `docs/CONTROLS.md` against the keymaps it documents.
 *
 * The page is the reference the rest of the site points readers to, and it had
 * fallen behind the keymaps without anything noticing: it was missing Alt+L,
 * Control+Shift+L, P, G, D, the bracket keys, the lobby's Enter and Escape and
 * label mode from its main table (#1284), and it listed "Select the first
 * element" and "Select the last element" rows for shortcuts no keymap has ever
 * bound in this codebase, which readers pressed and got nothing from (#1283).
 *
 * Every shortcut the in-chart help menu lists is a row the page has to carry,
 * under the name the help menu gives it, so a reader can match the two. A new
 * shortcut fails here until the page names it.
 */

const CONTROLS = readFileSync(resolve(__dirname, '../../docs/CONTROLS.md'), 'utf-8');

/** The English name of every shortcut the help menu lists, in any scope. */
function helpMenuNames(): string[] {
  const names = new Set<string>();
  for (const keymap of Object.values(SCOPED_KEYMAP) as ScopeKeymap[]) {
    for (const entry of Object.values(keymap)) {
      if (entry.showInHelp !== false) {
        names.add(t(entry.description as MessageKey));
      }
    }
  }
  return [...names].sort();
}

describe('docs/CONTROLS.md', () => {
  const names = helpMenuNames();

  it('should be checking the shortcuts these issues were reported against', () => {
    // An enumeration that quietly found nothing would pass every case below.
    expect(names).toContain('Toggle Candlestick Reference Comparison');
    expect(names).toContain('Activate Current Subplot');
    expect(names).toContain('Next Navigation Mode (Rotor)');
    expect(names.length).toBeGreaterThanOrEqual(50);
  });

  it.each(names)('should name the "%s" shortcut', (name) => {
    expect(CONTROLS).toContain(name);
  });

  it('should not document first- and last-element shortcuts that do not exist', () => {
    // Control+Left and Control+Right are those moves (#1283).
    expect(CONTROLS).not.toMatch(/Select the (first|last) element/);
  });
});
