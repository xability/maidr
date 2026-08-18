/**
 * Which element a segmented cell is paired with, on each branch (#1003).
 *
 * `SegmentedTrace.mapToSvgElements` picks its pairing strategy from the tag of
 * the first element its selector resolves, and the two branches disagree about
 * what an undeclared `domMapping` means:
 *
 *   path branch:  `if (isRowMajor || !this.layer.domMapping)`   → row-major
 *   rect branch:  `const isRowMajor = ...?.order === 'row'`     → column-major
 *
 * Measured, one two-by-three group over a series-major DOM, every combination:
 *
 *   branch  declared    pairing
 *   path    (none)      row-major
 *   path    row         row-major
 *   path    column      column-major, series reversed within a category
 *   rect    (none)      column-major, series reversed within a category
 *   rect    row         row-major
 *   rect    column      column-major, series reversed within a category
 *
 * Only the undeclared row differs. That is the whole of the asymmetry, and it
 * is why a library changing its mark tag between majors — Highcharts drew
 * `<rect>` through v10 and `<path>` from v11, with the same DOM order — can
 * flip a layer's pairing with no code change on either side.
 *
 * Nothing in the tree relies on it: every `<rect>` producer declares
 * `order: 'row'`, and every producer that declares nothing draws `<path>`.
 * These cases pin the current answers so that a change to either default is a
 * decision someone makes rather than one that happens.
 *
 * **jsdom decides the branch, not the markup.** It builds every SVG child as a
 * plain `SVGElement` and defines neither `SVGPathElement` nor `SVGRectElement`,
 * so `domElements[0] instanceof SVGPathElement` answers whatever the test binds
 * those globals to. The idiom used elsewhere in `test/model` binds rect to
 * `SVGElement` and path to a stub that matches nothing, which pins the rect
 * branch for every test that copies it — regardless of whether its fixture says
 * `<rect>` or `<path>`. Reading such a result as though it described a
 * `<path>`-drawing library is how #1001 came to be filed and withdrawn.
 */

import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { afterEach, describe, expect, it } from '@jest/globals';
import { SegmentedTrace } from '@model/segmented';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];

/** Six bars, series-major, the order every measured library lays them out in. */
const BARS = [
  'A-alpha',
  'A-bravo',
  'A-charlie',
  'B-alpha',
  'B-bravo',
  'B-charlie',
];

/** Each cell paired with its own bar. */
const OWN_BAR = BARS;

/**
 * What column-major pairing makes of a series-major DOM: it walks each
 * category through the series, last series first, so nothing lands on the bar
 * its own point names.
 */
const CATEGORY_MAJOR = [
  'A-bravo',
  'B-alpha',
  'B-charlie',
  'A-alpha',
  'A-charlie',
  'B-bravo',
];

/**
 * Installs a document and says outright which branch of `mapToSvgElements` the
 * case means, rather than leaving it to jsdom.
 *
 * @param branch - `path` or `rect` to take that branch; `neither` for a mark
 * that is neither, which no adapter draws today but a d3 user could
 */
function installDom(branch: 'path' | 'rect' | 'neither'): void {
  const dom = new JSDOM(
    '<!doctype html><svg xmlns="http://www.w3.org/2000/svg">'
    + `${BARS.map(id => `<path class="bar" id="${id}"/>`).join('')}</svg>`,
  );

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.document = dom.window.document;
  globals.SVGElement = dom.window.SVGElement;
  globals.SVGPathElement = branch === 'path'
    ? dom.window.SVGElement
    : class NeverAPath {};
  globals.SVGRectElement = branch === 'rect'
    ? dom.window.SVGElement
    : class NeverARect {};
}

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.document;
  delete globals.SVGElement;
  delete globals.SVGPathElement;
  delete globals.SVGRectElement;
});

/**
 * The id of the bar each cell is paired with, row by row.
 * @param branch - Which branch the marks should be taken for
 * @param order - The `domMapping.order` to declare, or nothing
 * @returns One id per cell, or a marker where no element was paired
 */
function pairedBars(
  branch: 'path' | 'rect' | 'neither',
  order?: 'row' | 'column',
): string[] {
  installDom(branch);

  const layer: MaidrLayer = {
    id: '0',
    type: TraceType.STACKED,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    selectors: 'path.bar',
    ...(order ? { domMapping: { order } } : {}),
    data: [
      CATEGORIES.map((x, i) => ({ x, y: (i + 1) * 10, z: 'A' })),
      CATEGORIES.map((x, i) => ({ x, y: i + 1, z: 'B' })),
    ] as SegmentedPoint[][],
  };

  const trace = new SegmentedTrace(layer);
  const seen = new Array<string>();
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < CATEGORIES.length; column++) {
      trace.moveToIndex(row, column);
      const state = trace.state as Extract<TraceState, { empty: false }>;
      const element = (state.highlight as { elements?: unknown })
        .elements as { id?: string } | undefined;
      seen.push(element?.id || '(none)');
    }
  }
  return seen;
}

describe('how a segmented layer pairs its cells with the DOM', () => {
  it('walks a path-marked layer series by series when nothing is declared', () => {
    expect(pairedBars('path')).toEqual(OWN_BAR);
  });

  it('walks a rect-marked layer category by category when nothing is declared', () => {
    // The same layer and the same DOM as above, and every cell paired with
    // somebody else's bar. Only the mark's tag differs.
    expect(pairedBars('rect')).toEqual(CATEGORY_MAJOR);
  });

  it('answers the same on both branches once row is declared', () => {
    expect(pairedBars('path', 'row')).toEqual(OWN_BAR);
    expect(pairedBars('rect', 'row')).toEqual(OWN_BAR);
  });

  it('answers the same on both branches once column is declared', () => {
    expect(pairedBars('path', 'column')).toEqual(CATEGORY_MAJOR);
    expect(pairedBars('rect', 'column')).toEqual(CATEGORY_MAJOR);
  });

  it('pairs nothing at all with a mark that is neither', () => {
    // Not a wish: `mapToSvgElements` has a branch for each of the two tags and
    // no fallback, so a layer drawn as anything else reports no highlight —
    // silently, which reads as a chart with no marks rather than as a mistake.
    expect(pairedBars('neither')).toEqual(Array.from({ length: 6 }, () => '(none)'));
  });
});
