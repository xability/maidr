import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * What the Observable Plot example pages draw and say, held to what a reader
 * gets from them.
 *
 * The adapter reads a chart in the order Plot drew it, which is right, so a
 * page that draws its weekdays alphabetically is walked and announced
 * alphabetically: nothing in the adapter's tests, which draw their own
 * charts, can see that. Nor can they see a page telling the reader to press
 * keys that do something else.
 */

const ROOT = resolve(__dirname, '../../..');
const PAGES = ['observable-plain.html', 'observable-quarto.html']
  .map(name => ({ name, html: readFileSync(join(ROOT, 'examples', name), 'utf8') }));

/**
 * The argument list of every `Plot.plot(...)` call in a script, up to its
 * matching parenthesis, skipping what is inside strings.
 *
 * @param source - The script
 * @returns Each call's options, as written
 */
function plotCalls(source: string): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(/Plot\.plot\(/g)) {
    let depth = 1;
    let quote = '';
    let index = match.index + match[0].length;
    for (; index < source.length && depth > 0; index++) {
      const char = source[index];
      if (quote) {
        if (char === '\\') {
          index++;
        } else if (char === quote) {
          quote = '';
        }
      } else if (char === '\'' || char === '"' || char === '`') {
        quote = char;
      } else if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      }
    }
    calls.push(source.slice(match.index + match[0].length, index - 1));
  }
  return calls;
}

describe('the observable example pages', () => {
  it('draw the week\'s visitors in the week\'s order', () => {
    // Plot sorts an ordinal domain by its values, so the bars of a chart that
    // gives none were drawn Fri, Mon, Thu, Tue, Wed, and Right walked the
    // week in that order. The rows are listed Monday to Friday.
    const unordered = PAGES.flatMap(page => plotCalls(page.html)
      .filter(call => /x:\s*'day'/.test(call) && !/x:\s*\{[^}]*\bdomain:/.test(call))
      .map(() => page.name));

    expect(PAGES.map(page => plotCalls(page.html).some(call => /x:\s*'day'/.test(call)))).toEqual([true, true]);
    expect(unordered).toEqual([]);
  });

  it('name the keys that move between a faceted chart\'s panels', () => {
    // A faceted chart opens on its panels, where the arrows choose one, Enter
    // goes in and Escape comes out (docs/CONTROLS.md); inside a panel Page Up
    // and Page Down move between layers, so they answered "No additional
    // layer".
    const quarto = PAGES.find(page => page.name === 'observable-quarto.html')?.html ?? '';
    const guide = readFileSync(join(ROOT, 'docs', 'observable.md'), 'utf8');

    const pageUpForPanels = [quarto, guide]
      .filter(text => /Page\s+Up(?:<\/kbd>)?\s*(?:and|\/)\s*(?:<kbd>)?Page\s+Down[^.|\n]*panel|panels[^|\n]*\|\s*Page Up/i.test(text));

    expect(pageUpForPanels).toEqual([]);
    expect(quarto).toMatch(/faceted chart[\s\S]{0,200}<kbd>Enter<\/kbd>[\s\S]{0,80}<kbd>Escape<\/kbd>/);
    expect(guide).toMatch(/\| Choose a panel \(facets\)[^\n]*Enter and Escape/);
  });
});
