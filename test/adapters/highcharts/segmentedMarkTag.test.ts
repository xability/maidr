/**
 * A Highcharts segmented bar no longer depends on its mark's tag (#1003).
 *
 * `SegmentedTrace.mapToSvgElements` picks its pairing strategy from the tag of
 * the first element the selector resolves, and the two branches disagree about
 * what an undeclared `domMapping` means -- the path branch reads a series-major
 * DOM, the rect branch a category-major one. Highcharts drew `<rect>` marks
 * through v10 and `<path>` from v11 with no change to the DOM order, so the
 * same chart and the same adapter paired differently across a major upgrade.
 *
 * That exposure is gone, and not because either default moved. #1005 made all
 * four segmented builders name **every cell** rather than hand over one
 * selector for the model to chunk, and `mapToSvgElements` routes a grid before
 * it ever looks at a tag:
 *
 *   if (Array.isArray(selector)) {
 *     return this.mapGridToSvgElements(selector);
 *   }
 *
 * So these cases run the whole adapter, then resolve the layer against a real
 * document twice -- once with `SVGPathElement` bound so the marks match it,
 * once with `SVGRectElement` -- and expect the same pairing both times. They
 * fail if a builder ever goes back to a single selector string, which is the
 * only way the tag could start to matter again.
 *
 * **jsdom decides the branch, not the markup.** It builds every SVG child as a
 * plain `SVGElement` and defines neither constructor, so `instanceof` answers
 * whatever a test binds those globals to. The fixture writes real `<rect>` and
 * `<path>` marks anyway, but it is the binding that selects the branch;
 * reading a result as though the markup had chosen it is how #1001 came to be
 * filed and withdrawn.
 */

import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterEach, describe, expect, it } from '@jest/globals';
import { DivergingTrace } from '@model/diverging';
import { SegmentedTrace } from '@model/segmented';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];
const CONTAINER = 'mark-tag';

/** Each cell paired with its own bar, series by series. */
const OWN_BAR = [
  's0-alpha',
  's0-bravo',
  's0-charlie',
  's1-alpha',
  's1-bravo',
  's1-charlie',
];

/**
 * The layer one stacked group converts to.
 *
 * @param values - One array of values per series
 * @returns The emitted layer
 */
function layerFor(values: number[][]): MaidrLayer {
  const xAxis = fakeAxis({ categories: CATEGORIES, reversed: false });
  const chart = fakeChart({
    type: 'column',
    renderToId: CONTAINER,
    plotOptions: { series: { stacking: 'normal' } },
    series: values.map((row, index) => fakeSeries({
      index,
      type: 'column',
      xAxis,
      data: row.map((y, i) => ({ x: i, y, category: CATEGORIES[i] })),
    })),
  });

  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
}

/**
 * Installs the document Highcharts draws, and says outright which branch of
 * `mapToSvgElements` the marks are to be taken for.
 *
 * @param branch - `path` or `rect`; the fixture draws that tag either way
 */
function installDom(branch: 'path' | 'rect'): void {
  const series = [0, 1].map(index => `<g class="highcharts-series-${index}">${
    CATEGORIES.map(
      category => `<${branch} class="highcharts-point" id="s${index}-${category}"/>`,
    ).join('')
  }</g>`).join('');

  const dom = new JSDOM(
    `<!doctype html><div id="${CONTAINER}"><svg xmlns="http://www.w3.org/2000/svg">`
    + `<g class="highcharts-series-group">${series}</g></svg></div>`,
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
 *
 * @param values - One array of values per series
 * @param branch - Which branch the marks should be taken for
 * @returns One id per cell, or a marker where no element was paired
 */
function pairedBars(values: number[][], branch: 'path' | 'rect'): string[] {
  const layer = layerFor(values);
  installDom(branch);

  // A diverging layer is a segmented one with the sides read in declaration
  // order and a balance row appended, so it has to be built as itself: reading
  // it as a plain stack would answer about a class the adapter never emits.
  const trace = layer.type === TraceType.DIVERGING
    ? new DivergingTrace(layer)
    : new SegmentedTrace(layer);
  const rows = layer.data as SegmentedPoint[][];
  const seen = new Array<string>();
  for (let row = 0; row < rows.length; row++) {
    for (let column = 0; column < rows[row].length; column++) {
      trace.moveToIndex(row, column);
      const state = trace.state as Extract<TraceState, { empty: false }>;
      const element = (state.highlight as { elements?: unknown })
        .elements as { id?: string } | undefined;
      seen.push(element?.id || '(none)');
    }
  }
  return seen;
}

describe('a Highcharts segmented bar and the mark-tag branches', () => {
  it('names every cell rather than handing over one selector', () => {
    // The property the two cases below rest on. A string here would put the
    // layer back on the tag-decided path.
    expect(layerFor([[10, 20, 30], [1, 2, 3]]).selectors).toEqual([
      [
        `#${CONTAINER} .highcharts-series-group .highcharts-series-0 .highcharts-point:nth-child(1)`,
        `#${CONTAINER} .highcharts-series-group .highcharts-series-0 .highcharts-point:nth-child(2)`,
        `#${CONTAINER} .highcharts-series-group .highcharts-series-0 .highcharts-point:nth-child(3)`,
      ],
      [
        `#${CONTAINER} .highcharts-series-group .highcharts-series-1 .highcharts-point:nth-child(1)`,
        `#${CONTAINER} .highcharts-series-group .highcharts-series-1 .highcharts-point:nth-child(2)`,
        `#${CONTAINER} .highcharts-series-group .highcharts-series-1 .highcharts-point:nth-child(3)`,
      ],
    ]);
  });

  it('pairs each cell with its own bar when the marks are paths', () => {
    expect(pairedBars([[10, 20, 30], [1, 2, 3]], 'path')).toEqual(OWN_BAR);
  });

  it('pairs each cell with its own bar when the marks are rects', () => {
    // The v10 case the tag branch would get wrong: an undeclared `domMapping`
    // on the rect side means category-major, which over this series-major DOM
    // pairs no cell with its own bar. The grid is read before that is asked.
    expect(pairedBars([[10, 20, 30], [1, 2, 3]], 'rect')).toEqual(OWN_BAR);
  });

  it('pairs a diverging pair the same way on either branch', () => {
    // The one builder that declares `domMapping: { order: 'row' }`. It is the
    // right answer if the tag branch is ever reached again, and unreachable
    // today for the same reason as the two above.
    const values = [[10, 20, 30], [-1, -2, -3]];

    expect(layerFor(values).type).toBe(TraceType.DIVERGING);
    expect(pairedBars(values, 'path')).toEqual(OWN_BAR);
    expect(pairedBars(values, 'rect')).toEqual(OWN_BAR);
  });
});
