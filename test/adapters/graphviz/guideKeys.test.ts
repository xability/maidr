import fs from 'node:fs';
import path from 'node:path';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';
import { t } from '@util/i18n';

/**
 * The Graphviz guide's Keyboard Controls table.
 *
 * It told the reader to press H for the help menu, a key no keymap binds, so
 * following the guide gave the error tone and "Invalid key" instead of the
 * shortcut list. It also left out the keys these graphs are read with beyond
 * Left and Right: Down and Up into a cluster or a treemap branch and between a
 * network's groups, and the rotor that follows the edges.
 */
const GUIDE = fs.readFileSync(path.join(__dirname, '../../../docs/graphviz.md'), 'utf8');

const SECTION = GUIDE.split('\n## Keyboard Controls\n')[1]?.split('\n## ')[0] ?? '';
const ROWS = SECTION.split('\n').filter(line => line.startsWith('|'));

/** Every cell that names a single letter: a key, whichever column it is in. */
const LETTERS = [...new Set(ROWS.flatMap(row => row.split('|').slice(1, -1))
  .map(cell => cell.trim().replace(/`/g, ''))
  .filter(cell => /^[A-Z]$/.test(cell)))];

const BOUND = new Set(Object.values(getKeymapForScope(Scope.TRACE)).map(entry => entry.hotkey));

describe('the Graphviz guide\'s keyboard table', () => {
  it('should find the table it checks', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(5);
    expect(LETTERS.length).toBeGreaterThan(0);
  });

  it.each(LETTERS)('should name %s only if a chart binds it', (letter) => {
    expect(BOUND).toContain(letter.toLowerCase());
  });

  it('should name the help chord as docs/CONTROLS.md does', () => {
    expect(SECTION).toContain('Control + /');
    expect(SECTION).toContain('Command + /');
  });

  it('should name the keys that open a cluster or branch and change group', () => {
    expect(SECTION).toContain('Down / Up Arrow');
    expect(SECTION).toContain('Up / Down Arrow');
  });

  it('should name the rotor and the units these graphs add to it', () => {
    expect(SECTION).toContain('Alt + Shift');
    expect(SECTION).toContain('Option + Shift');
    for (const unit of ['model.rotorUnitOutputs', 'model.rotorUnitInputs', 'model.rotorUnitLinks', 'model.rotorUnitLevel'] as const) {
      expect(SECTION).toContain(t(unit));
    }
  });
});
