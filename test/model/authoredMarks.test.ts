/**
 * @jest-environment jsdom
 */

import type { BoxenPoint, Maidr, MaidrLayer } from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';

/**
 * An authored example's data is what its marks draw.
 *
 * Every number a reader hears comes from the data, and every mark a sighted
 * colleague sees comes from the SVG, and each example page carries both by
 * hand. Where they parted -- an outlier listed that no point draws, candle
 * highs and lows that no wick reaches, labels drawn on the next bar down, a
 * grid the braille display needs left undeclared -- the reader was told about
 * a chart that is not on the page, or not told one that is, and nothing
 * compared the two.
 *
 * Each case reads the page into the DOM and measures the marks its own
 * selectors name.
 */

const EXAMPLES = join(__dirname, '..', '..', 'examples');

/**
 * Undoes the entity escaping a `maidr` attribute carries.
 *
 * @param raw - The attribute's text as it appears in the page
 * @returns The JSON it stands for
 */
function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&#10;/g, '\n')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * The object literal a script opens at an index, up to its matching brace.
 *
 * @param source - The script
 * @param start - The index of its opening brace
 * @returns The literal's source
 */
function objectAt(source: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (char === '\\') {
        index++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error('the object literal never closes');
}

/**
 * Puts an example page in the DOM and reads the spec it carries, in a
 * `var maidr = ...` script or in a `maidr` or `maidr-data` attribute.
 *
 * @param page - The file name under `examples/`
 * @returns Every layer of the spec, subplot by subplot
 */
function loadLayers(page: string): MaidrLayer[] {
  const html = readFileSync(join(EXAMPLES, page), 'utf8');
  document.body.innerHTML = html;
  const script = html.indexOf('var maidr = ');
  let spec: Maidr;
  if (script !== -1) {
    spec = JSON.parse(objectAt(html, html.indexOf('{', script))) as Maidr;
  } else {
    const attribute = /\smaidr(?:-data)?=(['"])(\{[\s\S]*?\})\1/.exec(html);
    if (attribute === null) {
      throw new Error(`${page} declares no spec`);
    }
    spec = JSON.parse(unescapeHtml(attribute[2])) as Maidr;
  }
  return spec.subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * The elements a selector names.
 *
 * @param selector - The selector
 * @returns Its matches, in document order
 */
function marks(selector: string): Element[] {
  return [...document.querySelectorAll(selector)];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an authored example\'s data is what its marks draw', () => {
  it('lists no boxen outlier its distribution does not draw', () => {
    // Treatment listed an upper outlier at 130, and its group draws its four
    // rungs and its median and nothing else, so the description and the
    // table reported an outlier that is not on the chart.
    const [layer] = loadLayers('boxen.html');
    const distributions = layer.data as BoxenPoint[];

    const undrawn = distributions.filter((distribution) => {
      const outliers = [...(distribution.lowerOutliers ?? []), ...(distribution.upperOutliers ?? [])];
      return marks(`g[id='boxen-${distribution.z}'] circle`).length !== outliers.length;
    }).map(distribution => distribution.z);

    expect(distributions).toHaveLength(2);
    expect(undrawn).toEqual([]);
  });
});
