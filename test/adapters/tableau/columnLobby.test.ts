/**
 * @jest-environment jsdom
 */

/**
 * A Tableau dashboard read as one worksheet per row opens on its first
 * worksheet.
 *
 * Tableau's marks are out of reach, so nothing is measured, and the core takes
 * a figure's row 0 for its bottom row: Up moves to the next row. It numbers the
 * rows from the last one, the top, and the lobby opens there. The column runs
 * bottom first to match, so the first worksheet is "Subplot 1", the lobby
 * opens on it, and Down moves to the next one, as it would down the page.
 */

import type { WorksheetSnapshot } from '@adapters/tableau/types';
import { extractTableau } from '@adapters/tableau/extractor';
import { describe, expect, it } from '@jest/globals';
import { Figure } from '@model/plot';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { fakeColumn, fakeSnapshot } from './helpers';

/**
 * A worksheet of one bar, with no dashboard geometry.
 * @param name - The worksheet's name
 * @returns Its snapshot
 */
function worksheet(name: string): WorksheetSnapshot {
  return fakeSnapshot({
    name,
    columns: [fakeColumn('Category', 'string', 0), fakeColumn('SUM(Sales)', 'float', 1)],
    rows: [['Chairs', 1]],
  });
}

describe('a Tableau column in the lobby', () => {
  it('opens on the first worksheet as Subplot 1, and moves down to the next', () => {
    const { maidr } = extractTableau([worksheet('Sales'), worksheet('Profit'), worksheet('Returns')]);
    const figure = new Figure(maidr);
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    // The first arrow lands on the subplot the lobby opens on; the next moves.
    figure.moveOnce('FORWARD');
    const opensOn = figure.activeSubplot.primaryTitle;
    const opensAs = figure.state;

    const movedDown = figure.moveOnce('DOWNWARD');

    expect(opensOn).toBe('Sales');
    expect(opensAs).toMatchObject({ empty: false, index: 1, size: 3 });
    expect(movedDown).toBe(true);
    expect(figure.activeSubplot.primaryTitle).toBe('Profit');
    expect(figure.state).toMatchObject({ empty: false, index: 2 });
  });
});
