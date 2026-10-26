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

describe('the highcharts example pages', () => {
  it('are found', () => {
    expect(PAGES.length).toBeGreaterThan(30);
  });

  it('bind a chart they draw after an await, which MAIDR does not read by itself', () => {
    // MAIDR reads `maidr-data` attributes once, when the page has loaded. The
    // choropleth page drew its map after fetching the topology and set the
    // attribute then, so MAIDR never bound it: no figure, nothing to focus.
    const unbound = PAGES
      .filter(page => /\bawait\b/.test(page.html) && page.html.includes('maidr-data'))
      .filter(page => !page.html.includes('maidr:bindchart'))
      .map(page => page.name);

    expect(unbound).toEqual([]);
  });
});
