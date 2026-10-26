/**
 * @jest-environment jsdom
 */

import type { MaidrLayer } from '@type/grammar';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Every authored stacked bar example lists its series from the bottom of the
 * stack up.
 *
 * A stacked bar's row 0 is its bottom segment: Up moves to the next series,
 * and the Sum row sits on top of the stack (`docs/CONTROLS.md`). A layer whose
 * first series is the top segment is read upside down -- Up walks down the
 * drawing and reaches the Sum row from the bottom segment -- while its values,
 * its names and its highlight are all right, so nothing short of walking the
 * stack shows it. `normalized-barplot.html` listed its channels top first.
 *
 * So each example is walked the way a reader walks it, up each column, and
 * where every highlighted segment is drawn is read back. Only `<rect>` marks
 * are measured, because a rect's `y` is where it is drawn.
 */

const STACKED = new Set<string>([
  TraceType.STACKED,
  TraceType.NORMALIZED,
]);

const EXAMPLES = join(__dirname, '..', '..', 'examples');

interface AuthoredStack {
  page: string;
  html: string;
  layer: MaidrLayer;
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

/**
 * Every `layers` entry anywhere in a spec, however deeply subplots nest it.
 *
 * @param node - A spec, or any part of one
 * @returns The layers found beneath it
 */
function layersOf(node: unknown): MaidrLayer[] {
  if (Array.isArray(node)) {
    return node.flatMap(layersOf);
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const record = node as Record<string, unknown>;
  const own = Array.isArray(record.layers)
    ? (record.layers as MaidrLayer[]).filter(layer => layer && typeof layer === 'object')
    : [];
  return [...own, ...Object.values(record).flatMap(layersOf)];
}

/**
 * The stacked layers the example pages author inline and draw with `<rect>`.
 *
 * @returns One entry per such layer, with the page it is drawn in
 */
function authoredStacks(): AuthoredStack[] {
  const found: AuthoredStack[] = [];

  const collect = (page: string, html: string): void => {
    for (const [, raw] of html.matchAll(/maidr='([^']*)'/g)) {
      let spec: unknown;
      try {
        spec = JSON.parse(unescapeHtml(raw));
      } catch {
        continue; // not an inline spec; the page builds one at runtime
      }
      for (const layer of layersOf(spec)) {
        if (STACKED.has(layer.type) && typeof layer.selectors === 'string'
          && /(?:^|[\s>])rect\b/.test(layer.selectors)) {
          found.push({ page, html, layer });
        }
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
 * Where the highlight of each series is drawn, up one column of a stack.
 *
 * @param stack - The example and its layer
 * @param column - Which category to walk
 * @returns The `y` of the highlighted segment, series by series
 */
function heightsUpColumn(stack: AuthoredStack, column: number): number[] {
  document.body.innerHTML = stack.html;
  const trace = TraceFactory.create(stack.layer);
  const series = (stack.layer.data as unknown[]).length;

  const heights = new Array<number>();
  for (let row = 0; row < series; row++) {
    trace.moveToIndex(row, column);
    const state = trace.state;
    const element = state.empty || state.type !== 'trace' || state.highlight.empty
      ? null
      : state.highlight.elements;
    heights.push(element instanceof Element ? Number(element.getAttribute('y')) : Number.NaN);
  }
  trace.dispose();
  return heights;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an authored stacked bar example lists its series from the bottom up', () => {
  it('finds the stacked examples to check', () => {
    // If this reaches zero the check below passes vacuously, which is how a
    // guard stops guarding without anything failing.
    expect(authoredStacks().length).toBeGreaterThan(0);
  });

  it('draws each next series above the one before, in every column', () => {
    const upsideDown = authoredStacks().flatMap((stack) => {
      const columns = ((stack.layer.data as unknown[][])[0] ?? []).length;
      return Array.from({ length: columns }, (_, column) => heightsUpColumn(stack, column))
        .filter(heights => heights.some((y, row) => row > 0 && !(y < heights[row - 1])))
        .map(heights => `${stack.page.slice(EXAMPLES.length + 1)} (${stack.layer.type}): ${heights.join(' -> ')}`);
    });

    expect(upsideDown).toEqual([]);
  });
});
