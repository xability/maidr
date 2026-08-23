import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * Every authored segmented example must say which way its DOM runs (#1003).
 *
 * `SegmentedTrace.mapToSvgElements` used to choose its pairing strategy from
 * the tag of the first mark it resolved, so a `<rect>`-drawn layer that
 * declared nothing walked category by category and a `<path>`-drawn one walked
 * series by series. Now there is one strategy and one default -- row-major --
 * and a producer that draws category by category declares `order: 'column'`.
 *
 * The examples in this directory are producers, and they are the ones most
 * likely to be missed: an adapter sweep does not look at them, and two of them
 * -- `pyramid.html` and `normalized-barplot.html` -- did in fact draw
 * category-major `<rect>` marks while declaring nothing. Only the first was
 * caught, by one e2e highlight assertion; the second had no such assertion and
 * would have shipped pairing every cell with somebody else's bar.
 *
 * So this asks for the declaration outright rather than trying to infer the
 * answer from each page's SVG. An example whose DOM really is series-major
 * loses nothing by saying so, and the cost of the alternative is a highlight
 * that is silently wrong -- audio, text and braille all read from the
 * unaffected side and stay correct, which is the blind spot #814 names.
 *
 * A layer that hands over a grid of selectors is exempt: it names the element
 * for every cell outright, so there is no ordering left to infer.
 */

const SEGMENTED = new Set<string>([
  TraceType.STACKED,
  TraceType.DODGED,
  TraceType.NORMALIZED,
  TraceType.DIVERGING,
]);

const EXAMPLES = join(__dirname, '..', '..', 'examples');

interface Authored {
  page: string;
  type: string;
  order: unknown;
}

/**
 * Reads the inline `maidr` specs out of every example page.
 *
 * @returns One entry per segmented layer that leaves its DOM order to be inferred
 */
function authoredSegmentedLayers(): Authored[] {
  const found: Authored[] = [];

  const collect = (page: string, html: string): void => {
    for (const [, raw] of html.matchAll(/maidr='([^']*)'/g)) {
      let spec: unknown;
      try {
        spec = JSON.parse(unescapeHtml(raw));
      } catch {
        continue; // not an inline spec; the page builds one at runtime
      }
      for (const layer of layersOf(spec)) {
        // A grid names every cell, so nothing about order is inferred.
        if (!SEGMENTED.has(layer.type) || typeof layer.selectors !== 'string') {
          continue;
        }
        found.push({ page, type: layer.type, order: layer.domMapping?.order });
      }
    }
  };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.html')) {
        collect(path, readFileSync(path, 'utf8'));
      }
    }
  };

  walk(EXAMPLES);
  return found;
}

/**
 * Undoes the entity escaping an inline `maidr` attribute carries.
 *
 * @param raw - The attribute's text as it appears in the page
 * @returns The JSON it stands for
 */
function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&#10;/g, '\n')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

interface AuthoredLayer {
  type: string;
  selectors?: unknown;
  domMapping?: { order?: unknown };
}

/**
 * Every `layers` entry anywhere in a spec, however deeply subplots nest it.
 *
 * @param node - A spec, or any part of one
 * @returns The layers found beneath it
 */
function layersOf(node: unknown): AuthoredLayer[] {
  if (Array.isArray(node)) {
    return node.flatMap(layersOf);
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const record = node as Record<string, unknown>;
  const own = Array.isArray(record.layers)
    ? (record.layers as AuthoredLayer[]).filter(l => l && typeof l === 'object')
    : [];
  return [...own, ...Object.values(record).flatMap(layersOf)];
}

describe('an authored segmented example says which way its DOM runs', () => {
  it('finds the segmented examples to check', () => {
    // If this reaches zero the check below passes vacuously, which is how a
    // guard stops guarding without anything failing.
    expect(authoredSegmentedLayers().length).toBeGreaterThan(0);
  });

  it('declares domMapping.order on every one of them', () => {
    const undeclared = authoredSegmentedLayers()
      .filter(l => l.order !== 'row' && l.order !== 'column')
      .map(l => `${l.page} (${l.type})`);

    expect(undeclared).toEqual([]);
  });
});
