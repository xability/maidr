/**
 * Which end of a reversed Highcharts category axis `data[0]` sits at (#995).
 *
 * `buildSegmentedRows` places each value under its own category index, which is
 * what makes Highcharts immune to the data-order bug plotly (#987) and
 * Vega-Lite (#994) have. But the categories are the *axis'*, and `xAxis.
 * reversed` draws `categories[0]` at the right-hand end — so the announcements
 * ran the opposite way from the bars.
 *
 * Measured on Highcharts 12 in Chromium, `categories: ['alpha','bravo',
 * 'charlie']`, reading each rendered point's own box:
 *
 *   chart                            xAxis.reversed   drawn left → right
 *   {type:'column'}                  undefined        alpha@105, bravo@313, charlie@522
 *   {type:'column'} + reversed       true             charlie@105, bravo@313, alpha@522
 *   stacked column + reversed        true             charlie@127, bravo@335, alpha@544
 *
 * MAIDR announced `alpha, bravo, charlie` in all three.
 *
 * The DOM does **not** move with the axis. The same measurement, reading the
 * elements in document order rather than by position:
 *
 *   column plain      h105@105  h210@313  h315@522
 *   column reversed   h105@522  h210@313  h315@105
 *
 * That is why both halves have to move together. Reversing the rows alone
 * would leave `data[0] = charlie` pointing at `DOM[0] = alpha`'s bar — trading
 * a correct highlight for a wrong one, which is worse than the direction bug
 * it set out to fix (the #988 trap).
 *
 * Two things the fixture has to imitate, both measured rather than assumed:
 *
 *   series [10, null, 0, 40]   →  3 elements, at the alpha, charlie and delta
 *                                 slots. A `null` renders nothing; a genuine
 *                                 `0` renders an element.
 *
 * So a DOM position is a count of *drawn* points, not of categories, and a
 * group with a gap has no element for some cell to name.
 */

import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { highchartsToMaidr } from '@adapters/highcharts/adapter';
import { afterEach, describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { SegmentedTrace } from '@model/segmented';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';
import { fakeAxis, fakeChart, fakeSeries } from './helpers';

const CATEGORIES = ['alpha', 'bravo', 'charlie'];
const CONTAINER = 'reversed-bar';

/** The selector prefix every emitted bar selector shares. */
const GROUP = `#${CONTAINER} .highcharts-series-group`;

/**
 * Points for a category series, carrying nulls through as Highcharts does.
 * @param values - One value per category, `null` for a category not drawn
 * @returns Points positioned by category index
 */
function points(values: (number | null)[]): { x: number; y: number | null; category: string }[] {
  return values.map((y, i) => ({ x: i, y, category: CATEGORIES[i] }));
}

/**
 * The layer one chart converts to.
 * @param input          - The series values, one array per series
 * @param reversed       - Whether the category axis declares `reversed`
 * @param type           - The series type the chart declares
 * @param stacking       - How the series stack, if they do
 * @returns The emitted layer
 */
function layerFor(
  input: (number | null)[][],
  reversed: boolean,
  type: 'bar' | 'column' = 'column',
  stacking?: string,
): MaidrLayer {
  const xAxis = fakeAxis({ categories: CATEGORIES, reversed });
  const chart = fakeChart({
    type,
    renderToId: CONTAINER,
    plotOptions: stacking ? { series: { stacking } } : undefined,
    series: input.map((values, index) => fakeSeries({
      index,
      type,
      xAxis,
      data: points(values),
    })),
  });

  const layer = highchartsToMaidr(chart).subplots[0][0].layers[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
}

/** The category each row of a segmented layer announces, in order. */
function categoriesOf(layer: MaidrLayer): unknown[] {
  return (layer.data as SegmentedPoint[][])[0].map(cell => cell.x);
}

describe('a Highcharts bar chart on a reversed category axis', () => {
  it('leaves an ordinary column chart in the data\'s order', () => {
    const layer = layerFor([[10, 20, 30]], false);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['alpha', 'bravo', 'charlie']);
    expect(layer.selectors).toBe(`${GROUP} .highcharts-series-0 .highcharts-point`);
  });

  it('reads a reversed column chart the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30]], true);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('names each bar so the reversed reading still outlines its own bar', () => {
    // The half that reversing the data alone would get wrong: the DOM stays in
    // data order, so `data[0] = charlie` has to name the *third* element.
    const layer = layerFor([[10, 20, 30]], true);

    expect(layer.selectors).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('counts a bar\'s position among the bars actually drawn', () => {
    // `bravo` is null, so Highcharts draws two elements and `charlie` is the
    // second — not the third its category index would suggest.
    const layer = layerFor([[10, null, 30]], true);

    expect((layer.data as BarPoint[]).map(point => point.x))
      .toEqual(['charlie', 'alpha']);
    expect(layer.selectors).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('leaves a sideways chart alone', () => {
    // Highcharts sets `xAxis.reversed` itself on every chart it draws
    // sideways, so the flag cannot separate those from a column chart whose
    // author asked for a reversal. The resolved orientation can, since #997 —
    // and which end of a horizontal bar's category axis `data[0]` belongs at
    // is a convention `MaidrLayer.orientation` does not fix.
    const layer = layerFor([[10, 20, 30]], true, 'bar');

    expect((layer.data as BarPoint[]).map(point => point.y))
      .toEqual(['alpha', 'bravo', 'charlie']);
    expect(layer.selectors).toBe(`${GROUP} .highcharts-series-0 .highcharts-point`);
  });
});

describe('a segmented Highcharts bar group on a reversed category axis', () => {
  it('leaves an unreversed stacked group in the data\'s order', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], false, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['alpha', 'bravo', 'charlie']);
    // Named per cell either way. The order is what a reversed axis changes;
    // the naming is what stops a zero being mistaken for an absent bar, and
    // that is not a question about the axis (#1002).
    expect((layer.selectors as (string | null)[][])[0]).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
    ]);
  });

  it('reads a reversed stacked group the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.data as SegmentedPoint[][])[1].map(cell => cell.y))
      .toEqual([3, 2, 1]);
  });

  it('names one element per cell, per series', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(layer.selectors).toEqual([
      [
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
        `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
      ],
      [
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(3)`,
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(2)`,
        `${GROUP} .highcharts-series-1 .highcharts-point:nth-child(1)`,
      ],
    ]);
  });

  it('counts a genuine zero, which Highcharts does draw', () => {
    // The distinction the DOM positions turn on. A zero-valued cell still has
    // an element, so it takes a place and everything after it keeps counting
    // past it — addressing by non-zero cells instead would shift `alpha` and
    // `bravo` onto each other's bars.
    const layer = layerFor([[10, 0, 30], [1, 2, 3]], true, 'column', 'normal');

    expect((layer.selectors as (string | null)[][])[0]).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(3)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('names nothing for a cell the chart never drew', () => {
    // Series A has no `bravo` bar, so its middle cell names no element rather
    // than a selector that would resolve to nothing -- which `SegmentedTrace`
    // treats as a mistake and answers by declining the whole grid.
    const layer = layerFor([[10, null, 30], [1, 2, 3]], true, 'column', 'normal');

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.selectors as (string | null)[][])[0]).toEqual([
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(2)`,
      null,
      `${GROUP} .highcharts-series-0 .highcharts-point:nth-child(1)`,
    ]);
  });

  it('reads a reversed dodged group the way it is drawn', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true);

    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.selectors as (string | null)[][])[1][0])
      .toBe(`${GROUP} .highcharts-series-1 .highcharts-point:nth-child(3)`);
  });

  it('reads a reversed diverging pair the way it is drawn', () => {
    // Two series that never share a side of the baseline are drawn back to
    // back; the payload is the segmented one, so the reversal reaches it too.
    const layer = layerFor([[10, 20, 30], [-1, -2, -3]], true, 'column', 'normal');

    // Asserted so the case cannot quietly become another stacked one: the
    // pair is only diverging while the two series stay on opposite sides.
    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(categoriesOf(layer)).toEqual(['charlie', 'bravo', 'alpha']);
    expect((layer.data as SegmentedPoint[][])[1].map(cell => cell.y))
      .toEqual([-3, -2, -1]);
  });
});

/**
 * A document holding one element per bar, under the structure the emitted
 * selectors reach through and in the order Highcharts lays them out: each
 * series' points together, in the series' own data order, whichever way the
 * axis runs.
 *
 * jsdom builds every SVG child as a plain `SVGElement` and defines neither
 * `SVGPathElement` nor `SVGRectElement`, so which branch of
 * `SegmentedTrace.mapToSvgElements` runs is decided by these bindings rather
 * than by the markup. A grid is resolved before that branch and so is not
 * affected either way, but the path branch is bound here regardless, since
 * `<path>` is what Highcharts 11 and 12 draw (#1003).
 *
 * @param seriesCount - How many series the chart drew
 * @param drawn - Categories each series has a bar at, when not all of them
 */
function installDom(
  seriesCount: number,
  drawn: Record<number, string[]> = {},
): void {
  const groups = Array
    .from({ length: seriesCount }, (_, series) =>
      `<g class="highcharts-series-${series}">${
        (drawn[series] ?? CATEGORIES)
          .map(category =>
            `<path class="highcharts-point" id="S${series}-${category}"/>`)
          .join('')
      }</g>`)
    .join('');

  const dom = new JSDOM(
    `<!doctype html><body><div id="${CONTAINER}">`
    + `<svg xmlns="http://www.w3.org/2000/svg"><g class="highcharts-series-group">`
    + `${groups}</g></svg></div></body>`,
  );

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.document = dom.window.document;
  globals.SVGElement = dom.window.SVGElement;
  globals.SVGPathElement = dom.window.SVGElement;
  globals.SVGRectElement = class NeverMatches {};
}

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.document;
  delete globals.SVGElement;
  delete globals.SVGPathElement;
  delete globals.SVGRectElement;
});

/**
 * The id of the bar a trace outlines at each cell, row by row.
 * @param trace - The trace to drive
 * @param rows - How many series it carries
 * @returns One id per cell, or a marker where nothing was outlined
 */
function outlined(trace: BarTrace | SegmentedTrace, rows: number): string[] {
  const seen = new Array<string>();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < CATEGORIES.length; column++) {
      trace.moveToIndex(row, column);
      const state = trace.state as Extract<TraceState, { empty: false }>;
      const highlight = state.highlight as { empty?: boolean; elements?: unknown };
      const element = highlight.elements as { id?: string } | undefined;
      // An element with no id is the placeholder the model stands in for a
      // cell that names none -- distinct from there being no element at all.
      seen.push(element === undefined ? '(none)' : element.id || '(placeholder)');
    }
  }
  return seen;
}

describe('what a reversed Highcharts bar chart actually outlines', () => {
  // Asserting the selector strings says the payload is right; only resolving
  // them says the reader sees the right bar. #990 was a layer that emitted a
  // sound-looking selector shape and lost its highlight entirely, so the
  // resolution is worth pinning rather than inferring.

  it('outlines each bar of a plain reversed chart in the drawn order', () => {
    const layer = layerFor([[10, 20, 30]], true);
    installDom(1);

    expect(outlined(new BarTrace(layer), 1))
      .toEqual(['S0-charlie', 'S0-bravo', 'S0-alpha']);
  });

  it('outlines each cell of a reversed stacked group in the drawn order', () => {
    const layer = layerFor([[10, 20, 30], [1, 2, 3]], true, 'column', 'normal');
    installDom(2);

    expect(outlined(new SegmentedTrace(layer), 2)).toEqual([
      'S0-charlie',
      'S0-bravo',
      'S0-alpha',
      'S1-charlie',
      'S1-bravo',
      'S1-alpha',
    ]);
  });
});

describe('a segmented Highcharts group holding a bar measured at zero', () => {
  // `buildSegmentedRows` turns a gap and a real zero alike into `0`, and
  // `SegmentedTrace` reads a zero cell as one the chart may have omitted.
  // Highcharts omits only `null` -- measured, `[10, null, 0, 40]` draws three
  // elements, at the alpha, charlie and delta slots -- so a real zero took a
  // place the inference had already given away, and every cell after it in
  // that series was paired one bar early (#1002).

  it('outlines its own bar from every cell, zero included', () => {
    const layer = layerFor([[10, null, 30], [0, 20, 5]], false, 'column', 'normal');
    installDom(2, { 0: ['alpha', 'charlie'] });

    expect(outlined(new SegmentedTrace(layer), 2)).toEqual([
      'S0-alpha',
      '(placeholder)',
      'S0-charlie',
      'S1-alpha',
      'S1-bravo',
      'S1-charlie',
    ]);
  });

  it('reaches the last bar of a series that starts at zero', () => {
    // The cell the old alignment could never highlight: with `S1-alpha`
    // skipped as omittable, the row ran off the end of the element list and
    // `S1-charlie` was never anybody's.
    const layer = layerFor([[10, null, 30], [0, 20, 5]], false, 'column', 'normal');
    installDom(2, { 0: ['alpha', 'charlie'] });

    const trace = new SegmentedTrace(layer);
    trace.moveToIndex(1, 2);
    const state = trace.state as Extract<TraceState, { empty: false }>;
    const element = (state.highlight as { elements?: unknown })
      .elements as { id?: string } | undefined;

    expect(element?.id).toBe('S1-charlie');
  });
});
