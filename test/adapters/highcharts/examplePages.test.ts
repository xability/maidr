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
 * A script with its comments taken out, so a comment that names a call is not
 * read as the call.
 *
 * @param script - A script's source
 * @returns The source without its comments; a `//` after a colon is a URL's
 *   and stays
 */
function withoutComments(script: string): string {
  return script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** A script setting the attribute MAIDR reads a chart from. */
const SETS_MAIDR_DATA = /setAttribute\(\s*['"]maidr-data['"]/g;

/** A script asking MAIDR to read that attribute now. */
const DISPATCHES_BIND = /dispatchEvent\(\s*new CustomEvent\(\s*['"]maidr:bindchart['"]/;

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

  it('bind a chart they draw after waiting on a promise, which MAIDR does not read by itself', () => {
    // MAIDR reads `maidr-data` attributes once, when the page has loaded. The
    // choropleth page drew its map after fetching the topology and set the
    // attribute then, so MAIDR never bound it: no figure, nothing to focus.
    // Asked of each script that waits, by `await` or `.then(`: after its last
    // `setAttribute('maidr-data', …)` it has to dispatch `maidr:bindchart`.
    // Comments are taken out first, so one that names either call does not
    // stand in for it.
    const unbound = PAGES
      .filter(page => inlineScripts(page.html)
        .map(withoutComments)
        .filter(script => /\bawait\b|\.then\(/.test(script))
        .some((script) => {
          const set = [...script.matchAll(SETS_MAIDR_DATA)].pop()?.index;
          return set !== undefined && !DISPATCHES_BIND.test(script.slice(set));
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
