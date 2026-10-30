/**
 * @jest-environment jsdom
 */

/**
 * A violin's density curve is read one level at a time.
 *
 * Producers send a violin's outline as two points at each value, one on each
 * edge, as `docs/VIOLIN_PLOT_SPEC.md` asks. Both carry the same value and the
 * same width, so stepping through them point by point announced every reading
 * twice in a row, and the data table listed the last sampled value twice.
 */

import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { ViolinKdeTrace } from '@model/violin';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * jsdom builds every SVG child as a plain `SVGElement` and defines neither
 * `SVGPathElement` nor the other kinds the trace picks a violin's outline
 * from, so its `instanceof` checks throw unless a test binds them (#1001).
 */
function bindSvgConstructors(): void {
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.SVGPathElement = globals.SVGElement;
  globals.SVGUseElement = class NeverAUse {};
  globals.SVGPolygonElement = class NeverAPolygon {};
}

/**
 * One violin's outline as the bindings send it: a left and a right point at
 * each value, both carrying the width the violin is drawn at there.
 * @param name - The violin's category
 * @param ys - The values the curve is sampled at, bottom first
 * @param widths - The violin's width at each of them
 * @param centre - Where the violin is drawn across the page
 * @returns The points, left then right at each value
 */
function pairedCurve(name: string, ys: number[], widths: number[], centre: number): ViolinKdePoint[] {
  return ys.flatMap((y, i) => [
    { x: name, y, width: widths[i], svg_x: centre - widths[i] * 50, svg_y: 300 - y * 10 },
    { x: name, y, width: widths[i], svg_x: centre + widths[i] * 50, svg_y: 300 - y * 10 },
  ]);
}

const SETOSA = pairedCurve('setosa', [4.3, 4.8, 5.3, 5.8], [0.2, 0.8, 0.5, 0.1], 100);
const VERSICOLOR = pairedCurve('versicolor', [4.9, 5.9, 7], [0.3, 0.9, 0.2], 200);

/**
 * A violin KDE layer over {@link SETOSA} and {@link VERSICOLOR}.
 * @param orientation - Which way the violins stand
 * @param data - The curves, one per violin
 * @param selectors - The violins' outlines, when the test draws them
 * @returns The layer
 */
function kdeLayer(
  orientation: Orientation = Orientation.VERTICAL,
  data: ViolinKdePoint[][] = [SETOSA, VERSICOLOR],
  selectors?: string[],
): MaidrLayer {
  return {
    id: 'kde',
    type: TraceType.VIOLIN_KDE,
    orientation,
    axes: { x: { label: 'Species' }, y: { label: 'Sepal length' } },
    ...(selectors === undefined ? {} : { selectors }),
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ViolinKdeTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Every value a reader hears walking one violin's curve end to end.
 * @param trace - The trace, not yet entered
 * @param along - The key that moves along the curve
 * @returns The value announced at each stop, in order
 */
function walk(trace: ViolinKdeTrace, along: 'UPWARD' | 'FORWARD'): unknown[] {
  trace.moveOnce(along);
  const heard = [nonEmptyState(trace).text.cross?.value];
  while (trace.moveOnce(along)) {
    heard.push(nonEmptyState(trace).text.cross?.value);
  }
  return heard;
}

describe('walking a violin drawn as edge pairs', () => {
  test('reaches a new value at every step up the curve', () => {
    const trace = new ViolinKdeTrace(kdeLayer());

    expect(walk(trace, 'UPWARD')).toEqual([4.3, 4.8, 5.3, 5.8]);
  });

  test('reaches a new value at every step along a violin lying on its side', () => {
    // Lying on its side, the violins are listed bottom first, so the first
    // one reached is the last one sent.
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.HORIZONTAL));

    expect(walk(trace, 'FORWARD')).toEqual([4.9, 5.9, 7]);
  });

  test('gives braille one cell per value', () => {
    const trace = new ViolinKdeTrace(kdeLayer());
    trace.moveOnce('UPWARD');

    const { braille } = nonEmptyState(trace);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect((braille.values as number[][]).map(row => row.length)).toEqual([4, 3]);
  });

  test('keeps a curve sent one point per value as it was', () => {
    const single: ViolinKdePoint[][] = [[
      { x: 'g', y: 1, density: 0.1 },
      { x: 'g', y: 2, density: 0.5 },
      { x: 'g', y: 3, density: 0.2 },
    ]];
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL, single));

    expect(walk(trace, 'UPWARD')).toEqual([1, 2, 3]);
  });

  test('keeps two points apart when they read differently', () => {
    // The same value at two widths is two readings, not one drawn twice.
    const uneven: ViolinKdePoint[][] = [[
      { x: 'g', y: 1, width: 0.1 },
      { x: 'g', y: 1, width: 0.3 },
      { x: 'g', y: 2, width: 0.2 },
    ]];
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL, uneven));

    expect(walk(trace, 'UPWARD')).toEqual([1, 1, 2]);
  });
});

describe('the data table of a violin drawn as edge pairs', () => {
  test('lists each sampled value once', () => {
    const table = new ViolinKdeTrace(kdeLayer()).description.dataTable;

    expect(table.rows).toEqual([
      ['setosa', 4.3, 0.2],
      ['setosa', 4.8, 0.8],
      ['setosa', 5.3, 0.5],
      ['setosa', 5.8, 0.1],
      ['versicolor', 4.9, 0.3],
      ['versicolor', 5.9, 0.9],
      ['versicolor', 7, 0.2],
    ]);
  });

  test('does not repeat the top of a curve the bindings sample at fifteen values', () => {
    // py-maidr and r-maidr send fifteen values a violin, thirty points. Read
    // as points, every other one was tabled and then the last one again: the
    // top of each violin came out twice.
    const ys = Array.from({ length: 15 }, (_, i) => 326 + i * 100);
    const curve = pairedCurve('Ideal', ys, ys.map((_, i) => 0.5 - i * 0.03), 100);
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL, [curve]));

    const { stats, dataTable } = trace.description;

    expect(dataTable.rows.map(row => row[1])).toEqual(ys);
    expect(stats.find(stat => stat.label === 'Points per curve')?.value).toBe(15);
  });
});

describe('the highlight of a violin drawn as edge pairs', () => {
  beforeEach(() => {
    bindSvgConstructors();
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><path class="violin" /><path class="violin" /></svg>`;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('marks both edges of the violin at the value being read', () => {
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL, [SETOSA, VERSICOLOR], ['.violin']));
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    const { highlight } = nonEmptyState(trace);
    if (highlight.empty) {
      throw new Error('Expected a highlighted level');
    }
    const elements = Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements];

    // setosa at 4.8 is 0.8 wide: drawn from 60 to 140 across the page.
    expect(elements.map(element => [
      Number(element.getAttribute('cx')),
      Number(element.getAttribute('cy')),
    ])).toEqual([[60, 252], [140, 252]]);
  });

  test('still draws a marker at every point sent', () => {
    const trace = new ViolinKdeTrace(kdeLayer(Orientation.VERTICAL, [SETOSA, VERSICOLOR], ['.violin']));

    expect(trace.getAllHighlightElements()).toHaveLength(SETOSA.length + VERSICOLOR.length);
  });
});
