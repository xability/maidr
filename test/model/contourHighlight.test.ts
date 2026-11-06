/**
 * @jest-environment jsdom
 */
import type { ContourPoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { ContourTrace } from '@model/contour';
import { TraceType } from '@type/grammar';

/**
 * Two levels of a field. The second one has two islands, which is the case
 * the whole file is about: plotly draws one `<path>` per **curve** under one
 * `g.contourlevel` per **level**, and a producer can name the level
 * dependably and the curve within it not at all.
 *
 * Measured for xability/py-maidr#643 across 33 fields and 207 levels -- random
 * sums of gaussians, a saddle, a monkey saddle, ripples, a staircase, noise --
 * comparing plotly.js against `contourpy` on the same grid:
 *
 * ```
 * levels where the counts disagreed          0 / 207
 * levels where the order within one did     18 / 207
 * ```
 *
 * Five of the eighteen were ordinary two-peaked gaussian fields. So a
 * per-curve selector resolves to a real element and, one level in twelve, the
 * wrong one -- and the producer's only honest options were the level or
 * nothing.
 */
const ONE_CURVE: ContourPoint[] = [
  { x: 0, y: 0, level: 0.1 },
  { x: 5, y: 0, level: 0.1 },
];

const ISLAND_A: ContourPoint[] = [
  { x: 0, y: 1, level: 0.2 },
  { x: 2, y: 1, level: 0.2 },
];

const ISLAND_B: ContourPoint[] = [
  { x: 8, y: 1, level: 0.2 },
  { x: 10, y: 1, level: 0.2 },
];

/** The two islands of level 0.2, as one series the way a producer emits it. */
const ISLANDS: ContourPoint[] = [...ISLAND_A, ...ISLAND_B];

/** Where each level's paths are drawn, in SVG coordinates. */
const DRAWN = {
  first: 'M 10 100 L 60 100',
  islandA: 'M 10 200 L 30 200',
  islandB: 'M 90 200 L 110 200',
};

/**
 * A ring as a producer emits it: from its right-hand side round to where it
 * started, a closed curve repeating its first point.
 */
const RING: ContourPoint[] = [
  [4, 2],
  [4, 4],
  [2, 4],
  [0, 4],
  [0, 2],
  [0, 0],
  [2, 0],
  [4, 0],
  [4, 2],
].map(([x, y]) => ({ x, y, level: 0.3 }));

/**
 * The same ring as a renderer draws it: from another corner, with a vertex at
 * each corner and none between, x running right and y down, 10 to 110.
 */
const RING_DRAWN = 'M 10 10 L 110 10 L 110 110 L 10 110 Z';

/**
 * Create a contour layer whose selectors resolve against the document.
 * @param selectors - One selector per level
 * @param data - The curves the layer carries
 * @returns Contour layer definition
 */
function createLayer(selectors: string[], data: ContourPoint[][]): MaidrLayer {
  return {
    id: 'test-contour-highlight',
    type: TraceType.CONTOUR,
    title: 'Density field',
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Density' } },
    selectors,
    data,
  };
}

/**
 * Put a rendered contour in the document, one group per level.
 *
 * The nesting is plotly's, measured in Chromium: a `g.contourlevel` per
 * level, holding one `<path>` per disjoint curve.
 * @param levels - The `d` attribute of every path, grouped by level
 */
function renderContour(levels: string[][]): void {
  const groups = levels
    .map((paths, i) => {
      const drawn = paths.map(d => `<path d="${d}"></path>`).join('');
      return `<g class="contourlevel" id="level-${i}">${drawn}</g>`;
    })
    .join('');
  document.body.innerHTML = `
      <svg id="chart" xmlns="http://www.w3.org/2000/svg">
        <g class="contourlayer">${groups}</g>
      </svg>`;
}

/**
 * jsdom implements `SVGElement` but none of the per-tag SVG interfaces, so
 * `element instanceof SVGPathElement` -- the branch `LineTrace` uses to decide
 * it is looking at a path -- throws. Define it here so the branch is
 * reachable, matching a browser rather than changing it.
 */
function defineSvgPathElement(): void {
  if ('SVGPathElement' in globalThis) {
    return;
  }
  Object.defineProperty(globalThis, 'SVGPathElement', {
    configurable: true,
    writable: true,
    value: class SVGPathElementShim {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return value instanceof SVGElement && value.tagName === 'path';
      }
    },
  });
}

/**
 * The `d` of every element the trace would outline, in order.
 *
 * Flat rather than grouped by point, because what is being asserted is which
 * elements a walk of the level touches and in what order -- a synthesised
 * circle has no `d` and comes back as an empty string.
 * @param trace - The trace to read
 * @returns One entry per highlight element
 */
function outlined(trace: ContourTrace): string[] {
  return trace
    .getAllHighlightElements()
    .map(element => element.getAttribute('d') ?? '');
}

/** Every synthesised highlight circle in the document, in order. */
function circles(): { x: number; y: number }[] {
  return Array.from(document.querySelectorAll('circle')).map(circle => ({
    x: Number(circle.getAttribute('cx')),
    y: Number(circle.getAttribute('cy')),
  }));
}

/**
 * {@link circles}, to the nearest unit: a point marked on a slanted segment
 * lands between whole coordinates.
 */
function roundedCircles(): { x: number; y: number }[] {
  return circles().map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
}

describe('contour highlight mapping', () => {
  beforeEach(() => {
    defineSvgPathElement();
    document.body.innerHTML = '';
  });

  test('a level drawn as one curve keeps its per-point highlight', () => {
    // Unchanged, and it is the case py-maidr#643 ships today: when every
    // drawn level draws a single curve the count agreement above forces one
    // mapping, so the curve is addressable and the reader gets a highlight
    // that walks with them.
    renderContour([[DRAWN.first]]);
    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [ONE_CURVE]));

    expect(circles()).toEqual([
      { x: 10, y: 100 },
      { x: 60, y: 100 },
    ]);
  });

  test('a ring drawn with fewer vertices than points is marked at each point', () => {
    // Plotly draws a contour from its own pass over the grid and matplotlib
    // drops vertices from a long path, so a curve seldom arrives with a vertex
    // per point. Spread by x between the path's first and last vertex, which
    // on this ring share one x, every point was marked at the same corner.
    renderContour([[RING_DRAWN]]);

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [RING]));

    expect(circles()).toEqual([
      { x: 110, y: 60 },
      { x: 110, y: 10 },
      { x: 60, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 60 },
      { x: 10, y: 110 },
      { x: 60, y: 110 },
      { x: 110, y: 110 },
      { x: 110, y: 60 },
    ]);
  });

  test('a curve drawn with its y axis reversed is marked on the side drawn', () => {
    // The box a curve spans is the same box whichever way an axis runs, so
    // the way is the one that lays the points on the path. Spread by x, the
    // five points up the right-hand side were all marked at its foot.
    renderContour([['M 10 10 L 110 10 L 110 110']]);
    const corner: ContourPoint[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
    ].map(([x, y]) => ({ x, y, level: 0.3 }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [corner]));

    expect(circles()).toEqual([
      { x: 10, y: 10 },
      { x: 35, y: 10 },
      { x: 60, y: 10 },
      { x: 85, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 35 },
      { x: 110, y: 60 },
      { x: 110, y: 85 },
      { x: 110, y: 110 },
    ]);
  });

  test('a ring symmetric both ways is marked where its points are', () => {
    // Every way of drawing the axes lays this ring's points on its path, and
    // its first point is off both axes of symmetry, so a mirror image would
    // show. The usual way -- x to the right, y up -- is the one kept.
    renderContour([[RING_DRAWN]]);
    const ring: ContourPoint[] = [
      [4, 1],
      [4, 3],
      [3, 4],
      [1, 4],
      [0, 3],
      [0, 1],
      [1, 0],
      [3, 0],
      [4, 1],
    ].map(([x, y]) => ({ x, y, level: 0.3 }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [ring]));

    expect(circles()).toEqual([
      { x: 110, y: 85 },
      { x: 110, y: 35 },
      { x: 85, y: 10 },
      { x: 35, y: 10 },
      { x: 10, y: 35 },
      { x: 10, y: 85 },
      { x: 35, y: 110 },
      { x: 85, y: 110 },
      { x: 110, y: 85 },
    ]);
  });

  test('a ring a renderer drew a little out of true is not marked as its mirror image', () => {
    // The left side is drawn bent in by 2px, and most of the points are on
    // it. Mirrored left to right, they all land on the straight right side,
    // which fits the path better than the truth does, and every point was
    // marked across the ring from where it is.
    renderContour([['M 10 10 L 110 10 L 110 110 L 10 110 L 12 60 Z']]);
    const ring: ContourPoint[] = [
      [0, 1],
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 3],
      [0, 2],
      [0, 1],
    ].map(([x, y]) => ({ x, y, level: 0.3 }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [ring]));

    expect(roundedCircles()).toEqual([
      { x: 11, y: 85 },
      { x: 10, y: 110 },
      { x: 110, y: 110 },
      { x: 110, y: 10 },
      { x: 10, y: 10 },
      { x: 11, y: 35 },
      { x: 12, y: 60 },
      { x: 11, y: 85 },
    ]);
  });

  test('a curve drawn in two pieces is marked on them, not on a line between them', () => {
    // A path of two subpaths read as one run of vertices joins them with a
    // segment the path never draws, and the point in the gap was marked on
    // it, in the gap.
    renderContour([['M 10 110 L 50 110 M 70 110 L 110 110 L 110 10']]);
    const corner: ContourPoint[] = [
      [0, 0],
      [1, 0],
      [1.8, 0],
      [3, 0],
      [4, 0],
      [4, 2],
      [4, 4],
    ].map(([x, y]) => ({ x, y, level: 0.3 }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [corner]));

    expect(roundedCircles()).toEqual([
      { x: 10, y: 110 },
      { x: 35, y: 110 },
      { x: 50, y: 110 },
      { x: 85, y: 110 },
      { x: 110, y: 110 },
      { x: 110, y: 60 },
      { x: 110, y: 10 },
    ]);
  });

  test('a curve with no height, drawn with some, keeps the line chart\'s reading', () => {
    // The box a flat curve spans cannot be laid onto a path that has a height,
    // so the points are spread by x as on a line chart.
    renderContour([['M 10 100 L 60 50 L 110 100']]);
    const flat: ContourPoint[] = [0, 1, 2, 3, 4].map(x => ({ x, y: 1, level: 0.3 }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [flat]));

    expect(circles()).toEqual([
      { x: 10, y: 100 },
      { x: 35, y: 75 },
      { x: 60, y: 50 },
      { x: 85, y: 75 },
      { x: 110, y: 100 },
    ]);
  });

  test('a level matplotlib draws as one path of two rings marks each island on its own ring', () => {
    // py-maidr's two-peaked contour: matplotlib draws a level as one path with
    // a subpath per island, and py-maidr names that path for each island's
    // series. Read as Vega-Lite's shared selector, every series looked for a
    // match of the first series' selector: the single-ring level kept its
    // highlight and both islands had none.
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="set">
          <path d="M 40 40 L 60 40 L 60 60 L 40 40 z"></path>
          <path d="M 10 10 L 30 10 L 30 30 L 10 10 z M 70 70 L 90 70 L 90 90 L 70 70 z"></path>
        </g>
      </svg>`;
    const curve = (level: number, corners: number[][]): ContourPoint[] =>
      corners.map(([x, y]) => ({ x, y, level }));

    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(
      ['g#set > path:nth-of-type(1)', 'g#set > path:nth-of-type(2)', 'g#set > path:nth-of-type(2)'],
      [
        curve(0.1, [[4, 4], [6, 4], [6, 2], [4, 4]]),
        curve(0.2, [[1, 7], [3, 7], [3, 5], [1, 7]]),
        curve(0.2, [[7, 1], [9, 1], [9, -1], [7, 1]]),
      ],
    ));

    expect(circles()).toEqual([
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 40 },
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 10 },
      { x: 70, y: 70 },
      { x: 90, y: 70 },
      { x: 90, y: 90 },
      { x: 70, y: 70 },
    ]);
  });

  test('a level drawn as islands outlines the whole level', () => {
    // The change. A selector resolving to several paths is a level rather
    // than a curve, and every point of that series outlines all of them --
    // which is the reading matplotlib's contour has always given, since it
    // draws one <path> per level and naming the level names an element.
    renderContour([[DRAWN.islandA, DRAWN.islandB]]);
    const trace = new ContourTrace(
      createLayer(['g#level-0 path'], [ISLANDS]),
    );

    expect(outlined(trace)).toEqual(
      ISLANDS.flatMap(() => [DRAWN.islandA, DRAWN.islandB]),
    );
  });

  test('an island level does not synthesise circles from one island', () => {
    // What it did before, and the reason a level outline is the honest
    // answer rather than a lesser one: `mapViaPathParsing` takes the FIRST
    // match and parses its `d`, so every point of the level -- including the
    // two on the far island -- was marked along island A.
    renderContour([[DRAWN.islandA, DRAWN.islandB]]);
    // eslint-disable-next-line no-new
    new ContourTrace(createLayer(['g#level-0 path'], [ISLANDS]));

    expect(circles()).toEqual([]);
  });

  test('one level of islands does not cost the others their points', () => {
    // Decided per level rather than per layer. A field usually has islands
    // at some levels and not others, and a reader on a single-curve level
    // keeps the better highlight.
    renderContour([[DRAWN.first], [DRAWN.islandA, DRAWN.islandB]]);
    const trace = new ContourTrace(
      createLayer(
        ['g#level-0 path', 'g#level-1 path'],
        [ONE_CURVE, ISLANDS],
      ),
    );

    expect(circles()).toEqual([
      { x: 10, y: 100 },
      { x: 60, y: 100 },
    ]);
    expect(outlined(trace).slice(ONE_CURVE.length)).toEqual(
      ISLANDS.flatMap(() => [DRAWN.islandA, DRAWN.islandB]),
    );
  });

  test('resolving one level does not shift the next one', () => {
    // The levels are resolved without cloning, which is not incidental:
    // `Svg.selectAllElements` otherwise inserts a hidden copy beside every
    // match, and a positional selector resolved afterwards counts siblings
    // the chart never drew and answers with the copy of an earlier one
    // (#1004). Plotly's own contour selectors are positional
    // (`g.contourlevel:nth-of-type(k)`), so this is the shape that arrives.
    renderContour([[DRAWN.islandA, DRAWN.islandB], [DRAWN.first]]);
    const trace = new ContourTrace(
      createLayer(
        [
          'g.contourlevel:nth-of-type(1) path',
          'g.contourlevel:nth-of-type(2) path',
        ],
        [ISLANDS, ONE_CURVE],
      ),
    );

    // The elements outlined are the chart's own live paths, by identity --
    // a hidden copy has the same `d` and shows nothing when highlighted, so
    // comparing attributes would pass either way.
    const drawn = Array.from(document.querySelectorAll('#level-0 path'));
    const outlinedPaths = trace
      .getAllHighlightElements()
      .filter(element => element.tagName === 'path');
    expect(new Set(outlinedPaths)).toEqual(new Set(drawn));

    // Level 2 draws one curve, so it keeps its per-point markers -- and they
    // are placed along the curve level 2 actually draws.
    expect(circles()).toEqual([
      { x: 10, y: 100 },
      { x: 60, y: 100 },
    ]);
  });

  test('a layer with the wrong number of selectors highlights nothing', () => {
    // "One selector per level, resolving to nothing" and "not one selector
    // per level" are different answers, and the parent already gives the
    // second one: `null`, which every reader of `highlightValues` treats as
    // "this trace has no highlight". Turning it into a row of empties instead
    // leaves the cursor indexing a row that is not there.
    renderContour([[DRAWN.islandA, DRAWN.islandB], [DRAWN.first]]);
    const trace = new ContourTrace(
      createLayer(['g#level-0 path'], [ISLANDS, ONE_CURVE]),
    );

    trace.moveToIndex(1, 0);
    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.highlight.empty).toBe(true);
    }
  });

  test('a level whose selector finds nothing highlights nothing', () => {
    renderContour([[DRAWN.first]]);
    const trace = new ContourTrace(
      createLayer(['g#no-such-level path'], [ONE_CURVE]),
    );

    expect(trace.getAllHighlightElements()).toEqual([]);
  });
});
