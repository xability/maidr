/**
 * Which element a segmented cell is paired with, for each mark tag (#1003).
 *
 * `SegmentedTrace.mapToSvgElements` used to pick its pairing strategy from the
 * tag of the first element its selector resolved, and the two branches
 * disagreed about what an undeclared `domMapping` meant:
 *
 *   path branch:  `if (isRowMajor || !this.layer.domMapping)`   → row-major
 *   rect branch:  `const isRowMajor = ...?.order === 'row'`     → column-major
 *
 * Same layer, same DOM, same absent `domMapping`, opposite pairings — decided
 * by the tag the charting library happened to draw. Highcharts drew `<rect>`
 * through v10 and `<path>` from v11 with no change to its DOM order, so an
 * upgrade flipped it in either direction with no code change on either side.
 * A mark that was neither tag fell through both branches and left the layer
 * with no highlight at all.
 *
 * There is one strategy now, and one default. The tag decides nothing, which
 * is what these cases hold: every combination of mark and declaration, and the
 * two tags asserted against each other rather than one at a time.
 *
 *   branch    declared    pairing
 *   path      (none)      row-major
 *   rect      (none)      row-major
 *   neither   (none)      row-major
 *   any       row         row-major
 *   any       column      column-major, series reversed within a category
 *
 * Row-major is the default because no producer in the tree relies on the other
 * answer: every `<rect>` producer declares `order: 'row'`, and every producer
 * that declares nothing draws `<path>`, where row was already the default. A
 * producer that draws each category's segments bottom-up -- the convention
 * `groupsRunForward` describes -- declares `order: 'column'` and gets what the
 * rect branch used to hand it silently.
 *
 * **jsdom decides the branch, not the markup.** It builds every SVG child as a
 * plain `SVGElement` and defines neither `SVGPathElement` nor `SVGRectElement`,
 * so `domElements[0] instanceof SVGPathElement` answered whatever a test bound
 * those globals to. The idiom used elsewhere in `test/model` binds rect to
 * `SVGElement` and path to a stub that matches nothing, which pinned the rect
 * branch for every test that copied it — regardless of whether its fixture said
 * `<rect>` or `<path>`. Reading such a result as though it described a
 * `<path>`-drawing library is how #1001 came to be filed and withdrawn. The
 * bindings stay explicit here: they no longer choose a strategy, and a case
 * that finds they do again is the regression.
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
  it('walks a series-major DOM series by series when nothing is declared', () => {
    expect(pairedBars('path')).toEqual(OWN_BAR);
  });

  it('answers the same whichever tag the marks are', () => {
    // The whole of #1003, as one assertion. Same layer, same DOM, same absent
    // `domMapping`: a library that changes its mark tag between majors, as
    // Highcharts did between v10 and v11, no longer flips how its cells pair.
    expect(pairedBars('rect')).toEqual(pairedBars('path'));
    expect(pairedBars('rect')).toEqual(OWN_BAR);
  });

  it('pairs a mark that is neither tag like any other', () => {
    // This used to fall through both branches and report no highlight at all
    // — silently, which reads as a chart with no marks rather than as a
    // mistake. Nothing in the tree draws such a mark; a d3 user could, since
    // their DOM is their own.
    expect(pairedBars('neither')).toEqual(OWN_BAR);
  });

  it('answers the same on every branch once row is declared', () => {
    expect(pairedBars('path', 'row')).toEqual(OWN_BAR);
    expect(pairedBars('rect', 'row')).toEqual(OWN_BAR);
    expect(pairedBars('neither', 'row')).toEqual(OWN_BAR);
  });

  it('answers the same on every branch once column is declared', () => {
    // Column-major is still reachable, and is what a producer drawing each
    // category's segments bottom-up asks for. It is just no longer something
    // a layer can end up with by drawing the wrong tag.
    expect(pairedBars('path', 'column')).toEqual(CATEGORY_MAJOR);
    expect(pairedBars('rect', 'column')).toEqual(CATEGORY_MAJOR);
    expect(pairedBars('neither', 'column')).toEqual(CATEGORY_MAJOR);
  });
});
