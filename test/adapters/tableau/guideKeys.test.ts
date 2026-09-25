import fs from 'node:fs';
import path from 'node:path';
import { getKeymapForScope } from '@service/keybinding';
import { Scope } from '@type/event';

/**
 * The Tableau guide's two summaries of how a reader moves between a
 * dashboard's worksheets: the Quick Start's keyboard bullet and the Keyboard
 * Controls row. Both used to say Up/Down only, which is true of the column
 * fallback alone; the default grid moves along a row with Left/Right too, as
 * the guide's own Dashboard Layout section said (#1292).
 */
const GUIDE = fs.readFileSync(path.join(__dirname, '../../../docs/tableau.md'), 'utf8');

const QUICK_START_LINE = GUIDE.split('\n').find(line => line.startsWith('- **Keyboard navigation**')) ?? '';
const WORKSHEET_ROW = GUIDE.split('\n').find(line => line.startsWith('| Move between those worksheets')) ?? '';

/** The lobby's moves, by the arrow each is bound to. */
const LOBBY_ARROWS = ['MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT'].map(
  command => getKeymapForScope(Scope.SUBPLOT)[command]?.hotkey ?? '',
);

describe('the Tableau guide on moving between worksheets', () => {
  it('should find both summaries it checks', () => {
    expect(QUICK_START_LINE).not.toBe('');
    expect(WORKSHEET_ROW).not.toBe('');
  });

  it.each(LOBBY_ARROWS)('should name the %s arrow the lobby binds in both summaries', (arrow) => {
    const name = arrow.charAt(0).toUpperCase() + arrow.slice(1);

    expect(name).toMatch(/^(Up|Down|Left|Right)$/);
    expect(QUICK_START_LINE).toContain(name);
    expect(WORKSHEET_ROW).toContain(name);
  });

  it('should say the column layout moves with Up and Down only', () => {
    expect(WORKSHEET_ROW).toMatch(/column layout: Up \/ Down only/);
  });
});
