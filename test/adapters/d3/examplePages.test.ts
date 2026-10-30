/**
 * @jest-environment jsdom
 */

import type { Maidr } from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as maidrD3 from '@adapters/d3';
import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';

/**
 * The D3 example pages, run: each page's own script draws its chart with the
 * real d3 and binds it with this adapter, and what it bound is held to what it
 * drew.
 *
 * Nothing else reads these pages. The binders are tested on charts the tests
 * draw, so a page that drew one chart and bound another -- a title the chart
 * does not show, a funnel announced the wrong way round, a bin the chart does
 * not have, a map whose states d3-geo read inside out -- shipped with every
 * test green and a reader told about a chart a sighted colleague could not
 * see.
 */

const ROOT = resolve(__dirname, '../../..');
const EXAMPLES = join(ROOT, 'examples');

/** d3 as the pages load it, a classic script that sets `window.d3`. */
const D3_SOURCE = readFileSync(join(ROOT, 'node_modules/d3/dist/d3.min.js'), 'utf8');

/**
 * Evaluates a script in the page's global scope, as a `<script>` element
 * does: its top-level declarations do not reach this module's scope.
 *
 * @param source - The script
 */
function runScript(source: string): void {
  // eslint-disable-next-line no-eval -- the point is to run the page's own script
  (0, eval)(source);
}

/**
 * Runs an example page: its markup, then each inline script in order.
 *
 * @param page - The file name under `examples/`
 * @returns The spec the page bound to its chart
 */
function runPage(page: string): Maidr {
  const html = readFileSync(join(EXAMPLES, page), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  document.body.innerHTML = body;
  for (const [, script] of body.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    runScript(script);
  }
  const bound = document.querySelector('[maidr-data]');
  if (bound === null) {
    throw new Error(`${page} bound no chart`);
  }
  return JSON.parse(bound.getAttribute('maidr-data') ?? '') as Maidr;
}

/**
 * The texts the page drew into its chart.
 *
 * @returns Each `<text>` element's text, in document order
 */
function drawnTexts(): string[] {
  return [...document.querySelectorAll('svg text')].map(text => text.textContent ?? '');
}

beforeAll(() => {
  runScript(D3_SOURCE);
  (globalThis as { maidrD3?: unknown }).maidrD3 = maidrD3;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the d3 example pages', () => {
  it('bind the stacked bar chart under the title they draw', () => {
    const spec = runPage('d3-bindstacked.html');

    expect(drawnTexts()).toContain('Revenue by Region');
    expect(spec.title).toBe('Revenue by Region');
  });
});
