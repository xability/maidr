import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * What the Highcharts example pages have to do for MAIDR to read the chart
 * they draw, checked across every page so the next one written does it too.
 */

const EXAMPLES = resolve(__dirname, '../../../examples');

/** Every Highcharts example page, by file name, with its source. */
const PAGES = readdirSync(EXAMPLES)
  .filter(name => /^highcharts.*\.html$/.test(name))
  .map(name => ({ name, html: readFileSync(join(EXAMPLES, name), 'utf-8') }));

/**
 * The inline scripts of a page.
 *
 * @param html - The page's source
 * @returns Each `<script>` element's body that is not loaded from a URL
 */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
}

/**
 * How many times a pattern occurs in a text.
 *
 * @param text - The text
 * @param pattern - A global pattern
 * @returns The count
 */
function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

describe('the highcharts example pages', () => {
  it('are found', () => {
    expect(PAGES.length).toBeGreaterThan(30);
  });

  it('bind a chart they draw after an await, which MAIDR does not read by itself', () => {
    // MAIDR reads `maidr-data` attributes once, when the page has loaded. The
    // choropleth page drew its map after fetching the topology and set the
    // attribute then, so MAIDR never bound it: no figure, nothing to focus.
    // Asked of each script that awaits: whatever it does after setting the
    // attribute has to include the dispatch.
    const unbound = PAGES
      .filter(page => inlineScripts(page.html)
        .filter(script => /\bawait\b/.test(script))
        .some((script) => {
          const set = script.lastIndexOf('maidr-data');
          return set >= 0 && !script.slice(set).includes('maidr:bindchart');
        }))
      .map(page => page.name);

    expect(unbound).toEqual([]);
  });

  it('draw a polar chart with its first category at 12 o\'clock, where MAIDR puts it', () => {
    // MAIDR places spoke k at k/n of the way round from 12 o'clock. Without
    // `pointPlacement: 'on'` Highcharts draws every spoke half a category on,
    // so each one's stereo position disagreed with where it is drawn.
    // Counted, so a page drawing two polar charts places both.
    const offset = PAGES
      .filter(page => count(page.html, /polar:\s*true/g) > count(page.html, /pointPlacement:\s*'on'/g))
      .map(page => page.name);

    expect(offset).toEqual([]);
  });
});
