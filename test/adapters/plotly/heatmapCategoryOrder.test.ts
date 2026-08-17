/**
 * @jest-environment jsdom
 */

/**
 * A plotly heatmap has to be emitted in the order plotly draws it (#985).
 *
 * `categoryorder` sorts a categorical axis and leaves the trace's own `x`,
 * `y` and `z` exactly as the author wrote them, so the labels alone do not
 * say what the chart shows. Reading them straight off the trace produced a
 * payload whose every label still sat on its own value — nothing looked
 * broken — describing a grid in the wrong place: arrowing across walked one
 * order while the chart showed another, and the highlight, which
 * `createOverlayRects` positions purely by index, outlined a third cell.
 *
 * Measured on plotly.js in Chromium for `x: ['charlie','alpha','bravo']` and
 * `y: ['r2','r3','r1']`, reading each brick's own centre through the axis'
 * `l2p`:
 *
 *   layout                       _categories x        drawn left to right
 *   (none)                       charlie alpha bravo  charlie alpha bravo
 *   xaxis.categoryorder asc      alpha bravo charlie  alpha bravo charlie
 *   xaxis.autorange reversed     charlie alpha bravo  bravo alpha charlie
 *
 *   layout                       _categories y        drawn top to bottom
 *   (none)                       r2 r3 r1             r1 r3 r2
 *   yaxis.categoryorder asc      r1 r2 r3             r3 r2 r1
 *
 * So `_categories` is the drawn order counted from the axis origin — left for
 * x, bottom for y — and a reversed axis flips the direction without touching
 * the list. Plotly's own calc step agrees: `calcdata[0][0].z` comes out
 * permuted into `_categories` order while `trace.z` does not.
 */

import type { PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { HeatmapData } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An axis drawn from its low end: left to right, or bottom to top. */
const FORWARD = [-0.5, 2.5];
/** A reversed axis, which plotly resolves to a high-to-low range. */
const BACKWARD = [2.5, -0.5];

/** Columns in the order the trace names them. */
const X = ['charlie', 'alpha', 'bravo'];
/** Rows in the order the trace names them; plotly draws the first at the bottom. */
const Y = ['r2', 'r3', 'r1'];
/** `z[i][j]` names its own source coordinates: row i+1, column j+1. */
const Z = [[11, 12, 13], [21, 22, 23], [31, 32, 33]];

interface AxisSpec {
  range?: number[];
  categories?: string[];
}

/**
 * A rendered plotly div holding one heatmap.
 * @param x - What the x axis resolved to
 * @param y - What the y axis resolved to
 * @returns The graph div
 */
function graphDiv(x: AxisSpec, y: AxisSpec): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = [
    { type: 'heatmap', x: X, y: Y, z: Z } as unknown as PlotlyTrace,
  ];
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    xaxis: { type: 'category', range: x.range ?? FORWARD, _categories: x.categories ?? X },
    yaxis: { type: 'category', range: y.range ?? FORWARD, _categories: y.categories ?? Y },
  };
  return gd;
}

/**
 * The heatmap data a plotly div converts to.
 * @param x - What the x axis resolved to
 * @param y - What the y axis resolved to
 * @returns The emitted data
 */
function dataFor(x: AxisSpec = {}, y: AxisSpec = {}): HeatmapData {
  const layer = extractPlotlyData(graphDiv(x, y))?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer.data as HeatmapData;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a heatmap plotly draws in the trace\'s own order', () => {
  it('keeps the columns as the trace names them', () => {
    expect(dataFor().x).toEqual(X);
  });

  it('turns the rows over, since plotly counts them from the bottom', () => {
    expect(dataFor().y).toEqual(['r1', 'r3', 'r2']);
    expect(dataFor().points).toEqual([[31, 32, 33], [21, 22, 23], [11, 12, 13]]);
  });
});

describe('a heatmap whose columns plotly re-sorts', () => {
  const sorted: AxisSpec = { categories: ['alpha', 'bravo', 'charlie'] };

  it('emits the columns left to right as drawn', () => {
    // Before the fix this was ['charlie', 'alpha', 'bravo'] — the trace's own
    // order, which is not what the chart shows.
    expect(dataFor(sorted).x).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('moves every value with its column', () => {
    // Row 'r1' is the trace's third, so 11-series values are its bottom row.
    expect(dataFor(sorted).points).toEqual([[32, 33, 31], [22, 23, 21], [12, 13, 11]]);
  });

  it('leaves the rows where they were', () => {
    expect(dataFor(sorted).y).toEqual(['r1', 'r3', 'r2']);
  });
});

describe('a heatmap whose rows plotly re-sorts', () => {
  const sorted: AxisSpec = { categories: ['r1', 'r2', 'r3'] };

  it('emits the rows top to bottom as drawn', () => {
    // `_categories` counts from the bottom, so the drawn order is its reverse.
    expect(dataFor({}, sorted).y).toEqual(['r3', 'r2', 'r1']);
  });

  it('moves every row of values with its label', () => {
    // 'r3' is the trace's second row, 'r2' its first, 'r1' its third.
    expect(dataFor({}, sorted).points).toEqual([[21, 22, 23], [11, 12, 13], [31, 32, 33]]);
  });
});

describe('a reversed axis', () => {
  it('draws the columns right to left, so they come back reversed', () => {
    expect(dataFor({ range: BACKWARD }).x).toEqual(['bravo', 'alpha', 'charlie']);
    expect(dataFor({ range: BACKWARD }).points).toEqual([
      [33, 32, 31],
      [23, 22, 21],
      [13, 12, 11],
    ]);
  });

  it('draws the rows top-first, so they are left alone', () => {
    expect(dataFor({}, { range: BACKWARD }).y).toEqual(Y);
    expect(dataFor({}, { range: BACKWARD }).points).toEqual(Z);
  });

  it('composes with a re-sorted order rather than replacing it', () => {
    // The sort decides which category sits where along the axis; the reversal
    // decides which end that axis starts from. Both apply.
    const sorted: AxisSpec = { range: BACKWARD, categories: ['alpha', 'bravo', 'charlie'] };

    expect(dataFor(sorted).x).toEqual(['charlie', 'bravo', 'alpha']);
    expect(dataFor(sorted).points[2]).toEqual([11, 13, 12]);
  });
});

describe('an order that does not describe the grid', () => {
  it('declines a category list naming more than the trace draws', () => {
    // Measured: a `categoryarray` naming absent categories makes plotly draw
    // empty columns, which `HeatmapData.points` cannot express. Keeping the
    // trace's order loses the sort; inventing a column would lose the truth.
    const extras: AxisSpec = { categories: ['zulu', 'charlie', 'alpha', 'bravo'] };

    expect(dataFor(extras).x).toEqual(X);
  });

  it('declines a category list missing one the trace draws', () => {
    expect(dataFor({ categories: ['alpha', 'bravo'] }).x).toEqual(X);
  });

  it('declines a category the trace does not carry', () => {
    // Same length, so a length check alone would let this past and emit a
    // column of values under a label that is not theirs.
    expect(dataFor({ categories: ['alpha', 'bravo', 'delta'] }).x).toEqual(X);
  });

  it('declines when the trace repeats a label', () => {
    // There is no unambiguous cell to send each category to.
    const div = graphDiv({}, {});
    (div as unknown as { _fullData: PlotlyTrace[] })._fullData = [
      { type: 'heatmap', x: ['a', 'a', 'b'], y: Y, z: Z } as unknown as PlotlyTrace,
    ];
    (div as unknown as { _fullLayout: { xaxis: { _categories: string[] } } })
      ._fullLayout
      .xaxis
      ._categories = ['b', 'a', 'a'];

    const layer = extractPlotlyData(div)?.subplots[0][0].layers[0];

    expect((layer?.data as HeatmapData).x).toEqual(['a', 'a', 'b']);
  });
});

describe('an axis with no categories at all', () => {
  it('falls back to the trace, as a numeric axis has none to give', () => {
    expect(dataFor({ categories: [] }).x).toEqual(X);
  });
});
